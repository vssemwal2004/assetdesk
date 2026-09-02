import { basename, extname } from 'node:path';

import { parse as parseCsv } from 'csv-parse/sync';
import { Types } from 'mongoose';
import { readSheet, type SheetData } from 'read-excel-file/node';

import {
  CreateMaterialRequestSchema,
  type CreateMaterialRequest,
  type TrackingMode,
} from '@assetdesk/contracts';

import { AppError } from '../../middleware/error-handler.js';
import { AssetUnitModel } from './asset-unit.model.js';
import { AssetDetailModel } from './asset-detail.model.js';
import { AssetTypeModel } from './asset-type.model.js';
import {
  InventoryImportModel,
  type InventoryImportInput,
  type InventoryImportDuplicate,
  type InventoryImportPreviewRow,
} from './inventory-import.model.js';
import {
  adjustQuantity,
  createAssetType,
  createAssetUnit,
  createMaterial,
} from './inventory.service.js';
import { MaterialModel } from './material.model.js';
import { listInventoryModels } from './inventory-model.service.js';

const MAX_ROWS = 1_000;
const IMPORT_TTL_MS = 60 * 60 * 1_000;
type Field =
  | 'name'
  | 'category'
  | 'typeModelName'
  | 'configuration'
  | 'store'
  | 'location'
  | 'block'
  | 'department'
  | 'vendorName'
  | 'locationBlock'
  | 'description'
  | 'serialNumber'
  | 'quantity'
  | 'unitLabel'
  | 'returnPolicy'
  | 'status';

const HEADER_ALIASES: Record<string, Field> = {
  name: 'name',
  'material name': 'name',
  category: 'category',
  'asset type': 'category',
  assettype: 'category',
  'it asset': 'category',
  'it consumable': 'category',
  'it consumbale': 'category',
  'it consubable': 'category',
  'it conusmble': 'category',
  'consumable type': 'category',
  consumable: 'category',
  consumbale: 'category',
  consubable: 'category',
  conusmble: 'category',
  group: 'category',
  'material group': 'category',
  'type model name': 'typeModelName',
  'type/model name': 'typeModelName',
  model: 'typeModelName',
  'model name': 'typeModelName',
  configuration: 'configuration',
  configration: 'configuration',
  'asset configuration': 'configuration',
  'it asset configuration': 'configuration',
  'configuration details': 'configuration',
  config: 'configuration',
  store: 'store',
  stores: 'store',
  'store name': 'store',
  'location block': 'locationBlock',
  'location / block': 'locationBlock',
  location: 'location',
  block: 'block',
  department: 'department',
  departments: 'department',
  dept: 'department',
  vendor: 'vendorName',
  'vendor name': 'vendorName',
  description: 'description',
  serial: 'serialNumber',
  'serial number': 'serialNumber',
  serialnumber: 'serialNumber',
  quantity: 'quantity',
  qty: 'quantity',
  unit: 'unitLabel',
  'unit label': 'unitLabel',
  'return policy': 'returnPolicy',
  returnpolicy: 'returnPolicy',
  status: 'status',
  'inventory status': 'status',
  condition: 'status',
};

interface ImportRow {
  rowNumber: number;
  values: Record<Field, string>;
}

export interface InventoryImportResult {
  created: Array<{ materialCode: string; name: string; quantity: number }>;
  failed: Array<{ rowNumber: number; name: string; reason: string }>;
}

export interface InventoryImportPreviewResult {
  importId: string;
  fileName: string;
  mode: TrackingMode;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rows: InventoryImportPreviewRow[];
  expiresAt: string;
}

function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'object' ? '' : String(value).trim();
}

