import type { Request } from 'express';
import type { Types } from 'mongoose';

import {
  SEARCH_ENTITY_LABELS,
  SEARCH_FILTER_SUPPORT,
  SEARCH_STATUS_OPTIONS,
  SearchEntityTypeSchema,
  type GlobalSearchQuery,
  type GlobalSearchResponse,
  type SearchEntityType,
  type SearchFilterKey,
  type SearchResult,
  type WorkerPermission,
} from '@assetdesk/contracts';

import { hasServerPermission } from '../auth/auth.middleware.js';
import { CartridgeModel } from '../cartridges/cartridge.model.js';
import { GatePassModel } from '../cartridges/gate-pass.model.js';
import { InventoryGatePassModel } from '../inventory-gate-passes/inventory-gate-pass.model.js';
import { AssetUnitModel } from '../inventory/asset-unit.model.js';
import { buildMaterialListFilter } from '../inventory/inventory.service.js';
import { MaterialModel } from '../inventory/material.model.js';
import { IssueModel } from '../issues/issue.model.js';
import {
  buildIssueSearchFilter,
  materialIdsMatchingDetails,
  searchTokens,
} from '../issues/issue.service.js';
import { ReceiverModel } from '../receivers/receiver.model.js';
import { UserModel } from '../users/user.model.js';

export type SearchActor = NonNullable<Request['auth']>;

type Filter = Record<string, unknown>;

interface Matcher {
  phrase: RegExp | null;
  tokens: RegExp[];
}

interface TypeResult {
  total: number;
  results: SearchResult[];
}

interface Candidate {
  label: string;
  value: string | null | undefined;
}

const TYPE_ORDER = SearchEntityTypeSchema.options;
const FILTER_KEYS: SearchFilterKey[] = ['category', 'trackingMode', 'location', 'block'];

const TYPE_PERMISSIONS: Record<Exclude<SearchEntityType, 'EMPLOYEE'>, WorkerPermission> = {
  ISSUE: 'ISSUES_VIEW',
  MATERIAL: 'INVENTORY_VIEW',
  ASSET_UNIT: 'INVENTORY_VIEW',
  CARTRIDGE: 'CARTRIDGES_VIEW',
  CARTRIDGE_GATE_PASS: 'CARTRIDGE_GATE_PASSES_VIEW',
  GATE_PASS: 'GATE_PASS_VIEW',
  RECEIVER: 'RECEIVERS_VIEW',
};

function escapeSearchRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function exact(value: string): RegExp {
  return new RegExp(`^${escapeSearchRegex(value.trim())}$`, 'i');
}

function modeLabel(mode: string | undefined): string {
  return mode === 'QUANTITY' ? 'IT Consumable' : 'IT Asset';
}

