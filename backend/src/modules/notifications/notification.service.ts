import { randomUUID } from 'node:crypto';

import { Types, type ClientSession } from 'mongoose';

import type { NotificationDelivery, NotificationRecipientRole } from '@assetdesk/contracts';

import { env } from '../../config/env.js';
import { AppError } from '../../middleware/error-handler.js';
import type { IssueDocument, ReturnEventRecord } from '../issues/issue.model.js';
import { UserModel, type UserDocument } from '../users/user.model.js';
import {
  EmailJobModel,
  type EmailJobDocument,
  type EmailJobRecord,
  type EmailTemplateKey,
} from './email-job.model.js';

interface Recipient {
  role: NotificationRecipientRole;
  id: string;
  name: string;
  email?: string;
  templateKey: EmailTemplateKey;
}

function formatIst(value: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(value);
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function emailableRecipients(recipients: Recipient[]): Array<Recipient & { email: string }> {
  return recipients.filter((recipient): recipient is Recipient & { email: string } =>
    Boolean(recipient.email?.trim()),
  );
}

function materialIssueLines(issue: IssueDocument): string[] {
  return (issue.lines ?? []).map((line) => {
    const assets = line.assets ?? [];
    const units = assets.length
      ? assets
          .map(
            (asset) =>
              `Serial ${asset.serialNumber ?? 'not recorded'} (Asset tag ${asset.assetTag})`,
          )
          .join(', ')
      : `${line.issuedQuantity} ${line.material.unitLabel ?? 'units'}`;
    const type = line.material.trackingMode === 'SERIALIZED' ? 'IT Asset' : 'IT Consumable';
    const code =
      line.material.trackingMode === 'SERIALIZED' ? ` (${line.material.materialCode})` : '';
    return `${type}: ${line.material.name}${code} — ${units}`;
  });
}

function returnLines(event: ReturnEventRecord): string[] {
  return (event.items ?? []).map((item) =>
    item.trackingMode === 'QUANTITY'
      ? `IT Consumable: ${item.materialName} — ${item.quantity} returned — ${item.disposition}; ${item.condition}`
      : `IT Asset: ${item.materialName} (${item.materialCode}) — Serial ${item.serialNumber ?? 'not recorded'} (Asset tag ${item.assetTag}) — ${item.disposition}; ${item.condition}`,
  );
}

function outstandingLines(issue: IssueDocument): string[] {
  return (issue.lines ?? [])
    .filter((line) => line.outstandingQuantity > 0)
    .map((line) => {
      if (line.material.trackingMode === 'SERIALIZED') {
        const assets = (line.assets ?? [])
          .filter((asset) => asset.outstanding)
          .map(
            (asset) =>
              `Serial ${asset.serialNumber ?? 'not recorded'} (Asset tag ${asset.assetTag})`,
          )
          .join(', ');
        return `IT Asset: ${line.material.name} (${line.material.materialCode}) — ${assets}`;
      }
      return `IT Consumable: ${line.material.name} — ${line.outstandingQuantity} ${line.material.unitLabel ?? 'units'} outstanding`;
    });
}

async function activeUser(userId: Types.ObjectId, session?: ClientSession): Promise<UserDocument> {
  const query = UserModel.findOne({ _id: userId, status: 'ACTIVE' });
  const user = session ? await query.session(session) : await query;
  if (!user) throw new AppError(401, 'SESSION_REVOKED', 'Your account is no longer authorized.');
  return user;
}

async function mainAdmin(session?: ClientSession): Promise<UserDocument | null> {
  const query = UserModel.findOne({ role: 'ADMIN', status: 'ACTIVE' }).sort({
    createdAt: 1,
    _id: 1,
  });
  return session ? query.session(session) : query;
}

function deduplicateRecipients(recipients: Recipient[]): Recipient[] {
  const emails = new Set<string>();
  return recipients.filter((recipient) => {
    if (!recipient.email?.trim()) return true;
    const normalized = normalizeEmail(recipient.email);
    if (emails.has(normalized)) return false;
    emails.add(normalized);
    return true;
  });
}

async function insertJobs(
  jobs: Array<Omit<EmailJobRecord, '_id' | 'createdAt' | 'updatedAt'>>,
  session?: ClientSession,
): Promise<void> {
  if (!jobs.length) return;
  if (session) await EmailJobModel.insertMany(jobs, { session });
  else await EmailJobModel.insertMany(jobs);
}

export async function enqueueIssueNotifications(
  issue: IssueDocument,
  session?: ClientSession,
): Promise<void> {
  const actor = await activeUser(issue.issuedBy.userId, session);
  const recipients: Recipient[] = [
    ...(issue.receiver.email
      ? [
          {
            role: 'RECEIVER' as const,
            id: issue.receiver.receiverId.toString(),
            name: issue.receiver.fullName,
            email: issue.receiver.email,
            templateKey: 'MATERIAL_ISSUED_RECEIVER' as const,
          },
        ]
      : []),
    {
      role: 'ACTOR',
      id: actor._id.toString(),
      name: actor.name,
      email: actor.email,
      templateKey: 'MATERIAL_ISSUED_OPERATOR',
    },
  ];
  if (actor.role === 'WORKER') {
    const admin = await mainAdmin(session);
    if (admin) {
      recipients.push({
        role: 'MAIN_ADMIN',
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        templateKey: 'MATERIAL_ISSUED_OPERATOR',
      });
    }
  }
  const params = {
    issueId: issue.issueId,
    receiverName: issue.receiver.fullName,
    receiverEmail: issue.receiver.email,
    receiverContact: issue.receiver.contact,
    issuedBy: `${issue.issuedBy.name} (${issue.issuedBy.workerId})`,
    issuedAt: formatIst(issue.issuedAt),
    expectedReturnAt: issue.expectedReturnAt
      ? formatIst(issue.expectedReturnAt)
      : 'No return expected',
    materials: materialIssueLines(issue),
    viewUrl: `${env.APP_ORIGIN}/issues/${encodeURIComponent(issue.issueId)}`,
    billUrl: `${env.APP_ORIGIN}/bills/${encodeURIComponent(issue.issueId)}`,
  };
  const now = new Date();
  await insertJobs(
    emailableRecipients(deduplicateRecipients(recipients)).map((recipient) => ({
      eventKey: `issue:${issue.issueId}:issued:${recipient.role}:${recipient.id}`,
      issueId: issue.issueId,
      eventType: 'MATERIAL_ISSUED',
      recipientRole: recipient.role,
      recipientId: recipient.id,
      recipientEmailNormalized: normalizeEmail(recipient.email),
      recipientName: recipient.name,
      templateKey: recipient.templateKey,
      templateVersion: 1,
      templateParams: params,
      status: 'QUEUED',
      attemptCount: 0,
      nextAttemptAt: now,
      idempotencyKey: `issue:${issue.issueId}:issued:${recipient.id}`,
    })),
    session,
  );
}

export async function enqueueReturnNotifications(
  issue: IssueDocument,
  event: ReturnEventRecord,
  session: ClientSession,
): Promise<void> {
  const actor = await activeUser(event.performedBy.userId, session);
  const recipients: Recipient[] = [
    ...(issue.receiver.email
      ? [
          {
            role: 'RECEIVER' as const,
            id: issue.receiver.receiverId.toString(),
            name: issue.receiver.fullName,
            email: issue.receiver.email,
            templateKey: 'MATERIAL_RETURNED_RECEIVER' as const,
          },
        ]
      : []),
    {
      role: 'ACTOR',
      id: actor._id.toString(),
      name: actor.name,
      email: actor.email,
      templateKey: 'MATERIAL_RETURNED_OPERATOR',
    },
  ];
  if (actor.role === 'WORKER') {
    const admin = await mainAdmin(session);
    if (admin) {
      recipients.push({
        role: 'MAIN_ADMIN',
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        templateKey: 'MATERIAL_RETURNED_OPERATOR',
      });
    }
  }
  const params = {
    issueId: issue.issueId,
    receiverName: issue.receiver.fullName,
    returnedBy: `${event.performedBy.name} (${event.performedBy.workerId})`,
    returnedAt: formatIst(event.returnedAt),
    remainingOutstanding: String(event.remainingOutstandingQuantity),
    materials: returnLines(event),
    viewUrl: `${env.APP_ORIGIN}/issues/${encodeURIComponent(issue.issueId)}`,
    billUrl: `${env.APP_ORIGIN}/bills/${encodeURIComponent(
      issue.issueId,
    )}?type=return&returnEventId=${encodeURIComponent(event.returnEventId)}`,
  };
  const now = new Date();
  await insertJobs(
    emailableRecipients(deduplicateRecipients(recipients)).map((recipient) => ({
      eventKey: `return:${issue.issueId}:${event.returnEventId}:${recipient.role}:${recipient.id}`,
      issueId: issue.issueId,
      returnEventId: event.returnEventId,
      eventType: 'MATERIAL_RETURNED',
      recipientRole: recipient.role,
      recipientId: recipient.id,
      recipientEmailNormalized: normalizeEmail(recipient.email),
      recipientName: recipient.name,
      templateKey: recipient.templateKey,
      templateVersion: 1,
      templateParams: params,
      status: 'QUEUED',
      attemptCount: 0,
      nextAttemptAt: now,
      idempotencyKey: `return:${event.returnEventId}:${recipient.id}`,
    })),
    session,
  );
}

export async function enqueueReminderNotifications(input: {
  issue: IssueDocument;
  reminderId: string;
  overdueMinutes: number;
  session: ClientSession;
}): Promise<number> {
  const recipients: Recipient[] = [
    ...(input.issue.receiver.email
      ? [
          {
            role: 'RECEIVER' as const,
            id: input.issue.receiver.receiverId.toString(),
            name: input.issue.receiver.fullName,
            email: input.issue.receiver.email,
            templateKey: 'RETURN_REMINDER_RECEIVER' as const,
          },
        ]
      : []),
  ];
  const params = {
    issueId: input.issue.issueId,
    receiverName: input.issue.receiver.fullName,
    expectedReturnAt: formatIst(input.issue.expectedReturnAt ?? new Date()),
    overdueDuration:
      input.overdueMinutes < 1_440
        ? `${Math.max(1, Math.ceil(input.overdueMinutes / 60))} hours`
        : `${Math.floor(input.overdueMinutes / 1_440)} days`,
    materials: outstandingLines(input.issue),
    viewUrl: `${env.APP_ORIGIN}/issues/${encodeURIComponent(input.issue.issueId)}`,
  };
  const jobs = emailableRecipients(deduplicateRecipients(recipients)).map((recipient) => ({
    eventKey: `reminder:${input.issue.issueId}:${input.reminderId}:${recipient.role}:${recipient.id}`,
    issueId: input.issue.issueId,
    eventType: 'RETURN_REMINDER' as const,
    recipientRole: recipient.role,
    recipientId: recipient.id,
    recipientEmailNormalized: normalizeEmail(recipient.email),
    recipientName: recipient.name,
    templateKey: recipient.templateKey,
    templateVersion: 1,
    templateParams: params,
    status: 'QUEUED' as const,
    attemptCount: 0,
    nextAttemptAt: new Date(),
    idempotencyKey: `reminder:${input.reminderId}:${recipient.id}`,
  }));
  await insertJobs(jobs, input.session);
  return jobs.length;
}

export async function enqueueWorkerInvitation(input: {
  userId: Types.ObjectId;
  workerId: string;
  name: string;
  email: string;
  temporaryPassword: string;
  expiresAt: Date;
  credentialVersion: number;
  session: ClientSession;
}): Promise<void> {
  const recipientEmailNormalized = normalizeEmail(input.email);
  await insertJobs(
    [
      {
        eventKey: `worker:${input.workerId}:invitation:${input.credentialVersion}`,
        eventType: 'WORKER_INVITATION',
        recipientRole: 'ACCOUNT_OWNER',
        recipientId: input.userId.toString(),
        recipientEmailNormalized,
        recipientName: input.name,
        templateKey: 'WORKER_INVITATION',
        templateVersion: 1,
        templateParams: {
          name: input.name,
          workerId: input.workerId,
          temporaryPassword: input.temporaryPassword,
          expiresAt: formatIst(input.expiresAt),
          loginUrl: `${env.APP_ORIGIN}/login`,
        },
        status: 'QUEUED',
        attemptCount: 0,
        nextAttemptAt: new Date(),
        idempotencyKey: `worker:${input.workerId}:invitation:${input.credentialVersion}`,
      },
    ],
    input.session,
  );
}

export async function enqueuePasswordChanged(input: {
  userId: Types.ObjectId;
  workerId: string;
  name: string;
  email: string;
  changedAt: Date;
  authVersion: number;
  session: ClientSession;
}): Promise<void> {
  await insertJobs(
    [
      {
        eventKey: `user:${input.userId.toString()}:password-changed:${input.authVersion}`,
        eventType: 'PASSWORD_CHANGED',
        recipientRole: 'ACCOUNT_OWNER',
        recipientId: input.userId.toString(),
        recipientEmailNormalized: normalizeEmail(input.email),
        recipientName: input.name,
        templateKey: 'PASSWORD_CHANGED',
        templateVersion: 1,
        templateParams: {
          name: input.name,
          workerId: input.workerId,
          changedAt: formatIst(input.changedAt),
        },
        status: 'QUEUED',
        attemptCount: 0,
        nextAttemptAt: new Date(),
        idempotencyKey: `user:${input.userId.toString()}:password-changed:${input.authVersion}`,
      },
    ],
    input.session,
  );
}

export function toNotificationDelivery(job: EmailJobDocument): NotificationDelivery {
  return {
    notificationId: job._id.toString(),
    eventType: job.eventType,
    recipientRole: job.recipientRole,
    status: job.status,
    attemptCount: job.attemptCount,
    acceptedAt: job.acceptedAt?.toISOString() ?? null,
    deliveredAt: job.deliveredAt?.toISOString() ?? null,
    failedAt: job.failedAt?.toISOString() ?? null,
    lastErrorSummary: job.lastErrorSummary ?? null,
    createdAt: job.createdAt.toISOString(),
  };
}

export async function listIssueNotifications(issueId: string): Promise<NotificationDelivery[]> {
  const jobs = await EmailJobModel.find({ issueId }).sort({ createdAt: -1, _id: -1 });
  return jobs.map(toNotificationDelivery);
}

export async function retryNotification(notificationId: string): Promise<NotificationDelivery> {
  if (!Types.ObjectId.isValid(notificationId)) {
    throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'This notification was not found.');
  }
  const original = await EmailJobModel.findById(notificationId);
  if (!original)
    throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'This notification was not found.');
  if (!['FAILED', 'BOUNCED', 'BLOCKED', 'INVALID'].includes(original.status)) {
    throw new AppError(
      409,
      'NOTIFICATION_NOT_RETRYABLE',
      'Only a permanently failed notification can be resent.',
    );
  }
  const suffix = randomUUID();
  const replacement = await EmailJobModel.create({
    eventKey: `${original.eventKey}:manual:${suffix}`,
    ...(original.issueId ? { issueId: original.issueId } : {}),
    ...(original.returnEventId ? { returnEventId: original.returnEventId } : {}),
    eventType: original.eventType,
    recipientRole: original.recipientRole,
    recipientId: original.recipientId,
    recipientEmailNormalized: original.recipientEmailNormalized,
    recipientName: original.recipientName,
    templateKey: original.templateKey,
    templateVersion: original.templateVersion,
    templateParams: original.templateParams,
    status: 'QUEUED',
    attemptCount: 0,
    nextAttemptAt: new Date(),
    idempotencyKey: `${original.idempotencyKey}:manual:${suffix}`,
    supersedesJobId: original._id,
  });
  return toNotificationDelivery(replacement);
}