function header(value: unknown): string {
  return text(value)
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasValues(row: readonly unknown[]): boolean {
  return row.some((cell) => text(cell).length > 0);
}

export function parseInventoryImportTable(
  table: readonly (readonly unknown[])[],
  mode: TrackingMode,
): ImportRow[] {
  const headerIndex = table.findIndex(hasValues);
  if (headerIndex < 0)
    throw new AppError(400, 'INVENTORY_IMPORT_EMPTY', 'The import file is empty.');
  const headings = table[headerIndex] ?? [];
  const columns = new Map<Field, number>();
  headings.forEach((value, index) => {
    const field = HEADER_ALIASES[header(value)];
    if (field) {
      if (columns.has(field))
        throw new AppError(
          400,
          'INVENTORY_IMPORT_DUPLICATE_COLUMN',
          `The file contains more than one ${field} column.`,
        );
      columns.set(field, index);
    }
  });
  const required: Field[] =
    mode === 'SERIALIZED'
      ? ['category', 'configuration', 'serialNumber']
      : ['category', 'quantity', 'unitLabel'];
  if (!columns.has('store') && !columns.has('location')) required.push('store');
  const missing = required.filter((field) => !columns.has(field));
  if (missing.length)
    throw new AppError(
      400,
      'INVENTORY_IMPORT_COLUMNS_MISSING',
      `Add the required columns: ${missing.join(', ')}.`,
    );

  const rows = table
    .slice(headerIndex + 1)
    .map((row, index) => ({ row, rowNumber: headerIndex + index + 2 }))
    .filter(({ row }) => hasValues(row))
    .map(({ row, rowNumber }) => ({
      rowNumber,
      values: Object.fromEntries(
        [...columns].map(([field, index]) => [field, text(row[index])]),
      ) as Record<Field, string>,
    }));
  if (!rows.length)
    throw new AppError(400, 'INVENTORY_IMPORT_NO_DATA', 'The import file contains no data rows.');
  if (rows.length > MAX_ROWS)
    throw new AppError(
      413,
      'INVENTORY_IMPORT_TOO_MANY_ROWS',
      `Upload no more than ${MAX_ROWS} rows.`,
    );
  return rows;
}

async function fileTable(file: Express.Multer.File): Promise<readonly (readonly unknown[])[]> {
  const extension = extname(basename(file.originalname)).toLowerCase();
  try {
    if (extension === '.csv')
      return parseCsv(file.buffer.toString('utf8'), {
        bom: true,
        relax_column_count: true,
        skip_empty_lines: false,
        max_record_size: 16_384,
      }) as unknown[][];
    if (extension === '.xlsx') return (await readSheet(file.buffer)) as SheetData;
  } catch {
    throw new AppError(
      400,
      'INVENTORY_IMPORT_FILE_INVALID',
      'The file could not be read. Check its CSV or XLSX format.',
    );
  }
  throw new AppError(415, 'INVENTORY_IMPORT_TYPE_UNSUPPORTED', 'Upload a CSV or XLSX file.');
}

function issueMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (error && typeof error === 'object' && 'issues' in error) {
    const issues = (error as { issues?: Array<{ message?: string }> }).issues;
    return cleanReason(issues?.[0]?.message ?? 'Check this row.');
  }
  return 'This material could not be created.';
}

function cleanReason(message: string): string {
  const trimmed = message.replace(/\s+/g, ' ').trim();
  if (
    trimmed.length > 260 ||
    /\$__|ownerDocument|Mongoose|DocumentPrototype|Schema|validateSync/.test(trimmed)
  ) {
    return 'Check this row values. One or more fields are not in the supported upload format.';
  }
  return trimmed || 'Check this row.';
}

export function importInputToCreateMaterialRequest(
  input: InventoryImportInput,
): CreateMaterialRequest {
  const source =
    input && typeof input === 'object' && 'toObject' in input
      ? (input as { toObject: () => unknown }).toObject()
      : input;
  const record = source as InventoryImportInput;
  const store = record.store ?? record.locationBlock ?? record.location ?? '';
  const common = {
    name: record.name,
    category: record.category,
    typeModelName: record.typeModelName,
    ...(record.trackingMode === 'SERIALIZED' ? { configuration: record.configuration } : {}),
    store,
    location: record.location ?? store,
    ...(record.block ? { block: record.block } : {}),
    ...(record.department ? { department: record.department } : {}),
    ...(record.vendorName ? { vendorName: record.vendorName } : {}),
    ...(record.locationBlock ? { locationBlock: record.locationBlock } : {}),
    ...(record.description ? { description: record.description } : {}),
    assignmentTypes: record.assignmentTypes,
    trackingMode: record.trackingMode,
    returnPolicy: record.returnPolicy,
    ...(record.status ? { status: record.status } : {}),
  };
  return CreateMaterialRequestSchema.parse(
    record.trackingMode === 'SERIALIZED'
      ? { ...common, serialNumbers: record.serialNumbers ?? [] }
      : { ...common, totalQuantity: record.totalQuantity, unitLabel: record.unitLabel },
  );
}

