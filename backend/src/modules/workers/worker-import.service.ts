import { basename, extname } from 'node:path';

import { parse as parseCsv } from 'csv-parse/sync';
import { Types } from 'mongoose';
import { readSheet, type SheetData } from 'read-excel-file/node';
import type { ZodError } from 'zod';

import {
  CreateWorkerRequestSchema,
  type WorkerImportCommitResponse,
  type WorkerImportPreviewResponse,
} from '@assetdesk/contracts';

import { AppError } from '../../middleware/error-handler.js';
import { UserModel } from '../users/user.model.js';
import { WorkerImportModel, type WorkerImportRow } from './worker-import.model.js';
import { createWorker } from './worker.service.js';

const MAX_IMPORT_ROWS = 1_000;
const IMPORT_TTL_MS = 60 * 60 * 1_000;
const IMPORT_CONCURRENCY = 4;

type ImportField = 'name' | 'email' | 'contact' | 'department';

const HEADER_ALIASES: Record<string, ImportField> = {
  name: 'name',
  'worker name': 'name',
  'full name': 'name',
  email: 'email',
  'email id': 'email',
  'email address': 'email',
  contact: 'contact',
  'contact number': 'contact',
  phone: 'contact',
  'phone number': 'contact',
  mobile: 'contact',
  department: 'department',
  dept: 'department',
};

interface ParsedImport {
  rows: WorkerImportRow[];
  fileName: string;
}

interface ImportFailure {
  rowNumber: number;
  email: string;
  reason: string;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  return '';
}

function normalizedHeader(value: unknown): string {
  return cellText(value)
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tableHasValues(row: readonly unknown[]): boolean {
  return row.some((cell) => cellText(cell).length > 0);
}

function publicRow(row: WorkerImportRow): WorkerImportPreviewResponse['data']['rows'][number] {
  return {
    rowNumber: row.rowNumber,
    name: row.name,
    email: row.email,
    ...(row.contact ? { contact: row.contact } : {}),
    ...(row.department ? { department: row.department } : {}),
    valid: row.valid,
    errors: row.errors,
  };
}

function zodRowErrors(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const field = issue.path[0];
    const label = typeof field === 'string' ? `${field}: ` : '';
    return `${label}${issue.message}`;
  });
}

export function parseWorkerImportTable(table: readonly (readonly unknown[])[]): WorkerImportRow[] {
  const headerIndex = table.findIndex(tableHasValues);
  if (headerIndex < 0) {
    throw new AppError(400, 'WORKER_IMPORT_EMPTY', 'The import file is empty.');
  }

  const header = table[headerIndex] ?? [];
  const columns = new Map<ImportField, number>();

  for (const [index, rawHeader] of header.entries()) {
    const field = HEADER_ALIASES[normalizedHeader(rawHeader)];
    if (!field) continue;
    if (columns.has(field)) {
      throw new AppError(
        400,
        'WORKER_IMPORT_DUPLICATE_COLUMN',
        `The import file contains more than one ${field} column.`,
      );
    }
    columns.set(field, index);
  }

  const missing = (['name', 'email'] as const).filter((field) => !columns.has(field));
  if (missing.length > 0) {
    throw new AppError(
      400,
      'WORKER_IMPORT_COLUMNS_MISSING',
      'The import file must contain Name and Email columns.',
      Object.fromEntries(missing.map((field) => [field, `Add a ${field} column.`])),
    );
  }

  const dataRows = table
    .slice(headerIndex + 1)
    .map((row, index) => ({ row, rowNumber: headerIndex + index + 2 }))
    .filter(({ row }) => tableHasValues(row));

  if (dataRows.length === 0) {
    throw new AppError(400, 'WORKER_IMPORT_NO_DATA', 'The import file has no Worker rows.');
  }
  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw new AppError(
      413,
      'WORKER_IMPORT_TOO_MANY_ROWS',
      `Upload no more than ${MAX_IMPORT_ROWS} Worker rows at a time.`,
    );
  }

  const parsedRows = dataRows.map<WorkerImportRow>(({ row, rowNumber }) => {
    const value = (field: ImportField): string => {
      const index = columns.get(field);
      return index === undefined ? '' : cellText(row[index]);
    };
    const name = value('name');
    const email = value('email').toLowerCase();
    const contact = value('contact');
    const department = value('department');
    const parsed = CreateWorkerRequestSchema.safeParse({
      name,
      email,
      ...(contact ? { contact } : {}),
      ...(department ? { department } : {}),
    });
    const errors: string[] = parsed.success ? [] : zodRowErrors(parsed.error);

    const overflow = row.slice(header.length).some((cell) => cellText(cell).length > 0);
    if (overflow) errors.push('The row contains values beyond the header columns.');

    return {
      rowNumber,
      name,
      email,
      emailNormalized: email,
      ...(contact ? { contact } : {}),
      ...(department ? { department } : {}),
      valid: errors.length === 0,
      errors,
    };
  });

  const emailCounts = new Map<string, number>();
  for (const row of parsedRows) {
    if (!row.emailNormalized) continue;
    emailCounts.set(row.emailNormalized, (emailCounts.get(row.emailNormalized) ?? 0) + 1);
  }
  for (const row of parsedRows) {
    if ((emailCounts.get(row.emailNormalized) ?? 0) > 1) {
      row.errors.push('Duplicate email in this import file.');
      row.valid = false;
    }
  }

  return parsedRows;
}

