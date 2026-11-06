import type { Request } from 'express';
import { Types } from 'mongoose';

import type { AlertsResponse, MarkAlertsReadRequest, WorkerPermission } from '@assetdesk/contracts';

import { hasServerPermission } from '../auth/auth.middleware.js';
import { CartridgeModel } from '../cartridges/cartridge.model.js';
import { GatePassModel } from '../cartridges/gate-pass.model.js';
import { InventoryGatePassModel } from '../inventory-gate-passes/inventory-gate-pass.model.js';
import { storeStockMatches } from '../inventory/inventory.service.js';
import { MaterialModel } from '../inventory/material.model.js';
import { istDayRange } from '../issues/issue-date.js';
import { IssueModel } from '../issues/issue.model.js';
import { AlertReadModel } from './alert-read.model.js';
import {
  ALERT_LIMIT_PER_CATEGORY,
  CARTRIDGE_LOW_STOCK_LEVEL,
  CARTRIDGE_ROTATION_MINIMUM,
  assembleAlerts,
  plural,
  type AlertDraft,
  type AlertSection,
} from './alert-rules.js';

export type AlertActor = NonNullable<Request['auth']>;

type Filter = Record<string, unknown>;

const LIMIT = ALERT_LIMIT_PER_CATEGORY;

function can(actor: AlertActor, permission: WorkerPermission): boolean {
  return hasServerPermission(actor, permission);
}

function actorObjectId(actor: AlertActor): Types.ObjectId {
  return new Types.ObjectId(actor.userId);
}

function seesAll(actor: AlertActor, area: 'issues' | 'inventory' | 'cartridges'): boolean {
  return actor.role === 'ADMIN' || actor.dataAccess[area] === 'ALL';
}

