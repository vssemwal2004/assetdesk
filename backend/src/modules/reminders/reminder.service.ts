import { randomUUID } from 'node:crypto';

import mongoose, { Types, type QueryFilter } from 'mongoose';

import type { OverdueIssue, Reminder, UserRole } from '@assetdesk/contracts';

import { AppError } from '../../middleware/error-handler.js';
import { appendAuditEvent } from '../audit/audit.service.js';
import { idempotencyConflict } from '../issues/idempotency.js';
import { toIssueSummary } from '../issues/issue.mapper.js';
import { IssueModel } from '../issues/issue.model.js';
import { buildIssueSearchFilter } from '../issues/issue.service.js';
import { enqueueReminderNotifications } from '../notifications/notification.service.js';
import { UserModel } from '../users/user.model.js';
import { ReminderModel, type ReminderDocument } from './reminder.model.js';

export interface ReminderActorContext {
  userId: string;
  workerId: string;
  role: UserRole;
  requestId: string;
}

interface OverdueListInput {
  page: number;
  pageSize: number;
  search?: string;
}

function objectId(value: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) throw new TypeError('Invalid authenticated user ID.');
  return new Types.ObjectId(value);
}

function toReminder(reminder: ReminderDocument): Reminder {
  return {
    reminderId: reminder.reminderId,
    issueId: reminder.issueId,
    sentAt: reminder.sentAt.toISOString(),
    sentBy: {
      userId: reminder.sentBy.userId.toString(),
      workerId: reminder.sentBy.workerId,
      name: reminder.sentBy.name,
      role: reminder.sentBy.role,
    },
    expectedReturnAt: reminder.expectedReturnAt.toISOString(),
    overdueMinutes: reminder.overdueMinutes,
    notificationCount: reminder.notificationCount,
  };
}

export async function listOverdueIssues(input: OverdueListInput, now = new Date()) {
  const filter: QueryFilter<unknown> = {
    status: { $in: ['ISSUED', 'PARTIALLY_RETURNED'] },
    totalOutstandingQuantity: { $gt: 0 },
    expectedReturnAt: { $lt: now },
  };
  if (input.search) filter.$and = [buildIssueSearchFilter(input.search)];
  const skip = (input.page - 1) * input.pageSize;
  const [records, total] = await Promise.all([
    IssueModel.find(filter)
      .select(
        'issueId receiver issuedBy issuedAt expectedReturnAt duePreset status purpose notes totalIssuedQuantity totalOutstandingQuantity hasDamagedOutcome hasLostOutcome createdAt updatedAt lines.material.name',
      )
      .sort({ expectedReturnAt: 1, _id: 1 })
      .skip(skip)
      .limit(input.pageSize),
    IssueModel.countDocuments(filter),
  ]);
  const issueIds = records.map((record) => record.issueId);
  const reminderStats = issueIds.length
    ? await ReminderModel.aggregate<{
        _id: string;
        reminderCount: number;
        lastReminderAt: Date;
      }>([
        { $match: { issueId: { $in: issueIds } } },
        {
          $group: {
            _id: '$issueId',
            reminderCount: { $sum: 1 },
            lastReminderAt: { $max: '$sentAt' },
          },
        },
      ])
    : [];
  const byIssue = new Map(reminderStats.map((entry) => [entry._id, entry]));
  const issues: OverdueIssue[] = records.map((record) => {
    if (!record.expectedReturnAt) throw new Error('Overdue Issue is missing its due time.');
    const stats = byIssue.get(record.issueId);
    return {
      ...toIssueSummary(record),
      expectedReturnAt: record.expectedReturnAt.toISOString(),
      overdueMinutes: Math.max(
        0,
        Math.floor((now.getTime() - record.expectedReturnAt.getTime()) / 60_000),
      ),
      reminderCount: stats?.reminderCount ?? 0,
      lastReminderAt: stats?.lastReminderAt.toISOString() ?? null,
    };
  });
  return {
    issues,
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize),
  };
}

async function replay(
  actorUserId: Types.ObjectId,
  idempotencyKeyHash: string,
  requestFingerprint: string,
): Promise<Reminder | null> {
  const existing = await ReminderModel.findOne({
    'sentBy.userId': actorUserId,
    idempotencyKeyHash,
  }).select('+requestFingerprint');
  if (!existing) return null;
  if (existing.requestFingerprint !== requestFingerprint) throw idempotencyConflict();
  return toReminder(existing);
}

