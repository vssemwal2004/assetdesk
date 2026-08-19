import { model, Schema, type Types } from 'mongoose';

export interface AuditEventRecord {
  _id: Types.ObjectId;
  timestampUtc: Date;
  requestId: string;
  actorUserId?: Types.ObjectId;
  actorWorkerId?: string;
  actorRole?: 'ADMIN' | 'WORKER';
  action: string;
  targetType: string;
  targetId?: string;
  result: 'SUCCESS' | 'DENIED' | 'FAILED';
  reasonCode?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const AuditEventSchema = new Schema<AuditEventRecord>(
  {
    timestampUtc: { type: Date, required: true, default: Date.now },
    requestId: { type: String, required: true, maxlength: 128 },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    actorWorkerId: { type: String, maxlength: 32 },
    actorRole: { type: String, enum: ['ADMIN', 'WORKER'] },
    action: { type: String, required: true, maxlength: 120 },
    targetType: { type: String, required: true, maxlength: 80 },
    targetId: { type: String, maxlength: 120 },
    result: { type: String, enum: ['SUCCESS', 'DENIED', 'FAILED'], required: true },
    reasonCode: { type: String, maxlength: 120 },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

AuditEventSchema.index({ targetType: 1, targetId: 1, timestampUtc: -1 });
AuditEventSchema.index({ actorUserId: 1, timestampUtc: -1 });
AuditEventSchema.index({ timestampUtc: -1, _id: -1 });
// Keep activity/audit history for 14 days. MongoDB removes expired records
// automatically in the background; this also applies to records already stored.
AuditEventSchema.index({ timestampUtc: 1 }, { expireAfterSeconds: 14 * 24 * 60 * 60 });
AuditEventSchema.index({ action: 1, timestampUtc: -1 });
AuditEventSchema.index({ result: 1, timestampUtc: -1 });
AuditEventSchema.index({ actorWorkerId: 1, timestampUtc: -1 });

export const AuditEventModel = model<AuditEventRecord>('AuditEvent', AuditEventSchema);