function identity(
  mode: TrackingMode,
  name: string,
  category: string,
  location: string,
  block: string,
  configuration?: string,
): string {
  const normalizePart = (value: string) =>
    value.normalize('NFKC').trim().replace(/\s+/g, '').toLocaleUpperCase('en-US');
  const base = `${mode}|${normalizePart(name)}|${normalizePart(category)}|${normalizePart(location)}|${normalizePart(block)}`;
  return mode === 'SERIALIZED'
    ? `${base}|${normalizeImportConfiguration(configuration ?? '')}`
    : base;
}

function normalizedAssetType(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleUpperCase('en-US');
}

function normalizedLookup(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, '').toLocaleUpperCase('en-US');
}

function exactText(value: string): RegExp {
  return new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
}

export function normalizeImportConfiguration(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .trim()
    .replace(/\s+/g, '')
    .toLocaleUpperCase('en-US');
}

async function savedLookup(
  kind: 'ASSET_TYPE' | 'CONSUMABLE_TYPE' | 'LOCATION' | 'BLOCK' | 'STORE' | 'DEPARTMENT',
  value: string,
): Promise<string | null> {
  const detail = await AssetDetailModel.findOne({ kind, normalizedName: normalizedLookup(value) });
  if (detail) return detail.name;
  if (kind === 'ASSET_TYPE' || kind === 'CONSUMABLE_TYPE') {
    const assetType = await AssetTypeModel.findOne({ normalizedName: normalizedAssetType(value) });
    return assetType?.name ?? null;
  }
  return null;
}

function detailKindLabel(
  kind: 'ASSET_TYPE' | 'CONSUMABLE_TYPE' | 'LOCATION' | 'BLOCK' | 'STORE' | 'DEPARTMENT',
): string {
  if (kind === 'ASSET_TYPE') return 'IT asset type';
  if (kind === 'CONSUMABLE_TYPE') return 'IT consumable type';
  if (kind === 'LOCATION') return 'Location';
  if (kind === 'STORE') return 'Store';
  if (kind === 'DEPARTMENT') return 'Department';
  return 'Block';
}

function missingDropdownValue(
  kind: 'ASSET_TYPE' | 'CONSUMABLE_TYPE' | 'LOCATION' | 'BLOCK' | 'STORE' | 'DEPARTMENT',
  value: string,
): Error {
  return new Error(
    `${detailKindLabel(kind)} "${value}" is not saved in Add asset details. Check spelling or add it first.`,
  );
}

function materialName(assetType: string, typeModelName: string): string {
  const category = assetType.trim().replace(/\s+/g, ' ');
  const model = typeModelName.trim().replace(/\s+/g, ' ');
  return model.toLocaleLowerCase('en-US').startsWith(category.toLocaleLowerCase('en-US'))
    ? model
    : `${category} ${model}`;
}

function categoryKind(mode: TrackingMode): 'ASSET_TYPE' | 'CONSUMABLE_TYPE' {
  return mode === 'SERIALIZED' ? 'ASSET_TYPE' : 'CONSUMABLE_TYPE';
}

function requireRowValue(value: string, label: string): string {
  if (!value.trim()) throw new Error(`${label} is required.`);
  return value;
}

