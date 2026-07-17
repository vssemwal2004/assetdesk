import { model, Schema, type HydratedDocument, type Types } from 'mongoose';

import type { UserRole } from '@assetdesk/contracts';

interface ReminderActorRecord {
  userId: Types.ObjectId;
  workerId: string;
  name: string;
  role: UserRole;
}

export interface ReminderRecord {
  _id: Types.ObjectId;
  reminderId: string;
  issueId: string;
  sentAt: Date;
  sentBy: ReminderActorRecord;
  expectedReturnAt: Date;
  overdueMinutes: number;
  notificationCount: number;
  idempotencyKeyHash: string;
  requestFingerprint: string;
  createdAt: Date;
}

export type ReminderDocument = HydratedDocument<ReminderRecord>;

const ReminderActorSchema = new Schema<ReminderActorRecord>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    workerId: { type: String, required: true, immutable: true, maxlength: 32 },
    name: { type: String, required: true, immutable: true, maxlength: 120 },
    role: { type: String, enum: ['ADMIN', 'WORKER'], required: true, immutable: true },
  },
  { _id: false },
);

const ReminderSchema = new Schema<ReminderRecord>(
  {
    reminderId: { type: String, required: true, immutable: true },
    issueId: { type: String, required: true, immutable: true, maxlength: 32 },
    sentAt: { type: Date, required: true, immutable: true },
    sentBy: { type: ReminderActorSchema, required: true, immutable: true },
    expectedReturnAt: { type: Date, required: true, immutable: true },
    overdueMinutes: { type: Number, required: true, min: 0, immutable: true },
    notificationCount: { type: Number, required: true, min: 1, immutable: true },
    idempotencyKeyHash: { type: String, required: true, select: false, immutable: true },
    requestFingerprint: { type: String, required: true, select: false, immutable: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

ReminderSchema.index({ reminderId: 1 }, { unique: true, name: 'reminder_id_unique' });
ReminderSchema.index({ issueId: 1, sentAt: -1 });
ReminderSchema.index(
  { 'sentBy.userId': 1, idempotencyKeyHash: 1 },
  { unique: true, name: 'reminder_actor_idempotency_unique' },
);

export const ReminderModel = model<ReminderRecord>('Reminder', ReminderSchema);