async function parseFile(fileName: string, buffer: Buffer): Promise<ParsedImport> {
  const safeFileName = basename(fileName).slice(0, 255);
  const extension = extname(safeFileName).toLowerCase();
  let table: readonly (readonly unknown[])[];

  try {
    if (extension === '.csv') {
      const content = buffer.toString('utf8');
      if (content.includes('\uFFFD')) {
        throw new AppError(
          400,
          'WORKER_IMPORT_ENCODING_INVALID',
          'Save the CSV file with UTF-8 encoding and upload it again.',
        );
      }
      table = parseCsv(content, {
        bom: true,
        relax_column_count: true,
        skip_empty_lines: false,
        max_record_size: 16_384,
      });
    } else if (extension === '.xlsx') {
      table = (await readSheet(buffer)) as SheetData;
    } else {
      throw new AppError(
        415,
        'WORKER_IMPORT_FILE_TYPE_UNSUPPORTED',
        'Upload a .csv or .xlsx file.',
      );
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      400,
      'WORKER_IMPORT_FILE_INVALID',
      'The uploaded file could not be read. Check its format and try again.',
    );
  }

  return { rows: parseWorkerImportTable(table), fileName: safeFileName };
}

async function markExistingEmails(rows: WorkerImportRow[]): Promise<void> {
  const emails = [...new Set(rows.map((row) => row.emailNormalized).filter(Boolean))];
  if (emails.length === 0) return;

  const existing = await UserModel.find({ emailNormalized: { $in: emails } })
    .select({ emailNormalized: 1 })
    .lean();
  const existingEmails = new Set(existing.map((user) => user.emailNormalized));

  for (const row of rows) {
    if (existingEmails.has(row.emailNormalized)) {
      row.errors.push('A user with this email already exists.');
      row.valid = false;
    }
  }
}

export async function previewWorkerImport(
  file: Express.Multer.File,
  createdByUserId: string,
): Promise<WorkerImportPreviewResponse['data']> {
  const parsed = await parseFile(file.originalname, file.buffer);
  await markExistingEmails(parsed.rows);

  const expiresAt = new Date(Date.now() + IMPORT_TTL_MS);
  const record = await WorkerImportModel.create({
    fileName: parsed.fileName,
    createdBy: new Types.ObjectId(createdByUserId),
    rows: parsed.rows,
    status: 'PREVIEWED',
    expiresAt,
  });
  const validRows = parsed.rows.filter((row) => row.valid).length;

  return {
    importId: record._id.toString(),
    fileName: record.fileName,
    totalRows: parsed.rows.length,
    validRows,
    invalidRows: parsed.rows.length - validRows,
    rows: parsed.rows.map(publicRow),
    expiresAt: expiresAt.toISOString(),
  };
}