function materialStatus(value: string): 'ACTIVE' | 'UNDER_MAINTENANCE' | 'SCRAP' | 'NOT_IN_USE' {
  const normalized = value
    .trim()
    .replace(/[^A-Z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .toUpperCase();
  if (
    normalized.includes('UNDER MAINTENANCE') ||
    normalized.includes('UNDER MAINTANCE') ||
    normalized === 'MAINTENANCE'
  ) {
    return 'UNDER_MAINTENANCE';
  }
  if (
    !normalized ||
    normalized === 'ACTIVE' ||
    normalized.includes('ACTIVE IN USE') ||
    normalized === 'WORKING'
  ) {
    return 'ACTIVE';
  }
  if (
    normalized.includes('SCRAP') ||
    normalized.includes('FAULTY') ||
    normalized.includes('SCRAPE')
  ) {
    return 'SCRAP';
  }
  if (
    normalized.includes('NOT IN USE') ||
    normalized.includes('NOT USED') ||
    normalized.includes('UNUSED') ||
    normalized.includes('IDLE') ||
    normalized.includes('OBSOLETE') ||
    normalized.includes('OUTDATED') ||
    normalized.includes('OUT DATED')
  ) {
    return 'NOT_IN_USE';
  }
  throw new Error(
    'Inventory status must be Active / in use, Under maintenance, Faulty (scrap), or Outdated (not in use).',
  );
}

export async function previewInventoryImport(
  file: Express.Multer.File,
  mode: TrackingMode,
  createdByUserId: string,
): Promise<InventoryImportPreviewResult> {
  const rows = parseInventoryImportTable(await fileTable(file), mode);
  const groups = Object.values(
    rows.reduce<Record<string, ImportRow[]>>((result, row) => {
      const itemName = row.values.typeModelName || row.values.name;
      const storeValue = row.values.store || row.values.location;
      const configuration =
        mode === 'SERIALIZED' ? `\0${normalizeImportConfiguration(row.values.configuration)}` : '';
      const key = `${itemName.trim().toUpperCase()}\0${row.values.category.trim().toUpperCase()}\0${normalizedLookup(storeValue)}${configuration}`;
      (result[key] ??= []).push(row);
      return result;
    }, {}),
  );

  const previewRows = new Map<number, InventoryImportPreviewRow>(
    rows.map((row) => [
      row.rowNumber,
      {
        rowNumber: row.rowNumber,
        name: row.values.typeModelName || row.values.name,
        category: row.values.category,
        ...(row.values.typeModelName ? { typeModelName: row.values.typeModelName } : {}),
        ...(row.values.configuration ? { configuration: row.values.configuration } : {}),
        ...(row.values.store || row.values.location
          ? { store: row.values.store || row.values.location }
          : {}),
        ...(row.values.location ? { location: row.values.location } : {}),
        ...(row.values.block ? { block: row.values.block } : {}),
        ...(row.values.department ? { department: row.values.department } : {}),
        ...(row.values.vendorName ? { vendorName: row.values.vendorName } : {}),
        ...(row.values.locationBlock ? { locationBlock: row.values.locationBlock } : {}),
        ...(row.values.serialNumber ? { serialNumber: row.values.serialNumber } : {}),
        ...(row.values.quantity ? { quantity: Number(row.values.quantity) } : {}),
        ...(row.values.unitLabel ? { unitLabel: row.values.unitLabel } : {}),
        ...(row.values.status ? { status: row.values.status } : {}),
        valid: true,
        errors: [],
      },
    ]),
  );
  const inputs: InventoryImportInput[] = [];
  const serialRows = new Map<string, number[]>();
  if (mode === 'SERIALIZED') {
    rows.forEach((row) => {
      const normalized = row.values.serialNumber.trim().toLocaleUpperCase('en-US');
      if (!normalized) return;
      const rowNumbers = serialRows.get(normalized) ?? [];
      rowNumbers.push(row.rowNumber);
      serialRows.set(normalized, rowNumbers);
    });
  }
  const existingUnits =
    mode === 'SERIALIZED'
      ? await AssetUnitModel.find({ serialNumberNormalized: { $in: [...serialRows.keys()] } }).lean()
      : [];
  const existingMaterials = await MaterialModel.find({
    materialCode: { $in: existingUnits.map((unit) => unit.materialCode) },
  }).lean();
  const materialsByCode = new Map(existingMaterials.map((material) => [material.materialCode, material]));
  const existingBySerial = new Map(
    existingUnits.map((unit) => [unit.serialNumberNormalized ?? '', unit] as const),
  );
  if (mode === 'SERIALIZED') {
    rows.forEach((row) => {
      const normalized = row.values.serialNumber.trim().toLocaleUpperCase('en-US');
      if (!normalized) return;
      const duplicates: InventoryImportDuplicate[] = [];
      const matchingRows = serialRows.get(normalized) ?? [];
      if (matchingRows.length > 1) {
        duplicates.push({
          source: 'UPLOAD_FILE',
          matchedField: 'serialNumber',
          uploadedValue: row.values.serialNumber,
          otherRowNumbers: matchingRows.filter((rowNumber) => rowNumber !== row.rowNumber),
        });
      }
      const unit = existingBySerial.get(normalized);
      if (unit) {
        const material = materialsByCode.get(unit.materialCode);
        duplicates.push({
          source: 'EXISTING_INVENTORY',
          matchedField: 'serialNumber',
          uploadedValue: row.values.serialNumber,
          assetTag: unit.assetTag,
          materialCode: unit.materialCode,
          ...(material?.name ? { name: material.name } : {}),
          ...(material?.category ? { category: material.category } : {}),
          ...(material?.typeModelName ? { typeModelName: material.typeModelName } : {}),
          ...(material?.configuration ? { configuration: material.configuration } : {}),
          ...(material?.store ?? material?.locationBlock ?? material?.location
            ? { store: material.store ?? material.locationBlock ?? material.location }
            : {}),
          ...(material?.location ? { location: material.location } : {}),
          ...(material?.block ? { block: material.block } : {}),
          ...(material?.status ? { status: material.status } : {}),
        });
      }
      const preview = previewRows.get(row.rowNumber);
      if (preview && duplicates.length) preview.duplicates = duplicates;
    });
  }
  const categoryDetailKind = categoryKind(mode);
  const categoryEntries = await Promise.all(
    [...new Set(rows.map((row) => row.values.category))].map(
      async (value) =>
        [
          normalizedLookup(value),
          (await savedLookup(categoryDetailKind, value)) ??
            (mode === 'QUANTITY' ? value.trim().replace(/\s+/g, ' ') : null),
        ] as const,
    ),
  );
  const storeEntries = await Promise.all(
    [...new Set(rows.map((row) => row.values.store || row.values.location))].map(
      async (value) => [normalizedLookup(value), await savedLookup('STORE', value)] as const,
    ),
  );
  const departmentEntries = await Promise.all(
    [...new Set(rows.map((row) => row.values.department).filter(Boolean))].map(
      async (value) => [normalizedLookup(value), await savedLookup('DEPARTMENT', value)] as const,
    ),
  );
  const categories = new Map(categoryEntries);
  const stores = new Map(storeEntries);
  const departments = new Map(departmentEntries);
  const registeredModelEntries = await Promise.all(
    [...new Set(rows.map((row) => normalizedLookup(row.values.category)))].map(async (key) => {
      const category = categories.get(key);
      return [
        key,
        new Map(
          category
            ? (await listInventoryModels(category, mode)).flatMap((model) =>
                [model.name, ...model.aliases].map(
                  (name) => [normalizedLookup(name), model.name] as const,
                ),
              )
            : [],
        ),
      ] as const;
    }),
  );
  const registeredModels = new Map(registeredModelEntries);
  for (const group of groups) {
    const first = group[0];
    if (!first) continue;
    try {
      const values = first.values;
      const itemName = values.typeModelName || values.name;
      const storeValue = values.store || values.location;
      requireRowValue(itemName, 'Type/model name');
      requireRowValue(values.category, mode === 'SERIALIZED' ? 'IT Asset' : 'IT Consumable');
      requireRowValue(storeValue, 'Store');
      if (mode === 'SERIALIZED') {
        requireRowValue(values.configuration, 'Configuration');
        group.forEach((row) => requireRowValue(row.values.serialNumber, 'Serial number'));
      } else {
        requireRowValue(values.quantity, 'Quantity');
        requireRowValue(values.unitLabel, 'Unit label');
      }
      const category = categories.get(normalizedLookup(values.category));
      const store = stores.get(normalizedLookup(storeValue));
      const department = values.department
        ? departments.get(normalizedLookup(values.department))
        : undefined;
      if (!category) throw missingDropdownValue(categoryDetailKind, values.category);
      const registeredModel = registeredModels
        .get(normalizedLookup(values.category))
        ?.get(normalizedLookup(itemName));
      if (!registeredModel) {
        throw new Error(
          `Model "${itemName}" is not present in the database under ${category}. Add this model in Add asset details → Add Models, then upload the file again.`,
        );
      }
      if (!store) throw missingDropdownValue('STORE', storeValue);
      if (values.department && !department) {
        throw missingDropdownValue('DEPARTMENT', values.department);
      }
      const displayName = materialName(category, registeredModel);
      let draft: CreateMaterialRequest;
      if (mode === 'SERIALIZED') {
        const uploadableRows = group.filter((row) => {
          const preview = previewRows.get(row.rowNumber);
          const duplicates = preview?.duplicates ?? [];
          if (!duplicates.length) return true;
          preview!.valid = false;
          if (duplicates.some((duplicate) => duplicate.source === 'EXISTING_INVENTORY')) {
            preview!.errors.push('This serial number already exists in inventory.');
          }
          if (duplicates.some((duplicate) => duplicate.source === 'UPLOAD_FILE')) {
            preview!.errors.push('This serial number is repeated in the uploaded file.');
          }
          return false;
        });
        if (!uploadableRows.length) continue;
        const serialNumbers = uploadableRows.map((row) => row.values.serialNumber);
        draft = CreateMaterialRequestSchema.parse({
          name: displayName,
          category,
          typeModelName: registeredModel,
          store,
          location: store,
          ...(department ? { department } : {}),
          locationBlock: store,
          ...(values.vendorName ? { vendorName: values.vendorName } : {}),
          ...(values.description ? { description: values.description } : {}),
          status: materialStatus(values.status),
          trackingMode: 'SERIALIZED',
          returnPolicy: 'REUSABLE',
          configuration: values.configuration,
          assignmentTypes: ['LONG_TERM'],
          serialNumbers,
        });
      } else {
        const comparableFields: Field[] = [
          'unitLabel',
          'store',
          'department',
          'vendorName',
          'description',
          'returnPolicy',
          'status',
        ];
        if (
          group.some((row) =>
            comparableFields.some(
              (field) =>
                (row.values[field] ?? '').trim().toUpperCase() !==
                (values[field] ?? '').trim().toUpperCase(),
            ),
          )
        ) {
          throw new Error(
            'Repeated consumable rows must use the same unit, store, return policy, status, vendor, and description.',
          );
        }
        const totalQuantity = group.reduce((sum, row) => {
          const quantity = Number(row.values.quantity);
          if (!Number.isInteger(quantity) || quantity < 0)
            throw new Error('Quantity must be a whole number of 0 or more.');
          return sum + quantity;
        }, 0);
        draft = CreateMaterialRequestSchema.parse({
          name: displayName,
          category,
          typeModelName: registeredModel,
          store,
          location: store,
          ...(department ? { department } : {}),
          locationBlock: store,
          ...(values.vendorName ? { vendorName: values.vendorName } : {}),
          ...(values.description ? { description: values.description } : {}),
          status: materialStatus(values.status),
          trackingMode: 'QUANTITY',
          returnPolicy:
            values.returnPolicy.toUpperCase() === 'CONSUMABLE' ? 'CONSUMABLE' : 'REUSABLE',
          assignmentTypes: ['SHORT_TERM'],
          totalQuantity,
          unitLabel: values.unitLabel,
        });
      }
      inputs.push(draft);
    } catch (error) {
      const reason = cleanReason(error instanceof Error ? error.message : issueMessage(error));
      group.forEach((row) => {
        const preview = previewRows.get(row.rowNumber);
        if (preview) {
          preview.valid = false;
          preview.errors.push(reason);
        }
      });
    }
  }

  const publicRows = [...previewRows.values()].sort((a, b) => a.rowNumber - b.rowNumber);
  const invalidRows = publicRows.filter((row) => !row.valid).length;
  const expiresAt = new Date(Date.now() + IMPORT_TTL_MS);
  const record = await InventoryImportModel.create({
    fileName: basename(file.originalname).slice(0, 255),
    createdBy: new Types.ObjectId(createdByUserId),
    mode,
    rows: publicRows,
    inputs,
    status: 'PREVIEWED',
    expiresAt,
  });
  return {
    importId: record._id.toString(),
    fileName: record.fileName,
    mode,
    totalRows: publicRows.length,
    validRows: publicRows.length - invalidRows,
    invalidRows,
    rows: publicRows,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function getInventoryImportPreview(
  rawImportId: string,
  createdByUserId: string,
): Promise<InventoryImportPreviewResult> {
  if (!Types.ObjectId.isValid(rawImportId))
    throw new AppError(404, 'INVENTORY_IMPORT_NOT_FOUND', 'This inventory import was not found.');
  const record = await InventoryImportModel.findOne({
    _id: new Types.ObjectId(rawImportId),
    createdBy: new Types.ObjectId(createdByUserId),
    status: 'PREVIEWED',
    expiresAt: { $gt: new Date() },
  });
  if (!record)
    throw new AppError(
      404,
      'INVENTORY_IMPORT_NOT_FOUND',
      'This import review was not found or has expired. Upload the file again.',
    );
  const rows = record.rows.map((row) =>
    row && typeof row === 'object' && 'toObject' in row
      ? (row as { toObject: () => InventoryImportPreviewRow }).toObject()
      : row,
  );
  const invalidRows = rows.filter((row) => !row.valid).length;
  return {
    importId: record._id.toString(),
    fileName: record.fileName,
    mode: record.mode,
    totalRows: rows.length,
    validRows: rows.length - invalidRows,
    invalidRows,
    rows,
    expiresAt: record.expiresAt.toISOString(),
  };
}

export async function commitInventoryImport(
  rawImportId: string,
  createdByUserId: string,
): Promise<InventoryImportResult> {
  if (!Types.ObjectId.isValid(rawImportId))
    throw new AppError(404, 'INVENTORY_IMPORT_NOT_FOUND', 'This inventory import was not found.');
  const _id = new Types.ObjectId(rawImportId);
  const createdBy = new Types.ObjectId(createdByUserId);
  const now = new Date();
  const record = await InventoryImportModel.findOneAndUpdate(
    { _id, createdBy, status: 'PREVIEWED', expiresAt: { $gt: now } },
    { $set: { status: 'PROCESSING', expiresAt: new Date(now.getTime() + IMPORT_TTL_MS) } },
    { returnDocument: 'after' },
  );
  if (!record)
    throw new AppError(
      409,
      'INVENTORY_IMPORT_NOT_COMMITTABLE',
      'This import was already submitted or has expired. Upload the file again.',
    );
  const created: InventoryImportResult['created'] = [];
  const failed: InventoryImportResult['failed'] = record.rows
    .filter((row) => !row.valid)
    .map((row) => ({
      rowNumber: row.rowNumber,
      name: row.name,
      reason: row.errors.join(' ') || 'This row did not pass validation.',
    }));
  for (const input of record.inputs) {
    let parsed: CreateMaterialRequest;
    try {
      parsed = importInputToCreateMaterialRequest(input);
      if (parsed.trackingMode === 'QUANTITY') {
        await createAssetType(parsed.category, createdByUserId);
      }
      const exactIdentity = identity(
        parsed.trackingMode,
        parsed.name,
        parsed.category,
        parsed.store,
        '',
        parsed.trackingMode === 'SERIALIZED' ? parsed.configuration : undefined,
      );
      const existing = await MaterialModel.findOne({
        $or: [
          { identityKey: exactIdentity },
          {
            trackingMode: parsed.trackingMode,
            name: exactText(parsed.name),
            category: exactText(parsed.category),
            $or: [
              { store: exactText(parsed.store) },
              { location: exactText(parsed.store) },
              { locationBlock: exactText(parsed.store) },
            ],
            ...(parsed.trackingMode === 'SERIALIZED'
              ? { configuration: exactText(parsed.configuration) }
              : {}),
          },
        ],
      });
      let material;
      if (existing && parsed.trackingMode === 'SERIALIZED') {
        for (const serialNumber of parsed.serialNumbers) {
          const result = await createAssetUnit(
            existing.materialCode,
            { serialNumber, condition: 'Good' },
            createdByUserId,
          );
          material = result.material;
        }
      } else if (existing && parsed.trackingMode === 'QUANTITY') {
        const result = await adjustQuantity(existing.materialCode, {
          quantityDelta: parsed.totalQuantity,
          reason: `Bulk inventory upload ${record.fileName}`,
        });
        material = result.material;
      } else {
        material = await createMaterial(parsed, createdByUserId);
      }
      if (!material) throw new Error('No stock was added.');
      created.push({
        materialCode: material.materialCode,
        name: material.name,
        quantity: material.totalQuantity,
      });
    } catch (error) {
      const inputName = String(input.name ?? '')
        .trim()
        .toUpperCase();
      const inputCategory = String(input.category ?? '')
        .trim()
        .toUpperCase();
      const inputConfiguration =
        input.trackingMode === 'SERIALIZED'
          ? normalizeImportConfiguration(String(input.configuration ?? ''))
          : '';
      const matchingRows = record.rows.filter(
        (row) =>
          (row.name.trim().toUpperCase() === inputName ||
            materialName(row.category, row.name).toUpperCase() === inputName) &&
          row.category.trim().toUpperCase() === inputCategory &&
          (input.trackingMode !== 'SERIALIZED' ||
            normalizeImportConfiguration(row.configuration ?? '') === inputConfiguration),
      );
      matchingRows.forEach((row) =>
        failed.push({
          rowNumber: row.rowNumber,
          name: row.name,
          reason: cleanReason(issueMessage(error)),
        }),
      );
    }
  }
  await InventoryImportModel.updateOne(
    { _id },
    { $set: { status: 'COMPLETED', completedAt: new Date() } },
  );
  return { created, failed: failed.sort((a, b) => a.rowNumber - b.rowNumber) };
}