export async function createReminder(
  issueId: string,
  actor: ReminderActorContext,
  idempotencyKeyHash: string,
  requestFingerprint: string,
): Promise<{ reminder: Reminder; idempotentReplay: boolean }> {
  const actorUserId = objectId(actor.userId);
  const existing = await replay(actorUserId, idempotencyKeyHash, requestFingerprint);
  if (existing) return { reminder: existing, idempotentReplay: true };

  const session = await mongoose.startSession();
  let result: Reminder | undefined;
  try {
    await session.withTransaction(async () => {
      const transactionReplay = await ReminderModel.findOne({
        'sentBy.userId': actorUserId,
        idempotencyKeyHash,
      })
        .select('+requestFingerprint')
        .session(session);
      if (transactionReplay) {
        if (transactionReplay.requestFingerprint !== requestFingerprint)
          throw idempotencyConflict();
        result = toReminder(transactionReplay);
        return;
      }
      const user = await UserModel.findOne({ _id: actorUserId, status: 'ACTIVE' }).session(session);
      if (!user) throw new AppError(401, 'SESSION_REVOKED', 'Your account is no longer active.');
      const now = new Date();
      const cooldownCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
      const issue = await IssueModel.findOneAndUpdate(
        {
          issueId,
          expectedReturnAt: { $lt: now },
          totalOutstandingQuantity: { $gt: 0 },
          status: { $in: ['ISSUED', 'PARTIALLY_RETURNED'] },
          $or: [
            { lastReminderAt: { $exists: false } },
            { lastReminderAt: { $lte: cooldownCutoff } },
          ],
        },
        { $inc: { reminderCount: 1 }, $set: { lastReminderAt: now } },
        { returnDocument: 'after', session },
      );
      if (!issue) {
        const current = await IssueModel.findOne({ issueId }).session(session);
        if (!current)
          throw new AppError(404, 'ISSUE_NOT_FOUND', 'This Issue Record was not found.');
        if (
          current.expectedReturnAt &&
          current.expectedReturnAt < now &&
          current.totalOutstandingQuantity > 0 &&
          ['ISSUED', 'PARTIALLY_RETURNED'].includes(current.status) &&
          current.lastReminderAt
        ) {
          throw new AppError(
            409,
            'REMINDER_COOLDOWN_ACTIVE',
            'A reminder was already queued in the last 24 hours.',
          );
        }
        throw new AppError(
          409,
          'ISSUE_NOT_OVERDUE',
          'A reminder can be sent only for an overdue Issue with material still outstanding.',
        );
      }
      const expectedReturnAt = issue.expectedReturnAt;
      if (!expectedReturnAt) throw new Error('Claimed overdue Issue is missing its due time.');
      const reminderId = randomUUID();
      const overdueMinutes = Math.max(
        0,
        Math.floor((now.getTime() - expectedReturnAt.getTime()) / 60_000),
      );
      const notificationCount = await enqueueReminderNotifications({
        issue,
        reminderId,
        overdueMinutes,
        session,
      });
      const created = await ReminderModel.create(
        [
          {
            reminderId,
            issueId,
            sentAt: now,
            sentBy: {
              userId: actorUserId,
              workerId: user.workerId,
              name: user.name,
              role: user.role,
            },
            expectedReturnAt,
            overdueMinutes,
            notificationCount,
            idempotencyKeyHash,
            requestFingerprint,
          },
        ],
        { session },
      );
      const reminder = created[0];
      if (!reminder) throw new Error('Reminder insert returned no document.');
      await appendAuditEvent(
        {
          requestId: actor.requestId,
          actorUserId: actor.userId,
          actorWorkerId: actor.workerId,
          actorRole: actor.role,
          action: 'RETURN_REMINDER_SENT',
          targetType: 'ISSUE',
          targetId: issueId,
          result: 'SUCCESS',
          metadata: { reminderId, overdueMinutes, notificationCount },
        },
        { session },
      );
      result = toReminder(reminder);
    });
  } catch (error) {
    const duplicate =
      error && typeof error === 'object' && (error as { code?: unknown }).code === 11_000;
    if (!duplicate) throw error;
    const duplicateReplay = await replay(actorUserId, idempotencyKeyHash, requestFingerprint);
    if (!duplicateReplay) throw error;
    return { reminder: duplicateReplay, idempotentReplay: true };
  } finally {
    await session.endSession();
  }
  if (!result)
    throw new AppError(500, 'REMINDER_CREATE_FAILED', 'The reminder could not be saved.');
  return { reminder: result, idempotentReplay: false };
}

export async function listIssueReminders(issueId: string): Promise<Reminder[]> {
  const reminders = await ReminderModel.find({ issueId }).sort({ sentAt: -1, _id: -1 });
  return reminders.map(toReminder);
}