function importId(value: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) {
    throw new AppError(404, 'WORKER_IMPORT_NOT_FOUND', 'This Worker import was not found.');
  }
  return new Types.ObjectId(value);
}

function safeFailure(error: unknown): string {
  if (error instanceof AppError && error.code === 'WORKER_EMAIL_EXISTS') return error.message;
  return 'The Worker could not be created. Try this row again separately.';
}

async function createValidRows(
  rows: WorkerImportRow[],
  createdByUserId: string,
): Promise<{
  created: WorkerImportCommitResponse['data']['created'];
  failed: ImportFailure[];
}> {
  const created: WorkerImportCommitResponse['data']['created'] = [];
  const failed: ImportFailure[] = rows
    .filter((row) => !row.valid)
    .map((row) => ({
      rowNumber: row.rowNumber,
      email: row.email,
      reason: row.errors.join(' '),
    }));
  const validRows = rows.filter((row) => row.valid);
  let cursor = 0;

  const runners = Array.from(
    { length: Math.min(IMPORT_CONCURRENCY, validRows.length) },
    async () => {
      while (cursor < validRows.length) {
        const row = validRows[cursor];
        cursor += 1;
        if (!row) continue;
        try {
          const input = CreateWorkerRequestSchema.parse({
            name: row.name,
            email: row.email,
            ...(row.contact ? { contact: row.contact } : {}),
            ...(row.department ? { department: row.department } : {}),
          });
          created.push(await createWorker(input, createdByUserId));
        } catch (error) {
          failed.push({
            rowNumber: row.rowNumber,
            email: row.email,
            reason: safeFailure(error),
          });
        }
      }
    },
  );

  await Promise.all(runners);
  created.sort((left, right) => left.worker.email.localeCompare(right.worker.email));
  failed.sort((left, right) => left.rowNumber - right.rowNumber);
  return { created, failed };
}

export async function commitWorkerImport(
  rawImportId: string,
  createdByUserId: string,
): Promise<WorkerImportCommitResponse['data']> {
  const _id = importId(rawImportId);
  const createdBy = new Types.ObjectId(createdByUserId);
  const now = new Date();
  const processingExpiresAt = new Date(now.getTime() + IMPORT_TTL_MS);

  // This compare-and-set is the import idempotency boundary. Only one request
  // can move PREVIEWED to PROCESSING, so a double tap cannot create duplicates.
  const record = await WorkerImportModel.findOneAndUpdate(
    { _id, createdBy, status: 'PREVIEWED', expiresAt: { $gt: now } },
    { $set: { status: 'PROCESSING', expiresAt: processingExpiresAt } },
    { returnDocument: 'after' },
  );

  if (!record) {
    const existing = await WorkerImportModel.findOne({ _id, createdBy });
    if (!existing) {
      throw new AppError(404, 'WORKER_IMPORT_NOT_FOUND', 'This Worker import was not found.');
    }
    if (existing.expiresAt <= now) {
      throw new AppError(410, 'WORKER_IMPORT_EXPIRED', 'This Worker import preview has expired.');
    }
    throw new AppError(
      409,
      'WORKER_IMPORT_ALREADY_COMMITTED',
      'This Worker import is already processing or completed.',
    );
  }

  const result = await createValidRows(record.rows, createdByUserId);
  await WorkerImportModel.updateOne(
    { _id: record._id, status: 'PROCESSING' },
    { $set: { status: 'COMPLETED', completedAt: new Date() } },
  );

  return { importId: record._id.toString(), ...result };
}
