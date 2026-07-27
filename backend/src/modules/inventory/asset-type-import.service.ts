import { basename, extname } from 'node:path';

import { parse as parseCsv } from 'csv-parse/sync';
import { Types } from 'mongoose';
import { readSheet, type SheetData } from 'read-excel-file/node';

import type { AssetDetail, AssetDetailKind, AssetType } from '@assetdesk/contracts';

import { AppError } from '../../middleware/error-handler.js';
import { AssetTypeImportModel, type AssetTypeImportPreviewRow } from './asset-type-import.model.js';
import { AssetDetailModel } from './asset-detail.model.js';
import { AssetTypeModel } from './asset-type.model.js';
import { createAssetDetail, createAssetType } from './inventory.service.js';

const MAX_ROWS = 1_000;
const IMPORT_TTL_MS = 60 * 60 * 1_000;

export interface AssetTypeImportResult {
  created: Array<AssetType | AssetDetail>;
  skipped: Array<{ name: string; reason: string }>;
  failed: Array<{ rowNumber: number; name: string; reason: string }>;
}

export interface AssetTypeImportPreviewResult {
  importId: string;
  fileName: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rows: AssetTypeImportPreviewRow[];
  expiresAt: string;
}

function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'object' ? '' : String(value).trim();
}

function normalizedHeader(value: unknown): string {
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

async function fileTable(file: Express.Multer.File): Promise<readonly (readonly unknown[])[]> {
  const extension = extname(basename(file.originalname)).toLowerCase();
  try {
    if (extension === '.csv') {
      return parseCsv(file.buffer.toString('utf8'), {
        bom: true,
        relax_column_count: true,
        skip_empty_lines: false,
        max_record_size: 16_384,
      }) as unknown[][];
    }
    if (extension === '.xlsx') return (await readSheet(file.buffer)) as SheetData;
  } catch {
    throw new AppError(
      400,
      'ASSET_TYPE_IMPORT_FILE_INVALID',
      'The file could not be read. Check its CSV or XLSX format.',
    );
  }
  throw new AppError(415, 'ASSET_TYPE_IMPORT_TYPE_UNSUPPORTED', 'Upload a CSV or XLSX file.');
}

function parseAssetTypeRows(
  table: readonly (readonly unknown[])[],
  kindFilter?: AssetDetailKind,
): Array<{ rowNumber: number; kind: AssetDetailKind; name: string }> {
  const headerIndex = table.findIndex(hasValues);
  if (headerIndex < 0) throw new AppError(400, 'ASSET_TYPE_IMPORT_EMPTY', 'The import file is empty.');
  const headings = table[headerIndex] ?? [];
  const assetTypeIndex = headings.findIndex((heading) =>
    ['asset type', 'assettype', 'it asset', 'itasset'].includes(normalizedHeader(heading)),
  );
  const consumableTypeIndex = headings.findIndex((heading) =>
    ['it consumable', 'it consumables', 'consumable', 'consumable type', 'consumabletype'].includes(
      normalizedHeader(heading),
    ),
  );
  const locationIndex = headings.findIndex((heading) =>
    ['location', 'locations'].includes(normalizedHeader(heading)),
  );
  const blockIndex = headings.findIndex((heading) =>
    ['block', 'blocks'].includes(normalizedHeader(heading)),
  );
  const departmentIndex = headings.findIndex((heading) =>
    ['department', 'departments', 'dept'].includes(normalizedHeader(heading)),
  );
  const columnByKind: Record<AssetDetailKind, number> = {
    ASSET_TYPE: assetTypeIndex,
    CONSUMABLE_TYPE: consumableTypeIndex,
    LOCATION: locationIndex,
    BLOCK: blockIndex,
    DEPARTMENT: departmentIndex,
  };
  if (kindFilter && columnByKind[kindFilter] < 0) {
    throw new AppError(
      400,
      'ASSET_TYPE_IMPORT_COLUMNS_MISSING',
      `Add the required column: ${kindLabel(kindFilter)}.`,
    );
  }
  if (
    !kindFilter &&
    assetTypeIndex < 0 &&
    consumableTypeIndex < 0 &&
    locationIndex < 0 &&
    blockIndex < 0 &&
    departmentIndex < 0
  ) {
    throw new AppError(
      400,
      'ASSET_TYPE_IMPORT_COLUMNS_MISSING',
      'Add at least one column: IT Asset, IT Consumable, Location, Block, or Department.',
    );
  }
  const rows = table.slice(headerIndex + 1).flatMap((row, index) => {
    const rowNumber = headerIndex + index + 2;
    const entries: Array<{ rowNumber: number; kind: AssetDetailKind; name: string }> = [];
    if (kindFilter) {
      entries.push({ rowNumber, kind: kindFilter, name: text(row[columnByKind[kindFilter]]) });
    } else {
      if (assetTypeIndex >= 0) entries.push({ rowNumber, kind: 'ASSET_TYPE', name: text(row[assetTypeIndex]) });
      if (consumableTypeIndex >= 0)
        entries.push({ rowNumber, kind: 'CONSUMABLE_TYPE', name: text(row[consumableTypeIndex]) });
      if (locationIndex >= 0) entries.push({ rowNumber, kind: 'LOCATION', name: text(row[locationIndex]) });
      if (blockIndex >= 0) entries.push({ rowNumber, kind: 'BLOCK', name: text(row[blockIndex]) });
      if (departmentIndex >= 0) entries.push({ rowNumber, kind: 'DEPARTMENT', name: text(row[departmentIndex]) });
    }
    return entries.filter((entry) => entry.name.length > 0);
  });
  if (!rows.length)
    throw new AppError(400, 'ASSET_TYPE_IMPORT_NO_DATA', 'The import file contains no asset details.');
  if (rows.length > MAX_ROWS)
    throw new AppError(413, 'ASSET_TYPE_IMPORT_TOO_MANY_ROWS', `Upload no more than ${MAX_ROWS} rows.`);
  return rows;
}

function kindLabel(kind: AssetDetailKind): string {
  if (kind === 'ASSET_TYPE') return 'IT Asset';
  if (kind === 'CONSUMABLE_TYPE') return 'IT Consumable';
  if (kind === 'LOCATION') return 'Location';
  if (kind === 'BLOCK') return 'Block';
  return 'Department';
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleUpperCase('en-US');
}

function normalizeDetailName(name: string): string {
  return name.trim().replace(/\s+/g, '').toLocaleUpperCase('en-US');
}

export async function previewAssetTypeImport(
  file: Express.Multer.File,
  createdByUserId: string,
  kindFilter?: AssetDetailKind,
): Promise<AssetTypeImportPreviewResult> {
  const rows = parseAssetTypeRows(await fileTable(file), kindFilter);
  const seen = new Set<string>();
  const publicRows: AssetTypeImportPreviewRow[] = [];
  const inputs: Array<{ kind: AssetDetailKind; name: string }> = [];

  for (const row of rows) {
    const normalized = `${row.kind}:${normalizeDetailName(row.name)}`;
    if (seen.has(normalized)) {
      publicRows.push({
        rowNumber: row.rowNumber,
        kind: row.kind,
        name: row.name,
        valid: false,
        errors: ['Duplicate in this file.'],
      });
      continue;
    }
    seen.add(normalized);
    try {
      if (row.name.trim().length < 1 || row.name.trim().length > 120) {
        throw new Error('Name must be 1 to 120 characters.');
      }
      const existing = await AssetDetailModel.exists({
        kind: row.kind,
        normalizedName: normalizeDetailName(row.name),
      });
      const legacyAssetType =
        row.kind === 'ASSET_TYPE' || row.kind === 'CONSUMABLE_TYPE'
          ? await AssetTypeModel.exists({ normalizedName: normalizeName(row.name) })
          : null;
      if (existing || legacyAssetType) {
        publicRows.push({
          rowNumber: row.rowNumber,
          kind: row.kind,
          name: row.name,
          valid: false,
          errors: ['Already exists.'],
        });
        continue;
      }
      publicRows.push({ rowNumber: row.rowNumber, kind: row.kind, name: row.name, valid: true, errors: [] });
      inputs.push({ kind: row.kind, name: row.name });
    } catch (error) {
      publicRows.push({
        rowNumber: row.rowNumber,
        kind: row.kind,
        name: row.name,
        valid: false,
        errors: [error instanceof Error ? error.message : 'This asset type could not be saved.'],
      });
    }
  }
  const expiresAt = new Date(Date.now() + IMPORT_TTL_MS);
  const record = await AssetTypeImportModel.create({
    fileName: basename(file.originalname).slice(0, 255),
    createdBy: new Types.ObjectId(createdByUserId),
    rows: publicRows,
    inputs,
    status: 'PREVIEWED',
    expiresAt,
  });
  const invalidRows = publicRows.filter((row) => !row.valid).length;
  return {
    importId: record._id.toString(),
    fileName: record.fileName,
    totalRows: publicRows.length,
    validRows: publicRows.length - invalidRows,
    invalidRows,
    rows: publicRows,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function commitAssetTypeImport(
  rawImportId: string,
  createdByUserId: string,
): Promise<AssetTypeImportResult> {
  if (!Types.ObjectId.isValid(rawImportId))
    throw new AppError(404, 'ASSET_TYPE_IMPORT_NOT_FOUND', 'This asset type import was not found.');
  const _id = new Types.ObjectId(rawImportId);
  const createdBy = new Types.ObjectId(createdByUserId);
  const now = new Date();
  const record = await AssetTypeImportModel.findOneAndUpdate(
    { _id, createdBy, status: 'PREVIEWED', expiresAt: { $gt: now } },
    { $set: { status: 'PROCESSING', expiresAt: new Date(now.getTime() + IMPORT_TTL_MS) } },
    { returnDocument: 'after' },
  );
  if (!record)
    throw new AppError(
      409,
      'ASSET_TYPE_IMPORT_NOT_COMMITTABLE',
      'This import was already submitted or has expired. Upload the file again.',
    );
  const created: Array<AssetType | AssetDetail> = [];
  const skipped: AssetTypeImportResult['skipped'] = record.rows
    .filter((row) => !row.valid)
    .map((row) => ({ name: row.name, reason: row.errors.join(' ') }));
  const failed: AssetTypeImportResult['failed'] = [];

  for (const input of record.inputs) {
    try {
      const kind = input.kind as AssetDetailKind;
      const name = input.name;
      const existing = await AssetDetailModel.exists({
        kind,
        normalizedName: normalizeDetailName(name),
      });
      if (existing) {
        skipped.push({ name, reason: 'Already exists.' });
        continue;
      }
      created.push(await createAssetDetail(kind, name, createdByUserId));
      if (kind === 'ASSET_TYPE' || kind === 'CONSUMABLE_TYPE') await createAssetType(name, createdByUserId);
    } catch (error) {
      const name = input.name;
      const matchingRow = record.rows.find((row) => normalizeDetailName(row.name) === normalizeDetailName(name));
      failed.push({
        rowNumber: matchingRow?.rowNumber ?? 1,
        name,
        reason: error instanceof Error ? error.message : 'This asset type could not be saved.',
      });
    }
  }
  await AssetTypeImportModel.updateOne(
    { _id },
    { $set: { status: 'COMPLETED', completedAt: new Date() } },
  );

  return { created, skipped, failed };
}
