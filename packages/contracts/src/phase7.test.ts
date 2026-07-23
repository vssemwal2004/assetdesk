import { describe, expect, it } from 'vitest';

import {
  AuditEventsResponseSchema,
  CreateReminderResponseSchema,
  ExportIssueReportRequestSchema,
  IssueRemindersResponseSchema,
  IssueReportFiltersSchema,
  IssueReportResponseSchema,
  OverdueIssuesResponseSchema,
} from './index.js';

const actor = {
  userId: 'admin-user-id',
  workerId: 'GEU-WRK-A7K4',
  name: 'Anita Sharma',
  role: 'ADMIN',
} as const;

const overdueIssue = {
  id: 'issue-document-id',
  issueId: 'GEU-ISS-2026-000123',
  receiver: {
    receiverCode: 'GEU-RCV-000125',
    fullName: 'Neha Verma',
    universityId: 'FAC-112',
    type: 'FACULTY',
    department: 'Computer Science',
    contact: '9876543210',
    email: 'neha.verma@university.edu',
  },
  issuedBy: actor,
  issuedAt: '2026-07-10T09:00:00.000Z',
  expectedReturnAt: '2026-07-11T09:00:00.000Z',
  duePreset: 'ONE_DAY',
  status: 'ISSUED',
  purpose: 'Lab setup',
  notes: null,
  totalIssuedQuantity: 2,
  totalOutstandingQuantity: 2,
  hasDamagedOutcome: false,
  hasLostOutcome: false,
  reminderCount: 1,
  lastReminderAt: '2026-07-12T09:00:00.000Z',
  createdAt: '2026-07-10T09:00:00.000Z',
  updatedAt: '2026-07-12T09:00:00.000Z',
  materialNames: ['Core switch'],
  overdueMinutes: 7_200,
} as const;

const reminder = {
  reminderId: '11111111-1111-4111-8111-111111111111',
  issueId: 'GEU-ISS-2026-000123',
  sentAt: '2026-07-12T09:00:00.000Z',
  sentBy: actor,
  expectedReturnAt: '2026-07-11T09:00:00.000Z',
  overdueMinutes: 1_440,
  notificationCount: 1,
} as const;

const reportRow = {
  issueId: 'GEU-ISS-2026-000123',
  status: 'ISSUED',
  issuedAt: '2026-07-10T09:00:00.000Z',
  expectedReturnAt: '2026-07-11T09:00:00.000Z',
  receiverName: 'Neha Verma',
  receiverType: 'FACULTY',
  department: 'Computer Science',
  issuedByWorkerId: 'GEU-WRK-A7K4',
  issuedByName: 'Anita Sharma',
  materials: ['Core switch'],
  materialTypes: ['IT Asset'],
  serialNumbers: ['SWITCH-001', 'SWITCH-002'],
  totalIssuedQuantity: 2,
  totalOutstandingQuantity: 2,
  returnEventCount: 0,
} as const;

describe('Phase 7 overdue and reminder contracts', () => {
  it('accepts a paginated overdue record with reminder history', () => {
    const parsed = OverdueIssuesResponseSchema.parse({
      data: [overdueIssue],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });

    expect(parsed.data[0]?.overdueMinutes).toBe(7_200);
    expect(parsed.data[0]?.reminderCount).toBe(1);
  });

  it('requires a due time and non-negative overdue evidence', () => {
    expect(
      OverdueIssuesResponseSchema.safeParse({
        data: [{ ...overdueIssue, expectedReturnAt: null }],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      }).success,
    ).toBe(false);
    expect(
      OverdueIssuesResponseSchema.safeParse({
        data: [{ ...overdueIssue, overdueMinutes: -1 }],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      }).success,
    ).toBe(false);
  });

  it('validates both create and history reminder responses', () => {
    expect(
      CreateReminderResponseSchema.parse({
        data: { reminder },
        meta: { idempotentReplay: false },
      }).data.reminder.notificationCount,
    ).toBe(1);
    expect(
      IssueRemindersResponseSchema.parse({ data: { reminders: [reminder] } }).data.reminders,
    ).toHaveLength(1);

    expect(
      CreateReminderResponseSchema.safeParse({
        data: { reminder: { ...reminder, notificationCount: 0 } },
        meta: { idempotentReplay: false },
      }).success,
    ).toBe(false);
  });
});

describe('Phase 7 audit contracts', () => {
  it('accepts sanitized immutable operational evidence', () => {
    const parsed = AuditEventsResponseSchema.parse({
      data: [
        {
          id: 'audit-event-id',
          timestampUtc: '2026-07-12T09:00:00.000Z',
          requestId: 'request-id',
          actorWorkerId: 'GEU-WRK-A7K4',
          actorRole: 'ADMIN',
          action: 'RETURN_REMINDER_SENT',
          targetType: 'ISSUE',
          targetId: 'GEU-ISS-2026-000123',
          result: 'SUCCESS',
          reasonCode: null,
          metadata: { reminderCount: 1 },
        },
      ],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });

    expect(parsed.data[0]?.action).toBe('RETURN_REMINDER_SENT');
  });

  it('rejects unknown results and uncontracted evidence fields', () => {
    const base = {
      id: 'audit-event-id',
      timestampUtc: '2026-07-12T09:00:00.000Z',
      requestId: 'request-id',
      actorWorkerId: null,
      actorRole: null,
      action: 'AUTH_LOGIN',
      targetType: 'SESSION',
      targetId: null,
      result: 'UNKNOWN',
      reasonCode: null,
      metadata: null,
      rawPassword: 'must-not-pass',
    };

    expect(
      AuditEventsResponseSchema.safeParse({
        data: [base],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      }).success,
    ).toBe(false);
  });
});

describe('Phase 7 Issue Register contracts', () => {
  it('normalizes report search and validates the CSV export request', () => {
    const filters = IssueReportFiltersSchema.parse({
      issuedFrom: '2026-07-01',
      issuedThrough: '2026-07-16',
      status: 'ISSUED',
      returnState: 'DUE_TODAY',
      receiverType: 'FACULTY',
      search: '  server room  ',
    });

    expect(filters.search).toBe('server room');
    expect(ExportIssueReportRequestSchema.parse({ format: 'CSV', filters }).format).toBe('CSV');
  });

  it('accepts a safe report response and rejects contact or financial columns', () => {
    const response = {
      data: [reportRow],
      meta: {
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
        generatedAt: '2026-07-16T09:00:00.000Z',
        timezone: 'Asia/Kolkata',
      },
    };

    expect(IssueReportResponseSchema.parse(response).data[0]?.receiverName).toBe('Neha Verma');
    expect(
      IssueReportResponseSchema.safeParse({
        ...response,
        data: [
          {
            ...reportRow,
            receiverEmail: 'neha.verma@university.edu',
            amount: 500,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('requires a supported export format and at least one material per row', () => {
    expect(
      ExportIssueReportRequestSchema.safeParse({
        format: 'XLSX',
        filters: { issuedFrom: '2026-07-01', issuedThrough: '2026-07-16' },
      }).success,
    ).toBe(false);
    expect(
      IssueReportResponseSchema.safeParse({
        data: [{ ...reportRow, materials: [] }],
        meta: {
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
          generatedAt: '2026-07-16T09:00:00.000Z',
          timezone: 'Asia/Kolkata',
        },
      }).success,
    ).toBe(false);
  });
});
