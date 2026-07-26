import type { QueryFilter } from 'mongoose';

import type { IssueReportFilters, IssueReportRow } from '@assetdesk/contracts';

import { AppError } from '../../middleware/error-handler.js';
import { istDayRange } from '../issues/issue-date.js';
import { IssueModel, type IssueDocument } from '../issues/issue.model.js';
import { buildIssueSearchFilter } from '../issues/issue.service.js';
import { createCsv } from './csv.js';

const reportFields =
  'issueId status issuedAt expectedReturnAt receiver.fullName receiver.type receiver.department issuedBy.workerId issuedBy.name lines.material.name lines.material.trackingMode lines.issuedQuantity lines.outstandingQuantity lines.assets.serialNumber totalIssuedQuantity totalOutstandingQuantity returnEvents.returnEventId';
const DAY_MILLISECONDS = 86_400_000;
const MAX_REPORT_DAYS = 366;

function reportRange(filters: IssueReportFilters): { start: Date; end: Date } {
  const start = new Date(`${filters.issuedFrom}T00:00:00+05:30`);
  const through = new Date(`${filters.issuedThrough}T00:00:00+05:30`);
  const end = new Date(through.getTime() + DAY_MILLISECONDS);
  if (end <= start || end.getTime() - start.getTime() > MAX_REPORT_DAYS * DAY_MILLISECONDS) {
    throw new AppError(
      400,
      'REPORT_DATE_RANGE_INVALID',
      'Choose an inclusive report range of at most 366 days.',
      { issuedThrough: 'Choose a date on or after the start date within 366 days.' },
    );
  }
  return { start, end };
}

function reportFilter(filters: IssueReportFilters, now = new Date()): QueryFilter<unknown> {
  const range = reportRange(filters);
  const filter: QueryFilter<unknown> = { issuedAt: { $gte: range.start, $lt: range.end } };
  const clauses: QueryFilter<unknown>[] = [];
  if (filters.status) filter.status = filters.status;
  if (filters.receiverType) filter['receiver.type'] = filters.receiverType;
  if (filters.search) clauses.push(buildIssueSearchFilter(filters.search));
  if (filters.returnState) {
    const today = istDayRange(now);
    clauses.push({
      status: { $in: ['ISSUED', 'PARTIALLY_RETURNED'] },
      totalOutstandingQuantity: { $gt: 0 },
    });
    if (filters.returnState === 'DUE_TODAY') {
      filter.expectedReturnAt = { $gte: today.start, $lt: today.end };
    }
  }
  if (clauses.length) filter.$and = clauses;
  return filter;
}

function toRow(issue: IssueDocument): IssueReportRow {
  const lines = issue.lines ?? [];
  const returnEvents = issue.returnEvents ?? [];
  return {
    issueId: issue.issueId,
    status: issue.status,
    issuedAt: issue.issuedAt.toISOString(),
    expectedReturnAt: issue.expectedReturnAt?.toISOString() ?? null,
    receiverName: issue.receiver.fullName,
    receiverType: issue.receiver.type,
    department: issue.receiver.department ?? null,
    issuedByWorkerId: issue.issuedBy.workerId,
    issuedByName: issue.issuedBy.name,
    materials: lines.map(
      (line) =>
        `${line.material.name} — issued ${line.issuedQuantity}, outstanding ${line.outstandingQuantity}`,
    ),
    materialTypes: [
      ...new Set(
        lines.map((line) =>
          line.material.trackingMode === 'SERIALIZED' ? 'IT Asset' : 'IT Consumable',
        ),
      ),
    ],
    serialNumbers: lines.flatMap((line) =>
      (line.assets ?? []).flatMap((asset) => (asset.serialNumber ? [asset.serialNumber] : [])),
    ),
    totalIssuedQuantity: issue.totalIssuedQuantity,
    totalOutstandingQuantity: issue.totalOutstandingQuantity,
    returnEventCount: returnEvents.length,
  };
}

export async function previewIssueReport(
  filters: IssueReportFilters,
  page: number,
  pageSize: number,
) {
  const filter = reportFilter(filters);
  const skip = (page - 1) * pageSize;
  const [records, total] = await Promise.all([
    IssueModel.find(filter)
      .select(reportFields)
      .sort({ issuedAt: -1, _id: -1 })
      .skip(skip)
      .limit(pageSize),
    IssueModel.countDocuments(filter),
  ]);
  return {
    rows: records.map(toRow),
    page,
    pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    generatedAt: new Date().toISOString(),
  };
}

export async function exportIssueReport(filters: IssueReportFilters) {
  const filter = reportFilter(filters);
  const records = await IssueModel.find(filter)
    .select(reportFields)
    .sort({ issuedAt: -1, _id: -1 })
    .limit(5_001);
  if (records.length > 5_000) {
    throw new AppError(
      422,
      'REPORT_EXPORT_LIMIT_EXCEEDED',
      'This report has more than 5,000 rows. Choose a smaller date range.',
    );
  }
  const formatter = new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });
  const rows = records.map(toRow);
  const csv = createCsv(
    [
      'Issue ID',
      'Status',
      'Issued at (IST)',
      'Expected Return (IST)',
      'Receiver',
      'Receiver type',
      'Department',
      'Issued by ID',
      'Issued by name',
      'Materials',
      'Material types',
      'Serial numbers',
      'Total issued',
      'Outstanding',
      'Return events',
    ],
    rows.map((row) => [
      row.issueId,
      row.status,
      formatter.format(new Date(row.issuedAt)),
      row.expectedReturnAt ? formatter.format(new Date(row.expectedReturnAt)) : '',
      row.receiverName,
      row.receiverType,
      row.department ?? '',
      row.issuedByWorkerId,
      row.issuedByName,
      row.materials.join(' | '),
      row.materialTypes.join(' | '),
      row.serialNumbers.join(' | '),
      row.totalIssuedQuantity,
      row.totalOutstandingQuantity,
      row.returnEventCount,
    ]),
  );
  return { csv, rowCount: rows.length };
}
