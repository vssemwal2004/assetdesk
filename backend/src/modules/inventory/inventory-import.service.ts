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
import {
  InventoryImportModel,
  type InventoryImportInput,
  type InventoryImportPreviewRow,
} from './inventory-import.model.js';
import { createMaterial } from './inventory.service.js';
import { MaterialModel } from './material.model.js';

const MAX_ROWS = 1_000;
const IMPORT_TTL_MS = 60 * 60 * 1_000;
type Field =
  'name' | 'category' | 'description' | 'serialNumber' | 'quantity' | 'unitLabel' | 'returnPolicy';

const HEADER_ALIASES: Record<string, Field> = {
  name: 'name',
  'material name': 'name',
  category: 'category',
  group: 'category',
  'material group': 'category',
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
      ? ['name', 'category', 'serialNumber']
      : ['name', 'category', 'quantity', 'unitLabel'];
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
    return issues?.[0]?.message ?? 'Check this row.';
  }
  return 'This material could not be created.';
}

function identity(mode: TrackingMode, name: string, category: string): string {
  return `${mode}|${name.trim().toUpperCase()}|${category.trim().toUpperCase()}`;
}

function exact(value: string): RegExp {
  return new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
}

export async function previewInventoryImport(
  file: Express.Multer.File,
  mode: TrackingMode,
  createdByUserId: string,
): Promise<InventoryImportPreviewResult> {
  const rows = parseInventoryImportTable(await fileTable(file), mode);
  const groups =
    mode === 'SERIALIZED'
      ? Object.values(
          rows.reduce<Record<string, ImportRow[]>>((result, row) => {
            const key = `${row.values.name.toUpperCase()}\0${row.values.category.toUpperCase()}`;
            (result[key] ??= []).push(row);
            return result;
          }, {}),
        )
      : rows.map((row) => [row]);

  const previewRows = new Map<number, InventoryImportPreviewRow>(
    rows.map((row) => [
      row.rowNumber,
      {
        rowNumber: row.rowNumber,
        name: row.values.name,
        category: row.values.category,
        ...(row.values.serialNumber ? { serialNumber: row.values.serialNumber } : {}),
        ...(row.values.quantity ? { quantity: Number(row.values.quantity) } : {}),
        ...(row.values.unitLabel ? { unitLabel: row.values.unitLabel } : {}),
        valid: true,
        errors: [],
      },
    ]),
  );
  const inputs: InventoryImportInput[] = [];
  const fileIdentities = new Set<string>();
  const fileSerials = new Set<string>();

  for (const group of groups) {
    const first = group[0];
    if (!first) continue;
    try {
      const values = first.values;
      const materialIdentity = identity(mode, values.name, values.category);
      if (fileIdentities.has(materialIdentity))
        throw new Error('Duplicate material in this import file.');
      fileIdentities.add(materialIdentity);
      const existingMaterial = await MaterialModel.exists({
        trackingMode: mode,
        name: exact(values.name),
        category: exact(values.category),
      });
      if (existingMaterial) throw new Error('This material already exists in Inventory.');
      let draft: CreateMaterialRequest;
      if (mode === 'SERIALIZED') {
        const serialNumbers = group.map((row) => row.values.serialNumber);
        const unique = new Set(serialNumbers.map((value) => value.toUpperCase()));
        if (unique.size !== serialNumbers.length)
          throw new Error('Duplicate serial number in file.');
        for (const serialNumber of serialNumbers) {
          const normalized = serialNumber.toUpperCase();
          if (fileSerials.has(normalized)) throw new Error('Duplicate serial number in file.');
          fileSerials.add(normalized);
        }
        const existingSerial = await AssetUnitModel.exists({
          serialNumberNormalized: { $in: serialNumbers.map((value) => value.toUpperCase()) },
        });
        if (existingSerial) throw new Error('A serial number in this material already exists.');
        draft = CreateMaterialRequestSchema.parse({
          name: values.name,
          category: values.category,
          ...(values.description ? { description: values.description } : {}),
          trackingMode: 'SERIALIZED',
          returnPolicy: 'REUSABLE',
          assignmentTypes: ['LONG_TERM'],
          serialNumbers,
        });
      } else {
        draft = CreateMaterialRequestSchema.parse({
          name: values.name,
          category: values.category,
          ...(values.description ? { description: values.description } : {}),
          trackingMode: 'QUANTITY',
          returnPolicy:
            values.returnPolicy.toUpperCase() === 'CONSUMABLE' ? 'CONSUMABLE' : 'REUSABLE',
          assignmentTypes: ['SHORT_TERM'],
          totalQuantity: Number(values.quantity),
          unitLabel: values.unitLabel,
        });
      }
      inputs.push(draft);
    } catch (error) {
      const reason = error instanceof Error ? error.message : issueMessage(error);
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
  if (record.rows.some((row) => !row.valid)) {
    await InventoryImportModel.updateOne({ _id }, { $set: { status: 'PREVIEWED' } });
    throw new AppError(
      409,
      'INVENTORY_IMPORT_HAS_ERRORS',
      'Correct every invalid row and upload the file again before submitting.',
    );
  }

  const created: InventoryImportResult['created'] = [];
  const failed: InventoryImportResult['failed'] = [];
  for (const input of record.inputs) {
    let parsed: CreateMaterialRequest;
    try {
      parsed = CreateMaterialRequestSchema.parse(input);
      const material = await createMaterial(parsed, createdByUserId);
      created.push({
        materialCode: material.materialCode,
        name: material.name,
        quantity: material.totalQuantity,
      });
    } catch (error) {
      const matchingRows = record.rows.filter(
        (row) =>
          row.name.trim().toUpperCase() ===
            String(input.name ?? '')
              .trim()
              .toUpperCase() &&
          row.category.trim().toUpperCase() ===
            String(input.category ?? '')
              .trim()
              .toUpperCase(),
      );
      matchingRows.forEach((row) =>
        failed.push({ rowNumber: row.rowNumber, name: row.name, reason: issueMessage(error) }),
      );
    }
  }
  await InventoryImportModel.updateOne(
    { _id },
    { $set: { status: 'COMPLETED', completedAt: new Date() } },
  );
  return { created, failed: failed.sort((a, b) => a.rowNumber - b.rowNumber) };
}
