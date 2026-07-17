import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const models = vi.hoisted(() => ({
  issue: {
    countDocuments: vi.fn(),
    find: vi.fn(),
  },
  reminder: {
    aggregate: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
  },
}));
const issueSupport = vi.hoisted(() => ({
  buildIssueSearchFilter: vi.fn((search: string) => ({ issueId: search })),
  toIssueSummary: vi.fn((record: { summary: unknown }) => record.summary),
}));

vi.mock('../issues/issue.model.js', () => ({ IssueModel: models.issue }));
vi.mock('./reminder.model.js', () => ({ ReminderModel: models.reminder }));
vi.mock('../issues/issue.service.js', () => ({
  buildIssueSearchFilter: issueSupport.buildIssueSearchFilter,
}));
vi.mock('../issues/issue.mapper.js', () => ({ toIssueSummary: issueSupport.toIssueSummary }));
vi.mock('../audit/audit.service.js', () => ({ appendAuditEvent: vi.fn() }));
vi.mock('../notifications/notification.service.js', () => ({
  enqueueReminderNotifications: vi.fn(),
}));
vi.mock('../users/user.model.js', () => ({ UserModel: {} }));

import type { AppError } from '../../middleware/error-handler.js';
import { createReminder, listIssueReminders, listOverdueIssues } from './reminder.service.js';

const ACTOR_ID = '507f1f77bcf86cd799439011';
const ISSUE_ID = 'GEU-ISS-2026-000001';
const REMINDER_ID = '3516ac36-3f1c-4c22-8fc3-6707ab8a7a37';

function reminderRecord(requestFingerprint = 'same-fingerprint') {
  return {
    reminderId: REMINDER_ID,
    issueId: ISSUE_ID,
    sentAt: new Date('2026-07-16T08:00:00.000Z'),
    sentBy: {
      userId: new Types.ObjectId(ACTOR_ID),
      workerId: 'GEU-WRK-ADM2',
      name: 'Server Room Admin',
      role: 'ADMIN',
    },
    expectedReturnAt: new Date('2026-07-15T08:00:00.000Z'),
    overdueMinutes: 1_440,
    notificationCount: 1,
    requestFingerprint,
  };
}

describe('Reminder service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('derives overdue duration and reminder history without changing Issue status', async () => {
    const now = new Date('2026-07-16T10:00:00.000Z');
    const dueAt = new Date('2026-07-16T08:30:00.000Z');
    const record = {
      issueId: ISSUE_ID,
      expectedReturnAt: dueAt,
      summary: {
        issueId: ISSUE_ID,
        expectedReturnAt: dueAt.toISOString(),
        status: 'ISSUED',
        reminderCount: 0,
        lastReminderAt: null,
      },
    };
    const query: Record<string, ReturnType<typeof vi.fn>> = {};
    query.select = vi.fn(() => query);
    query.sort = vi.fn(() => query);
    query.skip = vi.fn(() => query);
    query.limit = vi.fn().mockResolvedValue([record]);
    models.issue.find.mockReturnValue(query);
    models.issue.countDocuments.mockResolvedValue(3);
    models.reminder.aggregate.mockResolvedValue([
      {
        _id: ISSUE_ID,
        reminderCount: 2,
        lastReminderAt: new Date('2026-07-16T09:00:00.000Z'),
      },
    ]);

    const result = await listOverdueIssues({ page: 1, pageSize: 2, search: 'GEU-ISS' }, now);

    expect(models.issue.find).toHaveBeenCalledWith({
      status: { $in: ['ISSUED', 'PARTIALLY_RETURNED'] },
      totalOutstandingQuantity: { $gt: 0 },
      expectedReturnAt: { $lt: now },
      $and: [{ issueId: 'GEU-ISS' }],
    });
    expect(issueSupport.buildIssueSearchFilter).toHaveBeenCalledWith('GEU-ISS');
    expect(result).toMatchObject({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
    expect(result.issues[0]).toMatchObject({
      issueId: ISSUE_ID,
      status: 'ISSUED',
      overdueMinutes: 90,
      reminderCount: 2,
      lastReminderAt: '2026-07-16T09:00:00.000Z',
    });
  });

  it('returns a matching idempotent reminder without opening a new transaction', async () => {
    const select = vi.fn().mockResolvedValue(reminderRecord());
    models.reminder.findOne.mockReturnValue({ select });

    const result = await createReminder(
      ISSUE_ID,
      {
        userId: ACTOR_ID,
        workerId: 'GEU-WRK-ADM2',
        role: 'ADMIN',
        requestId: 'request-reminder-test',
      },
      'key-hash',
      'same-fingerprint',
    );

    expect(result.idempotentReplay).toBe(true);
    expect(result.reminder).toMatchObject({
      reminderId: REMINDER_ID,
      issueId: ISSUE_ID,
      overdueMinutes: 1_440,
      notificationCount: 1,
    });
    expect(result.reminder.sentBy.userId).toBe(ACTOR_ID);
  });

  it('rejects reuse of an idempotency key with different request evidence', async () => {
    models.reminder.findOne.mockReturnValue({
      select: vi.fn().mockResolvedValue(reminderRecord('original-fingerprint')),
    });

    await expect(
      createReminder(
        ISSUE_ID,
        {
          userId: ACTOR_ID,
          workerId: 'GEU-WRK-ADM2',
          role: 'ADMIN',
          requestId: 'request-reminder-test',
        },
        'key-hash',
        'different-fingerprint',
      ),
    ).rejects.toMatchObject<AppError>({ status: 409, code: 'IDEMPOTENCY_KEY_REUSED' });
  });

  it('returns reminder history newest first using the public evidence shape', async () => {
    const records = [
      reminderRecord(),
      {
        ...reminderRecord(),
        reminderId: '9ae1834d-8b4d-44cc-9273-7d7e8164bfcb',
        sentAt: new Date('2026-07-15T08:00:00.000Z'),
      },
    ];
    const sort = vi.fn().mockResolvedValue(records);
    models.reminder.find.mockReturnValue({ sort });

    const result = await listIssueReminders(ISSUE_ID);

    expect(models.reminder.find).toHaveBeenCalledWith({ issueId: ISSUE_ID });
    expect(sort).toHaveBeenCalledWith({ sentAt: -1, _id: -1 });
    expect(result.map((entry) => entry.sentAt)).toEqual([
      '2026-07-16T08:00:00.000Z',
      '2026-07-15T08:00:00.000Z',
    ]);
  });
});
