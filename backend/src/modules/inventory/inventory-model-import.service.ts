import { basename, extname } from 'node:path';

import { parse as parseCsv } from 'csv-parse/sync';
import { readSheet, type SheetData } from 'read-excel-file/node';

import type { TrackingMode } from '@assetdesk/contracts';

import { AppError } from '../../middleware/error-handler.js';
import { AssetDetailModel } from './asset-detail.model.js';
import { AssetTypeModel } from './asset-type.model.js';
import { createInventoryModel } from './inventory-model.service.js';

const MAX_MODEL_ROWS = 1_000;

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

function normalized(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, '').toLocaleUpperCase('en-US');
}

async function table(file: Express.Multer.File): Promise<readonly (readonly unknown[])[]> {
  const extension = extname(basename(file.originalname)).toLowerCase();
  try {
    if (extension === '.csv')
      return parseCsv(file.buffer.toString('utf8'), {
        bom: true,
        relax_column_count: true,
        skip_empty_lines: true,
      }) as unknown[][];
    if (extension === '.xlsx') return (await readSheet(file.buffer)) as SheetData;
  } catch {
    throw new AppError(400, 'MODEL_IMPORT_FILE_INVALID', 'The model file could not be read.');
  }
  throw new AppError(415, 'MODEL_IMPORT_TYPE_UNSUPPORTED', 'Upload a CSV or XLSX file.');
}

export async function importInventoryModels(
  file: Express.Multer.File,
  trackingMode: TrackingMode,
  userId: string,
): Promise<{
  created: Array<{ rowNumber: number; category: string; name: string }>;
  failed: Array<{ rowNumber: number; category: string; name: string; reason: string }>;
}> {
  const rows = await table(file);
  if (rows.length === 0) throw new AppError(400, 'MODEL_IMPORT_EMPTY', 'The model file is empty.');
  const headings = (rows[0] ?? []).map((value) =>
    text(value).toLocaleLowerCase('en-US').replace(/[_-]+/g, ' ').replace(/\s+/g, ' '),
  );
  const categoryIndex = headings.findIndex((value) =>
    ['category', 'asset type', 'it asset', 'consumable type', 'it consumable'].includes(value),
  );
  const modelIndex = headings.findIndex((value) =>
    ['model', 'model name', 'type model name', 'type/model name'].includes(value),
  );
  if (categoryIndex < 0 || modelIndex < 0) {
    throw new AppError(
      400,
      'MODEL_IMPORT_COLUMNS_MISSING',
      'Add the required columns: Category and Model Name.',
    );
  }
  const dataRows = rows.slice(1).filter((row) => row.some((value) => text(value)));
  if (dataRows.length > MAX_MODEL_ROWS)
    throw new AppError(413, 'MODEL_IMPORT_TOO_MANY_ROWS', 'Upload no more than 1,000 models.');

  const kind = trackingMode === 'SERIALIZED' ? 'ASSET_TYPE' : 'CONSUMABLE_TYPE';
  const details = await AssetDetailModel.find({ kind }).lean();
  const legacyTypes = trackingMode === 'SERIALIZED' ? await AssetTypeModel.find().lean() : [];
  const categories = new Map(
    [...details, ...legacyTypes].map((detail) => [normalized(detail.name), detail.name]),
  );
  const created: Array<{ rowNumber: number; category: string; name: string }> = [];
  const failed: Array<{ rowNumber: number; category: string; name: string; reason: string }> = [];
  const seen = new Set<string>();

  for (const [index, row] of dataRows.entries()) {
    const rowNumber = index + 2;
    const rawCategory = text(row[categoryIndex]);
    const name = text(row[modelIndex]);
    const category = categories.get(normalized(rawCategory));
    try {
      if (!rawCategory) throw new Error('Category is required.');
      if (!name) throw new Error('Model Name is required.');
      if (!category)
        throw new Error(`Category "${rawCategory}" is not saved in Add asset details.`);
      const key = `${normalized(category)}|${normalized(name)}`;
      if (seen.has(key)) throw new Error('Duplicate category and model in this file.');
      seen.add(key);
      const model = await createInventoryModel(category, name, trackingMode, userId);
      created.push({ rowNumber, category: model.category, name: model.name });
    } catch (error) {
      failed.push({
        rowNumber,
        category: category ?? rawCategory,
        name,
        reason: error instanceof Error ? error.message : 'This model could not be added.',
      });
    }
  }
  return { created, failed };
}
