import { model, Schema, type HydratedDocument, type Types } from 'mongoose';

import type {
  EmailJobStatus,
  NotificationEventType,
  NotificationRecipientRole,
} from '@assetdesk/contracts';

export type EmailTemplateKey =
  | 'WORKER_INVITATION'
  | 'MATERIAL_ISSUED_RECEIVER'
  | 'MATERIAL_ISSUED_OPERATOR'
  | 'MATERIAL_RETURNED_RECEIVER'
  | 'MATERIAL_RETURNED_OPERATOR'
  | 'RETURN_REMINDER_RECEIVER'
  | 'RETURN_REMINDER_OPERATOR'
  | 'PASSWORD_RESET_OTP'
  | 'PASSWORD_CHANGED';

export interface EmailJobRecord {
  _id: Types.ObjectId;
  eventKey: string;
  issueId?: string;
  returnEventId?: string;
  eventType: NotificationEventType;
  recipientRole: NotificationRecipientRole;
  recipientId: string;
  recipientEmailNormalized: string;
  recipientName: string;
  templateKey: EmailTemplateKey;
  templateVersion: number;
  templateParams: Record<string, unknown>;
  status: EmailJobStatus;
  attemptCount: number;
  nextAttemptAt: Date;
  leaseUntil?: Date;
  providerMessageId?: string;
  idempotencyKey: string;
  lastErrorCode?: string;
  lastErrorSummary?: string;
  acceptedAt?: Date;
  deliveredAt?: Date;
  failedAt?: Date;
  supersedesJobId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type EmailJobDocument = HydratedDocument<EmailJobRecord>;

const EmailJobSchema = new Schema<EmailJobRecord>(
  {
    eventKey: { type: String, required: true, immutable: true, maxlength: 512 },
    issueId: { type: String, immutable: true, maxlength: 32 },
    returnEventId: { type: String, immutable: true, maxlength: 64 },
    eventType: {
      type: String,
      enum: [
        'WORKER_INVITATION',
        'MATERIAL_ISSUED',
        'MATERIAL_RETURNED',
        'RETURN_REMINDER',
        'PASSWORD_RESET_OTP',
        'PASSWORD_CHANGED',
      ],
      required: true,
      immutable: true,
    },
    recipientRole: {
      type: String,
      enum: ['RECEIVER', 'ACTOR', 'MAIN_ADMIN', 'ACCOUNT_OWNER'],
      required: true,
      immutable: true,
    },
    recipientId: { type: String, required: true, immutable: true, maxlength: 128 },
    recipientEmailNormalized: {
      type: String,
      required: true,
      immutable: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    recipientName: { type: String, required: true, immutable: true, maxlength: 120 },
    templateKey: {
      type: String,
      enum: [
        'WORKER_INVITATION',
        'MATERIAL_ISSUED_RECEIVER',
        'MATERIAL_ISSUED_OPERATOR',
        'MATERIAL_RETURNED_RECEIVER',
        'MATERIAL_RETURNED_OPERATOR',
        'RETURN_REMINDER_RECEIVER',
        'RETURN_REMINDER_OPERATOR',
        'PASSWORD_RESET_OTP',
        'PASSWORD_CHANGED',
      ],
      required: true,
      immutable: true,
    },
    templateVersion: { type: Number, required: true, immutable: true, min: 1 },
    templateParams: { type: Schema.Types.Mixed, required: true, immutable: true },
    status: {
      type: String,
      enum: [
        'QUEUED',
        'PROCESSING',
        'RETRY_WAIT',
        'ACCEPTED_BY_PROVIDER',
        'DELIVERED',
        'DEFERRED',
        'BOUNCED',
        'BLOCKED',
        'INVALID',
        'FAILED',
      ],
      required: true,
      default: 'QUEUED',
    },
    attemptCount: { type: Number, required: true, default: 0, min: 0 },
    nextAttemptAt: { type: Date, required: true, default: Date.now },
    leaseUntil: { type: Date },
    providerMessageId: { type: String, maxlength: 512 },
    idempotencyKey: { type: String, required: true, immutable: true, maxlength: 512 },
    lastErrorCode: { type: String, maxlength: 120 },
    lastErrorSummary: { type: String, maxlength: 500 },
    acceptedAt: { type: Date },
    deliveredAt: { type: Date },
    failedAt: { type: Date },
    supersedesJobId: { type: Schema.Types.ObjectId, ref: 'EmailJob', immutable: true },
  },
  { timestamps: true, versionKey: false },
);

EmailJobSchema.index({ eventKey: 1 }, { unique: true, name: 'email_event_key_unique' });
EmailJobSchema.index({ providerMessageId: 1 }, { sparse: true, name: 'email_provider_message' });
EmailJobSchema.index({ status: 1, nextAttemptAt: 1, leaseUntil: 1, createdAt: 1 });
EmailJobSchema.index({ issueId: 1, createdAt: -1 });
EmailJobSchema.index({ returnEventId: 1, createdAt: -1 });

export const EmailJobModel = model<EmailJobRecord>('EmailJob', EmailJobSchema);