function humanize(value: string): string {
  const text = value.replaceAll('_', ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function compact(values: Array<string | null | undefined>): string[] {
  return values.map((value) => value?.trim()).filter((value): value is string => Boolean(value));
}

export function buildMatcher(q: string | undefined): Matcher {
  if (!q) return { phrase: null, tokens: [] };
  return {
    phrase: new RegExp(escapeSearchRegex(q.trim()), 'i'),
    tokens: searchTokens(q).map((token) => new RegExp(escapeSearchRegex(token), 'i')),
  };
}

/** Each search word must appear in at least one of the fields. */
export function textClauses(fields: readonly string[], matcher: Matcher): Filter[] {
  return matcher.tokens.map((token) => ({ $or: fields.map((field) => ({ [field]: token })) }));
}

/** Prefers a field containing the whole phrase, then any field containing a word. */
export function detectMatch(
  candidates: Candidate[],
  matcher: Matcher,
): { field: string; value: string } | null {
  if (!matcher.phrase) return null;
  const present = candidates.filter((candidate): candidate is { label: string; value: string } =>
    Boolean(candidate.value),
  );
  const whole = present.find((candidate) => matcher.phrase?.test(candidate.value));
  const partial = whole ?? present.find((c) => matcher.tokens.some((token) => token.test(c.value)));
  return partial ? { field: partial.label, value: partial.value } : null;
}

function withClauses(filter: Filter, clauses: Filter[]): Filter {
  if (!clauses.length) return filter;
  return { ...filter, $and: [...((filter.$and as Filter[] | undefined) ?? []), ...clauses] };
}

function mergeExactFirst<T extends { _id: Types.ObjectId }>(
  exactRecords: T[],
  records: T[],
  limit: number,
): T[] {
  const seen = new Set<string>();
  return [...exactRecords, ...records]
    .filter((record) => {
      const id = record._id.toString();
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, limit);
}

function dateRange(query: GlobalSearchQuery): { $gte?: Date; $lt?: Date } | null {
  if (!query.dateFrom && !query.dateTo) return null;
  return {
    ...(query.dateFrom ? { $gte: new Date(`${query.dateFrom}T00:00:00+05:30`) } : {}),
    ...(query.dateTo
      ? { $lt: new Date(new Date(`${query.dateTo}T00:00:00+05:30`).getTime() + 86_400_000) }
      : {}),
  };
}

function normalizedStatus(query: GlobalSearchQuery): string | undefined {
  return query.status?.trim().toUpperCase();
}

export function typeSupportsFilters(type: SearchEntityType, query: GlobalSearchQuery): boolean {
  if (FILTER_KEYS.some((key) => query[key] && !SEARCH_FILTER_SUPPORT[key].includes(type))) {
    return false;
  }
  if (type === 'ASSET_UNIT' && query.trackingMode === 'QUANTITY') return false;
  const status = normalizedStatus(query);
  return !status || (SEARCH_STATUS_OPTIONS[type] ?? []).includes(status);
}

export function permittedTypes(actor: SearchActor): SearchEntityType[] {
  return TYPE_ORDER.filter((type) =>
    type === 'EMPLOYEE'
      ? actor.role === 'ADMIN'
      : hasServerPermission(actor, TYPE_PERMISSIONS[type]),
  );
}

interface Context {
  actor: SearchActor;
  query: GlobalSearchQuery;
  matcher: Matcher;
  limit: number;
  range: ReturnType<typeof dateRange>;
  status: string | undefined;
}

function ownerId(context: Context, area: 'issues' | 'inventory' | 'cartridges') {
  const { actor } = context;
  return actor.role === 'ADMIN' || actor.dataAccess[area] === 'ALL' ? null : actor.userId;
}

interface IssueSearchRecord {
  _id: Types.ObjectId;
  issueId: string;
  status: string;
  issuedAt: Date;
  purpose?: string;
  destinationLocation?: string;
  destinationBlock?: string;
  receiver: {
    fullName: string;
    receiverCode: string;
    universityId?: string;
    department?: string;
    contact?: string;
    email?: string;
  };
  issuedBy: { name: string; workerId: string };
  lines: Array<{
    material: {
      materialCode: string;
      name: string;
      category: string;
      trackingMode: string;
      description?: string;
      store?: string;
    };
    assets?: Array<{ assetTag: string; serialNumber?: string }>;
  }>;
}

async function searchIssues(context: Context): Promise<TypeResult> {
  const { query, matcher } = context;
  const clauses: Filter[] = [];
  const owner = ownerId(context, 'issues');
  if (owner) {
    clauses.push({
      $or: [{ createdByUserId: owner }, { 'returnEvents.performedBy.userId': owner }],
    });
  }
  if (query.q) {
    const materialIds = await materialIdsMatchingDetails(query.q);
    clauses.push(buildIssueSearchFilter(query.q, materialIds) as Filter);
  }
  const line: Filter = {
    ...(query.category ? { 'material.category': exact(query.category) } : {}),
    ...(query.trackingMode ? { 'material.trackingMode': query.trackingMode } : {}),
  };
  if (Object.keys(line).length) clauses.push({ lines: { $elemMatch: line } });
  if (query.location) clauses.push({ destinationLocation: exact(query.location) });
  if (query.block) {
    clauses.push({
      $or: [
        { destinationBlock: exact(query.block) },
        { destinationBlock: { $exists: false }, destinationLocation: exact(query.block) },
      ],
    });
  }
  const filter = withClauses(
    {
      ...(context.status ? { status: context.status } : {}),
      ...(context.range ? { issuedAt: context.range } : {}),
    },
    clauses,
  );
  const [records, total] = await Promise.all([
    IssueModel.find(filter)
      .select(
        'issueId status issuedAt purpose destinationLocation destinationBlock receiver issuedBy.name issuedBy.workerId lines.material lines.assets.assetTag lines.assets.serialNumber',
      )
      .sort({ issuedAt: -1, _id: -1 })
      .limit(context.limit)
      .lean<IssueSearchRecord[]>(),
    IssueModel.countDocuments(filter),
  ]);
  return {
    total,
    results: records.map((record) => {
      const lineCandidates = record.lines.flatMap((issueLine, index) => [
        ...(issueLine.assets ?? []).flatMap((asset) => [
          { label: 'Serial number', value: asset.serialNumber, index },
          { label: 'Asset tag', value: asset.assetTag, index },
        ]),
        { label: 'Material code', value: issueLine.material.materialCode, index },
        { label: 'Material', value: issueLine.material.name, index },
        { label: 'Category', value: issueLine.material.category, index },
        { label: 'Description', value: issueLine.material.description, index },
        { label: 'Source store', value: issueLine.material.store, index },
      ]);
      const candidates = [
        { label: 'Issue ID', value: record.issueId, index: -1 },
        ...lineCandidates,
        { label: 'Receiver', value: record.receiver.fullName, index: -1 },
        { label: 'Receiver code', value: record.receiver.receiverCode, index: -1 },
        { label: 'University ID', value: record.receiver.universityId, index: -1 },
        { label: 'Department', value: record.receiver.department, index: -1 },
        { label: 'Contact', value: record.receiver.contact, index: -1 },
        { label: 'Email', value: record.receiver.email, index: -1 },
        { label: 'Location', value: record.destinationLocation, index: -1 },
        { label: 'Block', value: record.destinationBlock, index: -1 },
        { label: 'Purpose', value: record.purpose, index: -1 },
        { label: 'Issued by', value: record.issuedBy.name, index: -1 },
        { label: 'Worker ID', value: record.issuedBy.workerId, index: -1 },
      ];
      const match = detectMatch(candidates, matcher);
      const matchedLine =
        record.lines[
          candidates.find((c) => c.label === match?.field && c.value === match.value)?.index ?? -1
        ] ?? record.lines[0];
      const identifier =
        match && ['Serial number', 'Asset tag'].includes(match.field) ? match : null;
      const materials = [...new Set(record.lines.map((issueLine) => issueLine.material.name))];
      return {
        type: 'ISSUE' as const,
        key: `ISSUE:${record.issueId}`,
        title: `${record.issueId} · ${record.receiver.fullName}`,
        subtitle:
          compact([
            materials.length > 1 ? `${materials[0]} + ${materials.length - 1} more` : materials[0],
            compact([record.destinationBlock, record.destinationLocation]).join(' / '),
          ]).join(' · ') || null,
        status: record.status,
        matchedField: match?.field ?? (query.q ? 'Material configuration' : null),
        matchedValue: match?.value ?? null,
        path: compact([
          'Issues',
          modeLabel(matchedLine?.material.trackingMode),
          matchedLine?.material.category,
          record.issueId,
          identifier ? `${identifier.field} ${identifier.value}` : null,
        ]),
        href: `/issues/${encodeURIComponent(record.issueId)}`,
        occurredAt: record.issuedAt.toISOString(),
      };
    }),
  };
}

interface MaterialSearchRecord {
  _id: Types.ObjectId;
  materialCode: string;
  name: string;
  category: string;
  typeModelName?: string;
  configuration?: string;
  store?: string;
  location?: string;
  block?: string;
  locationBlock?: string;
  department?: string;
  vendorName?: string;
  description?: string;
  trackingMode: string;
  status: string;
  totalQuantity: number;
  availableQuantity: number;
  unitLabel?: string;
  createdAt: Date;
}

const MATERIAL_FIELDS = [
  'materialCode',
  'name',
  'category',
  'typeModelName',
  'configuration',
  'store',
  'location',
  'block',
  'locationBlock',
  'department',
  'vendorName',
  'description',
] as const;

const MATERIAL_SELECT =
  'materialCode name category typeModelName configuration store location block locationBlock department vendorName description trackingMode status totalQuantity availableQuantity unitLabel createdAt';

function materialPath(material: Partial<MaterialSearchRecord> | undefined): string[] {
  if (!material) return ['Inventory'];
  return compact([
    'Inventory',
    modeLabel(material.trackingMode),
    material.category,
    material.typeModelName || material.name,
    material.trackingMode === 'SERIALIZED' ? material.configuration : null,
    material.store ?? material.locationBlock ?? material.location,
  ]);
}

function materialBaseFilter(context: Context, overrides: { trackingMode?: string } = {}): Filter {
  const { actor, query, range } = context;
  const createdTo = range?.$lt ? new Date(range.$lt.getTime() - 1) : undefined;
  const trackingMode = overrides.trackingMode ?? query.trackingMode;
  return buildMaterialListFilter({
    page: 1,
    pageSize: 1,
    role: actor.role,
    actorUserId: actor.userId,
    dataScope: actor.dataAccess.inventory,
    ...(trackingMode === 'SERIALIZED' || trackingMode === 'QUANTITY' ? { trackingMode } : {}),
    ...(query.category ? { category: query.category } : {}),
    ...(query.location ? { location: query.location } : {}),
    ...(query.block ? { block: query.block } : {}),
    ...(range?.$gte ? { createdFrom: range.$gte } : {}),
    ...(createdTo ? { createdTo } : {}),
  });
}

async function searchMaterials(context: Context): Promise<TypeResult> {
  const { matcher, query } = context;
  const base = materialBaseFilter(context);
  // Workers are always restricted to ACTIVE stock by the shared inventory filter.
  if (context.status && context.actor.role === 'ADMIN') base.status = context.status;
  const filter = withClauses(base, textClauses(MATERIAL_FIELDS, matcher));
  const exactFilter = query.q ? { ...filter, materialCode: query.q.trim().toUpperCase() } : null;
  const [exactRecords, records, total] = await Promise.all([
    exactFilter
      ? MaterialModel.find(exactFilter)
          .select(MATERIAL_SELECT)
          .limit(1)
          .lean<MaterialSearchRecord[]>()
      : Promise.resolve([]),
    MaterialModel.find(filter)
      .select(MATERIAL_SELECT)
      .sort({ updatedAt: -1, _id: -1 })
      .limit(context.limit)
      .lean<MaterialSearchRecord[]>(),
    MaterialModel.countDocuments(filter),
  ]);
  return {
    total,
    results: mergeExactFirst(exactRecords, records, context.limit).map((material) => {
      const match = detectMatch(
        [
          { label: 'Material code', value: material.materialCode },
          { label: 'Model', value: material.typeModelName },
          { label: 'Configuration', value: material.configuration },
          { label: 'Material', value: material.name },
          { label: 'Category', value: material.category },
          { label: 'Store', value: material.store },
          { label: 'Location', value: material.location },
          { label: 'Block', value: material.block },
          { label: 'Department', value: material.department },
          { label: 'Vendor', value: material.vendorName },
          { label: 'Description', value: material.description },
        ],
        matcher,
      );
      return {
        type: 'MATERIAL' as const,
        key: `MATERIAL:${material.materialCode}`,
        title: material.typeModelName || material.name,
        subtitle: compact([
          material.materialCode,
          material.trackingMode === 'SERIALIZED' ? material.configuration : null,
          `${material.availableQuantity} of ${material.totalQuantity} ${material.unitLabel ?? 'units'} available`,
        ]).join(' · '),
        status: material.status,
        matchedField: match?.field ?? null,
        matchedValue: match?.value ?? null,
        path: materialPath(material),
        href: `/inventory/${encodeURIComponent(material.materialCode)}`,
        occurredAt: material.createdAt.toISOString(),
      };
    }),
  };
}

interface UnitSearchRecord {
  _id: Types.ObjectId;
  assetTag: string;
  serialNumber?: string;
  vendorName?: string;
  condition: string;
  status: string;
  materialId: Types.ObjectId;
  createdAt: Date;
}

const UNIT_FIELDS = ['assetTag', 'serialNumber', 'vendorName', 'condition'] as const;

interface HoldingIssueRecord {
  issueId: string;
  issuedAt: Date;
  receiver: { fullName: string };
  lines: Array<{ assets?: Array<{ assetTag: string }> }>;
}

async function searchAssetUnits(context: Context): Promise<TypeResult> {
  const { query, matcher } = context;
  const filter: Filter = {};
  const owner = ownerId(context, 'inventory');
  if (owner) filter.createdBy = owner;
  if (context.status) filter.status = context.status;
  if (context.range) filter.createdAt = context.range;
  if (query.category || query.location || query.block) {
    const materialIds = await MaterialModel.distinct(
      '_id',
      materialBaseFilter(context, { trackingMode: 'SERIALIZED' }),
    );
    filter.materialId = { $in: materialIds };
  }
  const filtered = withClauses(filter, textClauses(UNIT_FIELDS, matcher));
  const exactFilter = query.q
    ? { ...filtered, serialNumberNormalized: query.q.trim().toUpperCase() }
    : null;
  const select = 'assetTag serialNumber vendorName condition status materialId createdAt';
  const [exactRecords, records, total] = await Promise.all([
    exactFilter
      ? AssetUnitModel.find(exactFilter).select(select).limit(1).lean<UnitSearchRecord[]>()
      : Promise.resolve([]),
    AssetUnitModel.find(filtered)
      .select(select)
      .sort({ createdAt: -1, _id: -1 })
      .limit(context.limit)
      .lean<UnitSearchRecord[]>(),
    AssetUnitModel.countDocuments(filtered),
  ]);
  const units = mergeExactFirst(exactRecords, records, context.limit);
  const issuedTags = units.filter((unit) => unit.status === 'ISSUED').map((unit) => unit.assetTag);
  const [materials, holdingIssues] = await Promise.all([
    MaterialModel.find({ _id: { $in: units.map((unit) => unit.materialId) } })
      .select(MATERIAL_SELECT)
      .lean<MaterialSearchRecord[]>(),
    issuedTags.length
      ? IssueModel.find({ 'lines.assets.assetTag': { $in: issuedTags } })
          .select('issueId issuedAt receiver.fullName lines.assets.assetTag')
          .sort({ issuedAt: -1, _id: -1 })
          .lean<HoldingIssueRecord[]>()
      : Promise.resolve([] as HoldingIssueRecord[]),
  ]);
  const byId = new Map(materials.map((material) => [material._id.toString(), material]));
  // Newest Issue first, so an asset issued again after a return links to its current Issue.
  const issueByTag = new Map<string, HoldingIssueRecord>();
  for (const issue of holdingIssues) {
    for (const line of issue.lines) {
      for (const asset of line.assets ?? []) {
        if (!issueByTag.has(asset.assetTag)) issueByTag.set(asset.assetTag, issue);
      }
    }
  }
  return {
    total,
    results: units.map((unit) => {
      const material = byId.get(unit.materialId.toString());
      const identifier = unit.serialNumber ?? unit.assetTag;
      const match = detectMatch(
        [
          { label: 'Serial number', value: unit.serialNumber },
          { label: 'Asset tag', value: unit.assetTag },
          { label: 'Vendor', value: unit.vendorName },
          { label: 'Condition', value: unit.condition },
        ],
        matcher,
      );
      // Open the place the unit actually is: the Issue holding it, or its stock record
      // filtered to this serial. The old link opened a filtered Inventory list instead.
      const holdingIssue = unit.status === 'ISSUED' ? issueByTag.get(unit.assetTag) : undefined;
      const stockHref = material
        ? `/inventory/${encodeURIComponent(material.materialCode)}?serial=${encodeURIComponent(identifier)}`
        : `/inventory?trackingMode=SERIALIZED&search=${encodeURIComponent(identifier)}`;
      return {
        type: 'ASSET_UNIT' as const,
        key: `ASSET_UNIT:${unit.assetTag}`,
        title: identifier,
        subtitle: compact([
          unit.serialNumber ? unit.assetTag : null,
          material ? material.typeModelName || material.name : null,
          holdingIssue ? `Issued to ${holdingIssue.receiver.fullName}` : 'In stock',
          unit.condition,
        ]).join(' · '),
        status: unit.status,
        matchedField: match?.field ?? null,
        matchedValue: match?.value ?? null,
        path: holdingIssue
          ? ['Issues', holdingIssue.issueId, `Serial ${identifier}`]
          : [...materialPath(material), `Serial ${identifier}`],
        href: holdingIssue ? `/issues/${encodeURIComponent(holdingIssue.issueId)}` : stockHref,
        occurredAt: unit.createdAt.toISOString(),
      };
    }),
  };
}

interface CartridgeSearchRecord {
  _id: Types.ObjectId;
  serialNumber: string;
  cartridgeModel: string;
  compatiblePrinter?: string;
  location: string;
  department: string;
  vendorName?: string;
  currentHolderName?: string;
  currentHolderId?: string;
  notes?: string;
  status: string;
  createdAt: Date;
}

const CARTRIDGE_FIELDS = [
  'serialNumber',
  'cartridgeModel',
  'compatiblePrinter',
  'location',
  'department',
  'vendorName',
  'currentHolderName',
  'currentHolderId',
  'notes',
] as const;

async function searchCartridges(context: Context): Promise<TypeResult> {
  const { query, matcher } = context;
  const filter: Filter = {};
  const owner = ownerId(context, 'cartridges');
  if (owner) filter.createdBy = owner;
  if (context.status) filter.status = context.status;
  if (context.range) filter.createdAt = context.range;
  if (query.location) filter.location = exact(query.location);
  const filtered = withClauses(filter, textClauses(CARTRIDGE_FIELDS, matcher));
  const exactFilter = query.q
    ? { ...filtered, serialNumberNormalized: query.q.trim().toUpperCase() }
    : null;
  const select = `${CARTRIDGE_FIELDS.join(' ')} status createdAt`;
  const [exactRecords, records, total] = await Promise.all([
    exactFilter
      ? CartridgeModel.find(exactFilter).select(select).limit(1).lean<CartridgeSearchRecord[]>()
      : Promise.resolve([]),
    CartridgeModel.find(filtered)
      .select(select)
      .sort({ updatedAt: -1, _id: -1 })
      .limit(context.limit)
      .lean<CartridgeSearchRecord[]>(),
    CartridgeModel.countDocuments(filtered),
  ]);
  return {
    total,
    results: mergeExactFirst(exactRecords, records, context.limit).map((cartridge) => {
      const match = detectMatch(
        [
          { label: 'Serial number', value: cartridge.serialNumber },
          { label: 'Model', value: cartridge.cartridgeModel },
          { label: 'Printer', value: cartridge.compatiblePrinter },
          { label: 'Holder', value: cartridge.currentHolderName },
          { label: 'Holder ID', value: cartridge.currentHolderId },
          { label: 'Location', value: cartridge.location },
          { label: 'Department', value: cartridge.department },
          { label: 'Vendor', value: cartridge.vendorName },
          { label: 'Notes', value: cartridge.notes },
        ],
        matcher,
      );
      return {
        type: 'CARTRIDGE' as const,
        key: `CARTRIDGE:${cartridge.serialNumber}`,
        title: cartridge.serialNumber,
        subtitle: compact([
          cartridge.cartridgeModel,
          cartridge.location,
          cartridge.currentHolderName ? `with ${cartridge.currentHolderName}` : null,
        ]).join(' · '),
        status: cartridge.status,
        matchedField: match?.field ?? null,
        matchedValue: match?.value ?? null,
        path: ['Cartridges', cartridge.cartridgeModel, humanize(cartridge.status)],
        href: `/cartridges/${encodeURIComponent(cartridge.serialNumber)}`,
        occurredAt: cartridge.createdAt.toISOString(),
      };
    }),
  };
}

interface CartridgeGatePassSearchRecord {
  _id: Types.ObjectId;
  gatePassNumber: string;
  vendorName: string;
  personTakingMaterial: string;
  cartridgeSerialNumbers: string[];
  preparedByName: string;
  remarks?: string;
  status: string;
  quantity: number;
  createdAt: Date;
}

const CARTRIDGE_GATE_PASS_FIELDS = [
  'gatePassNumber',
  'vendorName',
  'personTakingMaterial',
  'cartridgeSerialNumbers',
  'preparedByName',
  'remarks',
] as const;

async function searchCartridgeGatePasses(context: Context): Promise<TypeResult> {
  const { matcher } = context;
  const filter: Filter = {};
  const owner = ownerId(context, 'cartridges');
  if (owner) filter.preparedByUserId = owner;
  if (context.status) filter.status = context.status;
  if (context.range) filter.createdAt = context.range;
  const filtered = withClauses(filter, textClauses(CARTRIDGE_GATE_PASS_FIELDS, matcher));
  const [records, total] = await Promise.all([
    GatePassModel.find(filtered)
      .select(`${CARTRIDGE_GATE_PASS_FIELDS.join(' ')} status quantity createdAt`)
      .sort({ createdAt: -1, _id: -1 })
      .limit(context.limit)
      .lean<CartridgeGatePassSearchRecord[]>(),
    GatePassModel.countDocuments(filtered),
  ]);
  return {
    total,
    results: records.map((pass) => {
      const match = detectMatch(
        [
          { label: 'Gate pass number', value: pass.gatePassNumber },
          ...pass.cartridgeSerialNumbers.map((serial) => ({
            label: 'Cartridge serial',
            value: serial,
          })),
          { label: 'Vendor', value: pass.vendorName },
          { label: 'Carried by', value: pass.personTakingMaterial },
          { label: 'Prepared by', value: pass.preparedByName },
          { label: 'Remarks', value: pass.remarks },
        ],
        matcher,
      );
      return {
        type: 'CARTRIDGE_GATE_PASS' as const,
        key: `CARTRIDGE_GATE_PASS:${pass.gatePassNumber}`,
        title: `Gate pass ${pass.gatePassNumber}`,
        subtitle: `${pass.vendorName} · ${pass.quantity} cartridge${pass.quantity === 1 ? '' : 's'}`,
        status: pass.status,
        matchedField: match?.field ?? null,
        matchedValue: match?.value ?? null,
        path: compact([
          'Cartridges',
          'Gate passes',
          pass.gatePassNumber,
          match?.field === 'Cartridge serial' ? `Serial ${match.value}` : null,
        ]),
        href: `/cartridges/gate-passes/${pass._id.toString()}`,
        occurredAt: pass.createdAt.toISOString(),
      };
    }),
  };
}

interface GatePassSearchRecord {
  gatePassNumber: string;
  issueId?: string;
  purpose: string;
  status: string;
  remarks?: string;
  destination: { name: string; organization?: string };
  carrier: { name: string; vehicleNumber?: string };
  items: Array<{
    materialName: string;
    materialCode: string;
    category: string;
    serialNumber?: string;
    assetTag?: string;
  }>;
  createdAt: Date;
}

const GATE_PASS_FIELDS = [
  'gatePassNumber',
  'issueId',
  'destination.name',
  'destination.organization',
  'carrier.name',
  'carrier.vehicleNumber',
  'items.materialName',
  'items.materialCode',
  'items.category',
  'items.serialNumber',
  'items.assetTag',
  'remarks',
] as const;

async function searchGatePasses(context: Context): Promise<TypeResult> {
  const { actor, query, matcher } = context;
  const filter: Filter = {};
  if (!hasServerPermission(actor, 'GATE_PASS_VIEW_ALL')) filter['createdBy.userId'] = actor.userId;
  if (context.status) filter.status = context.status;
  if (context.range) filter.createdAt = context.range;
  const item: Filter = {
    ...(query.category ? { category: exact(query.category) } : {}),
    ...(query.trackingMode ? { trackingMode: query.trackingMode } : {}),
  };
  if (Object.keys(item).length) filter.items = { $elemMatch: item };
  const filtered = withClauses(filter, textClauses(GATE_PASS_FIELDS, matcher));
  const [records, total] = await Promise.all([
    InventoryGatePassModel.find(filtered)
      .select(
        'gatePassNumber issueId purpose status remarks destination carrier items.materialName items.materialCode items.category items.serialNumber items.assetTag createdAt',
      )
      .sort({ createdAt: -1, _id: -1 })
      .limit(context.limit)
      .lean<GatePassSearchRecord[]>(),
    InventoryGatePassModel.countDocuments(filtered),
  ]);
  return {
    total,
    results: records.map((pass) => {
      const match = detectMatch(
        [
          { label: 'Gate pass number', value: pass.gatePassNumber },
          ...pass.items.flatMap((entry) => [
            { label: 'Serial number', value: entry.serialNumber },
            { label: 'Asset tag', value: entry.assetTag },
          ]),
          { label: 'Issue ID', value: pass.issueId },
          ...pass.items.flatMap((entry) => [
            { label: 'Material code', value: entry.materialCode },
            { label: 'Material', value: entry.materialName },
            { label: 'Category', value: entry.category },
          ]),
          { label: 'Destination', value: pass.destination.name },
          { label: 'Organisation', value: pass.destination.organization },
          { label: 'Carrier', value: pass.carrier.name },
          { label: 'Vehicle number', value: pass.carrier.vehicleNumber },
          { label: 'Remarks', value: pass.remarks },
        ],
        matcher,
      );
      const identifier =
        match && ['Serial number', 'Asset tag'].includes(match.field) ? match : null;
      return {
        type: 'GATE_PASS' as const,
        key: `GATE_PASS:${pass.gatePassNumber}`,
        title: `Gate pass ${pass.gatePassNumber}`,
        subtitle: compact([
          pass.destination.name,
          `${pass.items.length} item${pass.items.length === 1 ? '' : 's'}`,
          humanize(pass.purpose),
        ]).join(' · '),
        status: pass.status,
        matchedField: match?.field ?? null,
        matchedValue: match?.value ?? null,
        path: compact([
          'Inventory',
          'Gate passes',
          pass.gatePassNumber,
          identifier ? `${identifier.field} ${identifier.value}` : null,
        ]),
        href: `/inventory/gate-passes/${encodeURIComponent(pass.gatePassNumber)}`,
        occurredAt: pass.createdAt.toISOString(),
      };
    }),
  };
}

interface ReceiverSearchRecord {
  receiverCode: string;
  fullName: string;
  universityId?: string;
  department?: string;
  contact?: string;
  email?: string;
  type: string;
  status: string;
  createdAt: Date;
}

const RECEIVER_FIELDS = [
  'receiverCode',
  'fullName',
  'universityId',
  'department',
  'contact',
  'email',
] as const;

async function searchReceivers(context: Context): Promise<TypeResult> {
  const { matcher } = context;
  const filter: Filter = {};
  if (context.status) filter.status = context.status;
  if (context.range) filter.createdAt = context.range;
  const filtered = withClauses(filter, textClauses(RECEIVER_FIELDS, matcher));
  const [records, total] = await Promise.all([
    ReceiverModel.find(filtered)
      .select(`${RECEIVER_FIELDS.join(' ')} type status createdAt`)
      .sort({ fullNameNormalized: 1, _id: 1 })
      .limit(context.limit)
      .lean<ReceiverSearchRecord[]>(),
    ReceiverModel.countDocuments(filtered),
  ]);
  return {
    total,
    results: records.map((receiver) => {
      const match = detectMatch(
        [
          { label: 'Receiver code', value: receiver.receiverCode },
          { label: 'Name', value: receiver.fullName },
          { label: 'University ID', value: receiver.universityId },
          { label: 'Department', value: receiver.department },
          { label: 'Contact', value: receiver.contact },
          { label: 'Email', value: receiver.email },
        ],
        matcher,
      );
      return {
        type: 'RECEIVER' as const,
        key: `RECEIVER:${receiver.receiverCode}`,
        title: receiver.fullName,
        subtitle: compact([receiver.receiverCode, receiver.department, receiver.universityId]).join(
          ' · ',
        ),
        status: receiver.status,
        matchedField: match?.field ?? null,
        matchedValue: match?.value ?? null,
        path: ['Receivers', humanize(receiver.type), receiver.fullName],
        href: `/receivers/${encodeURIComponent(receiver.receiverCode)}`,
        occurredAt: receiver.createdAt.toISOString(),
      };
    }),
  };
}

interface EmployeeSearchRecord {
  workerId: string;
  name: string;
  email: string;
  department?: string;
  contact?: string;
  status: string;
  createdAt: Date;
}

const EMPLOYEE_FIELDS = ['workerId', 'name', 'email', 'department', 'contact'] as const;

async function searchEmployees(context: Context): Promise<TypeResult> {
  const { matcher } = context;
  const filter: Filter = { role: 'WORKER' };
  if (context.status) filter.status = context.status;
  if (context.range) filter.createdAt = context.range;
  const filtered = withClauses(filter, textClauses(EMPLOYEE_FIELDS, matcher));
  const [records, total] = await Promise.all([
    UserModel.find(filtered)
      .select(`${EMPLOYEE_FIELDS.join(' ')} status createdAt`)
      .sort({ name: 1, _id: 1 })
      .limit(context.limit)
      .lean<EmployeeSearchRecord[]>(),
    UserModel.countDocuments(filtered),
  ]);
  return {
    total,
    results: records.map((employee) => {
      const match = detectMatch(
        [
          { label: 'Employee ID', value: employee.workerId },
          { label: 'Name', value: employee.name },
          { label: 'Email', value: employee.email },
          { label: 'Department', value: employee.department },
          { label: 'Contact', value: employee.contact },
        ],
        matcher,
      );
      return {
        type: 'EMPLOYEE' as const,
        key: `EMPLOYEE:${employee.workerId}`,
        title: employee.name,
        subtitle: compact([employee.workerId, employee.department, employee.email]).join(' · '),
        status: employee.status,
        matchedField: match?.field ?? null,
        matchedValue: match?.value ?? null,
        path: ['Employees', employee.name],
        href: `/workers/${encodeURIComponent(employee.workerId)}`,
        occurredAt: employee.createdAt.toISOString(),
      };
    }),
  };
}

const searchers: Record<SearchEntityType, (context: Context) => Promise<TypeResult>> = {
  ISSUE: searchIssues,
  MATERIAL: searchMaterials,
  ASSET_UNIT: searchAssetUnits,
  CARTRIDGE: searchCartridges,
  CARTRIDGE_GATE_PASS: searchCartridgeGatePasses,
  GATE_PASS: searchGatePasses,
  RECEIVER: searchReceivers,
  EMPLOYEE: searchEmployees,
};

export async function globalSearch(
  actor: SearchActor,
  query: GlobalSearchQuery,
  now = new Date(),
): Promise<GlobalSearchResponse['data']> {
  const allowed = permittedTypes(actor);
  const requested = query.types?.length
    ? allowed.filter((type) => query.types?.includes(type))
    : allowed;
  const searched = requested.filter((type) => typeSupportsFilters(type, query));
  const context: Context = {
    actor,
    query,
    matcher: buildMatcher(query.q),
    limit: query.limit,
    range: dateRange(query),
    status: normalizedStatus(query),
  };
  const results = await Promise.all(
    searched.map(async (type) => ({ type, ...(await searchers[type](context)) })),
  );
  const exactText = query.q?.trim().toLocaleUpperCase('en-US');
  const hasExactHit = (group: { results: SearchResult[] }) =>
    Boolean(exactText) &&
    group.results.some(
      (result) =>
        result.matchedValue?.trim().toLocaleUpperCase('en-US') === exactText ||
        result.title.trim().toLocaleUpperCase('en-US') === exactText,
    );
  const groups = results
    .filter((group) => group.total > 0)
    .map((group) => ({ ...group, label: SEARCH_ENTITY_LABELS[group.type] }))
    // A typed serial number or ID that matches exactly should be the first thing shown.
    // Array.prototype.sort is stable, so the normal type order is kept otherwise.
    .sort((left, right) => Number(hasExactHit(right)) - Number(hasExactHit(left)));
  return {
    query: query.q ?? '',
    groups,
    totalCount: groups.reduce((total, group) => total + group.total, 0),
    excludedTypes: requested.filter((type) => !searched.includes(type)),
    generatedAt: now.toISOString(),
  };
}
