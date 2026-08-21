import { Types, type QueryFilter } from 'mongoose';

import type { AuditEvent, AuditResult, UserRole } from '@assetdesk/contracts';

import { AppError } from '../../middleware/error-handler.js';
import { AuditEventModel, type AuditEventRecord } from './audit-event.model.js';

interface AuditListInput {
  page: number;
  pageSize: number;
  from: Date;
  to: Date;
  search?: string;
  action?: string;
  result?: AuditResult;
  actorRole?: UserRole;
  actorWorkerId?: string;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toAuditEvent(event: AuditEventRecord & { _id: { toString(): string } }): AuditEvent {
  return {
    id: event._id.toString(),
    timestampUtc: event.timestampUtc.toISOString(),
    requestId: event.requestId,
    actorWorkerId: event.actorWorkerId ?? null,
    actorRole: event.actorRole ?? null,
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId ?? null,
    result: event.result,
    reasonCode: event.reasonCode ?? null,
    metadata: event.metadata ?? null,
  };
}

export async function listAuditEvents(input: AuditListInput) {
  const filter: QueryFilter<AuditEventRecord> = {
    timestampUtc: { $gte: input.from, $lt: input.to },
  };
  if (input.action) filter.action = input.action;
  if (input.result) filter.result = input.result;
  if (input.actorRole) filter.actorRole = input.actorRole;
  if (input.actorWorkerId) filter.actorWorkerId = input.actorWorkerId;
  if (input.search) {
    const value = new RegExp(escapeRegex(input.search), 'i');
    filter.$or = [
      { requestId: value },
      { actorWorkerId: value },
      { action: value },
      { targetType: value },
      { targetId: value },
      { reasonCode: value },
    ];
  }
  const skip = (input.page - 1) * input.pageSize;
  const [records, total] = await Promise.all([
    AuditEventModel.find(filter)
      .sort({ timestampUtc: -1, _id: -1 })
      .skip(skip)
      .limit(input.pageSize),
    AuditEventModel.countDocuments(filter),
  ]);
  return {
    events: records.map(toAuditEvent),
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize),
  };
}

export async function getAuditEvent(id: string): Promise<AuditEvent> {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError(404, 'AUDIT_EVENT_NOT_FOUND', 'This audit event was not found.');
  }
  const event = await AuditEventModel.findById(id);
  if (!event) throw new AppError(404, 'AUDIT_EVENT_NOT_FOUND', 'This audit event was not found.');
  return toAuditEvent(event);
}