function humanize(value: string): string {
  const text = value.replaceAll('_', ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

interface IssueAlertRecord {
  issueId: string;
  receiver: { fullName: string };
  expectedReturnAt?: Date;
  totalOutstandingQuantity: number;
  lines: Array<{ material: { name: string } }>;
}

function issueAlert(
  record: IssueAlertRecord,
  category: 'ISSUE_OVERDUE' | 'ISSUE_DUE_TODAY',
): AlertDraft {
  const materials = [...new Set(record.lines.map((line) => line.material.name))];
  const materialText =
    materials.length > 1 ? `${materials[0]} + ${materials.length - 1} more` : (materials[0] ?? '');
  return {
    key: `${category}:${record.issueId}:${record.expectedReturnAt?.getTime() ?? 0}`,
    category,
    severity: category === 'ISSUE_OVERDUE' ? 'CRITICAL' : 'WARNING',
    title: `${category === 'ISSUE_OVERDUE' ? 'Overdue return' : 'Return due today'} · ${record.issueId}`,
    message: [
      record.receiver.fullName,
      `${plural(record.totalOutstandingQuantity, 'item')} pending`,
      materialText,
    ]
      .filter(Boolean)
      .join(' · '),
    href: `/issues/${encodeURIComponent(record.issueId)}`,
    occurredAt: record.expectedReturnAt?.toISOString() ?? null,
  };
}

async function issueSections(actor: AlertActor, now: Date): Promise<AlertSection[]> {
  const userId = actorObjectId(actor);
  const scope = seesAll(actor, 'issues')
    ? {}
    : { $or: [{ createdByUserId: userId }, { 'returnEvents.performedBy.userId': userId }] };
  const open: Filter = {
    ...scope,
    assignmentType: 'SHORT_TERM',
    status: { $in: ['ISSUED', 'PARTIALLY_RETURNED'] },
    totalOutstandingQuantity: { $gt: 0 },
  };
  const overdue: Filter = { ...open, expectedReturnAt: { $lt: now } };
  const dueToday: Filter = {
    ...open,
    expectedReturnAt: { $gte: now, $lt: istDayRange(now).end },
  };
  const fields =
    'issueId receiver.fullName expectedReturnAt totalOutstandingQuantity lines.material.name';
  const [overdueRecords, overdueTotal, dueRecords, dueTotal] = await Promise.all([
    IssueModel.find(overdue)
      .select(fields)
      .sort({ expectedReturnAt: 1 })
      .limit(LIMIT)
      .lean<IssueAlertRecord[]>(),
    IssueModel.countDocuments(overdue),
    IssueModel.find(dueToday)
      .select(fields)
      .sort({ expectedReturnAt: 1 })
      .limit(LIMIT)
      .lean<IssueAlertRecord[]>(),
    IssueModel.countDocuments(dueToday),
  ]);
  return [
    {
      category: 'ISSUE_OVERDUE',
      total: overdueTotal,
      href: actor.role === 'ADMIN' ? '/overdue' : '/issues?returnState=PENDING',
      items: overdueRecords.map((record) => issueAlert(record, 'ISSUE_OVERDUE')),
    },
    {
      category: 'ISSUE_DUE_TODAY',
      total: dueTotal,
      href: '/issues?returnState=DUE_TODAY',
      items: dueRecords.map((record) => issueAlert(record, 'ISSUE_DUE_TODAY')),
    },
  ];
}

interface StockAlertRecord {
  materialCode: string;
  name: string;
  typeModelName?: string;
  category: string;
  store?: string;
  location?: string;
  locationBlock?: string;
  totalQuantity: number;
  availableQuantity: number;
  unitLabel?: string;
  updatedAt: Date;
}

function stockAlert(record: StockAlertRecord, category: 'OUT_OF_STOCK' | 'LOW_STOCK'): AlertDraft {
  const unit = record.unitLabel ?? 'units';
  return {
    key:
      category === 'OUT_OF_STOCK'
        ? `OUT_OF_STOCK:${record.materialCode}:${record.totalQuantity}`
        : `LOW_STOCK:${record.materialCode}:${record.availableQuantity}`,
    category,
    severity: category === 'OUT_OF_STOCK' ? 'CRITICAL' : 'WARNING',
    title: `${category === 'OUT_OF_STOCK' ? 'Out of stock' : 'Low stock'} · ${record.typeModelName || record.name}`,
    message: [
      record.category,
      record.store ?? record.locationBlock ?? record.location,
      `${record.availableQuantity} of ${record.totalQuantity} ${unit} available`,
    ]
      .filter(Boolean)
      .join(' · '),
    href: `/inventory/${encodeURIComponent(record.materialCode)}`,
    occurredAt: record.updatedAt.toISOString(),
  };
}

async function stockSections(actor: AlertActor): Promise<AlertSection[]> {
  const stores = await storeStockMatches();
  const base: Filter = {
    ...(seesAll(actor, 'inventory') ? {} : { createdBy: actorObjectId(actor) }),
    status: 'ACTIVE',
    totalQuantity: { $gt: 0 },
    // Stock deployed in labs is not issueable, so only configured stores raise stock alerts.
    ...(stores.length ? { $or: stores } : {}),
  };
  const outOfStock: Filter = { ...base, availableQuantity: 0 };
  const lowStock: Filter = {
    ...base,
    availableQuantity: { $gt: 0 },
    $expr: {
      $lte: [
        '$availableQuantity',
        { $max: [1, { $ceil: { $multiply: ['$totalQuantity', 0.2] } }] },
      ],
    },
  };
  const fields =
    'materialCode name typeModelName category store location locationBlock totalQuantity availableQuantity unitLabel updatedAt';
  const [outRecords, outTotal, lowRecords, lowTotal] = await Promise.all([
    MaterialModel.find(outOfStock)
      .select(fields)
      .sort({ totalQuantity: -1, updatedAt: -1 })
      .limit(LIMIT)
      .lean<StockAlertRecord[]>(),
    MaterialModel.countDocuments(outOfStock),
    MaterialModel.find(lowStock)
      .select(fields)
      .sort({ availableQuantity: 1, updatedAt: -1 })
      .limit(LIMIT)
      .lean<StockAlertRecord[]>(),
    MaterialModel.countDocuments(lowStock),
  ]);
  const href = can(actor, 'DASHBOARD_LOW_STOCK') ? '/inventory/low-stock' : '/inventory';
  return [
    {
      category: 'OUT_OF_STOCK',
      total: outTotal,
      href: can(actor, 'DASHBOARD_LOW_STOCK') ? '/inventory/low-stock?max=0' : href,
      items: outRecords.map((record) => stockAlert(record, 'OUT_OF_STOCK')),
    },
    {
      category: 'LOW_STOCK',
      total: lowTotal,
      href,
      items: lowRecords.map((record) => stockAlert(record, 'LOW_STOCK')),
    },
  ];
}

const cartridgeAttention: Partial<
  Record<string, { severity: AlertDraft['severity']; text: string; href: string }>
> = {
  EMPTY: {
    severity: 'WARNING',
    text: 'waiting to be sent for refill',
    href: '/cartridges?status=EMPTY',
  },
  QC_PENDING: { severity: 'INFO', text: 'awaiting quality check', href: '/cartridges/gate-in' },
  REFILL_FAILED: {
    severity: 'WARNING',
    text: 'failed refill',
    href: '/cartridges?status=REFILL_FAILED',
  },
  DEFECTIVE: {
    severity: 'WARNING',
    text: 'marked defective',
    href: '/cartridges?status=DEFECTIVE',
  },
  DAMAGED: { severity: 'WARNING', text: 'marked damaged', href: '/cartridges?status=DAMAGED' },
  SCRAP_PENDING: {
    severity: 'INFO',
    text: 'pending scrap decision',
    href: '/cartridges?status=SCRAP_PENDING',
  },
};

interface CartridgeCountRow {
  _id: { model: string; status: string };
  count: number;
  latest: Date;
}

/** Turns per-model/status counts into low-stock and needs-action alerts. Exported for tests. */
export function cartridgeSectionsFromCounts(rows: CartridgeCountRow[]): AlertSection[] {
  const models = new Map<string, { filled: number; live: number; empty: number; latest: Date }>();
  const statuses = new Map<string, { count: number; latest: Date }>();
  for (const row of rows) {
    const model = models.get(row._id.model) ?? {
      filled: 0,
      live: 0,
      empty: 0,
      latest: row.latest,
    };
    if (row._id.status === 'FILLED_AVAILABLE') model.filled += row.count;
    if (row._id.status === 'EMPTY') model.empty += row.count;
    if (row._id.status !== 'SCRAPPED') model.live += row.count;
    if (row.latest > model.latest) model.latest = row.latest;
    models.set(row._id.model, model);
    const status = statuses.get(row._id.status) ?? { count: 0, latest: row.latest };
    status.count += row.count;
    if (row.latest > status.latest) status.latest = row.latest;
    statuses.set(row._id.status, status);
  }
  const lowStock = [...models.entries()]
    .filter(
      ([, model]) =>
        model.live >= CARTRIDGE_ROTATION_MINIMUM && model.filled <= CARTRIDGE_LOW_STOCK_LEVEL,
    )
    .sort(
      ([leftName, left], [rightName, right]) =>
        left.filled - right.filled || leftName.localeCompare(rightName),
    );
  const attention = [...statuses.entries()].flatMap(([status, value]) => {
    const rule = cartridgeAttention[status];
    return rule ? [{ status, rule, ...value }] : [];
  });
  return [
    {
      category: 'CARTRIDGE_LOW_STOCK',
      total: lowStock.length,
      href: '/cartridges/dashboard',
      items: lowStock.slice(0, LIMIT).map(([model, value]) => ({
        key: `CARTRIDGE_LOW_STOCK:${model.toUpperCase()}:${value.filled}`,
        category: 'CARTRIDGE_LOW_STOCK',
        severity: value.filled === 0 ? 'CRITICAL' : 'WARNING',
        title: `${value.filled === 0 ? 'No filled cartridges' : 'Low cartridge stock'} · ${model}`,
        message: `${plural(value.filled, 'filled cartridge')} available · ${value.empty} empty awaiting refill`,
        href: `/cartridges?search=${encodeURIComponent(model)}`,
        occurredAt: value.latest.toISOString(),
      })),
    },
    {
      category: 'CARTRIDGE_ATTENTION',
      total: attention.length,
      href: '/cartridges',
      items: attention.map(({ status, rule, count, latest }) => ({
        key: `CARTRIDGE_ATTENTION:${status}:${count}`,
        category: 'CARTRIDGE_ATTENTION',
        severity: rule.severity,
        title: `${plural(count, 'cartridge')} ${rule.text}`,
        message: `Status: ${humanize(status)}`,
        href: rule.href,
        occurredAt: latest.toISOString(),
      })),
    },
  ];
}

async function cartridgeSections(actor: AlertActor): Promise<AlertSection[]> {
  const scope = seesAll(actor, 'cartridges') ? {} : { createdBy: actorObjectId(actor) };
  const rows = await CartridgeModel.aggregate<CartridgeCountRow>([
    { $match: scope },
    {
      $group: {
        _id: { model: '$cartridgeModel', status: '$status' },
        count: { $sum: 1 },
        latest: { $max: '$updatedAt' },
      },
    },
  ]);
  return cartridgeSectionsFromCounts(rows);
}

interface CartridgeGatePassAlertRecord {
  _id: Types.ObjectId;
  gatePassNumber: string;
  vendorName: string;
  quantity: number;
  preparedByName: string;
  expectedReturnDate?: Date;
  createdAt: Date;
  gateInEvents?: Array<{ serialNumbers: string[] }>;
}

async function cartridgeGatePassSections(actor: AlertActor, now: Date): Promise<AlertSection[]> {
  const scope = seesAll(actor, 'cartridges') ? {} : { preparedByUserId: actorObjectId(actor) };
  const pending: Filter = { ...scope, status: 'AWAITING_VERIFICATION' };
  const overdue: Filter = {
    ...scope,
    status: { $in: ['GATE_OUT', 'PARTIALLY_RETURNED'] },
    expectedReturnDate: { $lt: now },
  };
  const fields =
    '_id gatePassNumber vendorName quantity preparedByName expectedReturnDate createdAt gateInEvents.serialNumbers';
  const canVerify = can(actor, 'CARTRIDGE_GATE_PASSES_VERIFY');
  const [pendingRecords, pendingTotal, overdueRecords, overdueTotal] = await Promise.all([
    canVerify
      ? GatePassModel.find(pending)
          .select(fields)
          .sort({ createdAt: 1 })
          .limit(LIMIT)
          .lean<CartridgeGatePassAlertRecord[]>()
      : Promise.resolve([]),
    canVerify ? GatePassModel.countDocuments(pending) : Promise.resolve(0),
    GatePassModel.find(overdue)
      .select(fields)
      .sort({ expectedReturnDate: 1 })
      .limit(LIMIT)
      .lean<CartridgeGatePassAlertRecord[]>(),
    GatePassModel.countDocuments(overdue),
  ]);
  return [
    {
      category: 'CARTRIDGE_GATE_PASS_PENDING',
      total: pendingTotal,
      href: '/cartridges/gate-passes',
      items: pendingRecords.map((record) => ({
        key: `CARTRIDGE_GATE_PASS_PENDING:${record.gatePassNumber}`,
        category: 'CARTRIDGE_GATE_PASS_PENDING',
        severity: 'INFO',
        title: `Verify gate pass · ${record.gatePassNumber}`,
        message: `${plural(record.quantity, 'cartridge')} for ${record.vendorName} · prepared by ${record.preparedByName}`,
        href: `/cartridges/gate-passes/${record._id.toString()}`,
        occurredAt: record.createdAt.toISOString(),
      })),
    },
    {
      category: 'CARTRIDGE_GATE_PASS_OVERDUE',
      total: overdueTotal,
      href: '/cartridges/gate-passes/database',
      items: overdueRecords.map((record) => {
        const returned = (record.gateInEvents ?? []).reduce(
          (total, event) => total + event.serialNumbers.length,
          0,
        );
        return {
          key: `CARTRIDGE_GATE_PASS_OVERDUE:${record.gatePassNumber}:${record.expectedReturnDate?.getTime() ?? 0}`,
          category: 'CARTRIDGE_GATE_PASS_OVERDUE',
          severity: 'CRITICAL',
          title: `Vendor return overdue · ${record.gatePassNumber}`,
          message: `${record.vendorName} · ${Math.max(0, record.quantity - returned)} of ${record.quantity} cartridges not returned`,
          href: `/cartridges/gate-passes/${record._id.toString()}`,
          occurredAt: record.expectedReturnDate?.toISOString() ?? null,
        };
      }),
    },
  ];
}

interface InventoryGatePassAlertRecord {
  gatePassNumber: string;
  destination: { name: string };
  expectedGateInAt?: Date;
  items: Array<{ remainingOutsideQuantity: number }>;
}

async function gatePassSections(actor: AlertActor, now: Date): Promise<AlertSection[]> {
  const overdue: Filter = {
    ...(can(actor, 'GATE_PASS_VIEW_ALL') ? {} : { 'createdBy.userId': actorObjectId(actor) }),
    status: { $in: ['OUTSIDE', 'PARTIALLY_IN'] },
    expectedGateInAt: { $lt: now },
  };
  const [records, total] = await Promise.all([
    InventoryGatePassModel.find(overdue)
      .select('gatePassNumber destination.name expectedGateInAt items.remainingOutsideQuantity')
      .sort({ expectedGateInAt: 1 })
      .limit(LIMIT)
      .lean<InventoryGatePassAlertRecord[]>(),
    InventoryGatePassModel.countDocuments(overdue),
  ]);
  return [
    {
      category: 'GATE_PASS_OVERDUE',
      total,
      href: '/inventory/gate-passes/data',
      items: records.map((record) => {
        const outside = record.items.reduce(
          (sum, item) => sum + (item.remainingOutsideQuantity ?? 0),
          0,
        );
        return {
          key: `GATE_PASS_OVERDUE:${record.gatePassNumber}:${record.expectedGateInAt?.getTime() ?? 0}`,
          category: 'GATE_PASS_OVERDUE',
          severity: 'CRITICAL',
          title: `Gate in overdue · ${record.gatePassNumber}`,
          message: `${record.destination.name} · ${plural(outside, 'item')} still outside`,
          href: `/inventory/gate-passes/${encodeURIComponent(record.gatePassNumber)}`,
          occurredAt: record.expectedGateInAt?.toISOString() ?? null,
        };
      }),
    },
  ];
}

export async function collectAlertSections(actor: AlertActor, now: Date): Promise<AlertSection[]> {
  const tasks: Array<Promise<AlertSection[]>> = [];
  if (can(actor, 'ISSUES_VIEW')) tasks.push(issueSections(actor, now));
  if (can(actor, 'INVENTORY_VIEW') || can(actor, 'DASHBOARD_LOW_STOCK')) {
    tasks.push(stockSections(actor));
  }
  if (can(actor, 'CARTRIDGES_VIEW')) tasks.push(cartridgeSections(actor));
  if (can(actor, 'CARTRIDGE_GATE_PASSES_VIEW')) tasks.push(cartridgeGatePassSections(actor, now));
  if (can(actor, 'GATE_PASS_VIEW')) tasks.push(gatePassSections(actor, now));
  return (await Promise.all(tasks)).flat();
}

export async function getAlerts(
  actor: AlertActor,
  now = new Date(),
): Promise<AlertsResponse['data']> {
  const sections = await collectAlertSections(actor, now);
  const keys = sections.flatMap((section) => section.items.map((item) => item.key));
  const reads = keys.length
    ? await AlertReadModel.find({ userId: actorObjectId(actor), key: { $in: keys } })
        .select('key')
        .lean()
    : [];
  return assembleAlerts(sections, new Set(reads.map((read) => read.key)), now);
}

export async function markAlertsRead(
  actor: AlertActor,
  request: MarkAlertsReadRequest,
  now = new Date(),
): Promise<number> {
  const keys =
    'all' in request
      ? (await collectAlertSections(actor, now)).flatMap((section) =>
          section.items.map((item) => item.key),
        )
      : [...new Set(request.keys)];
  if (!keys.length) return 0;
  const userId = actorObjectId(actor);
  await AlertReadModel.bulkWrite(
    keys.map((key) => ({
      updateOne: {
        filter: { userId, key },
        update: { $set: { readAt: now }, $setOnInsert: { userId, key } },
        upsert: true,
      },
    })),
    { ordered: false },
  );
  return keys.length;
}
