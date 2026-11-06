import { model, Schema, type Types } from 'mongoose';

export interface AlertReadRecord {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  key: string;
  readAt: Date;
}

// Read receipts expire so a still-open condition is raised again after this many days.
const READ_RECEIPT_TTL_SECONDS = 45 * 24 * 60 * 60;

const AlertReadSchema = new Schema<AlertReadRecord>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    key: { type: String, required: true, immutable: true, maxlength: 200 },
    readAt: { type: Date, required: true },
  },
  { versionKey: false },
);

AlertReadSchema.index({ userId: 1, key: 1 }, { unique: true, name: 'alert_read_user_key_unique' });
AlertReadSchema.index(
  { readAt: 1 },
  { expireAfterSeconds: READ_RECEIPT_TTL_SECONDS, name: 'alert_read_ttl' },
);

export const AlertReadModel = model<AlertReadRecord>('AlertRead', AlertReadSchema);
