import { model, Schema, type HydratedDocument, type Types } from 'mongoose';

export interface PasswordResetRecord {
  _id: Types.ObjectId;
  resetId: string;
  userId: Types.ObjectId;
  emailNormalized: string;
  otpHash: string;
  expiresAt: Date;
  verifiedAt?: Date;
  consumedAt?: Date;
  attemptCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export type PasswordResetDocument = HydratedDocument<PasswordResetRecord>;

const PasswordResetSchema = new Schema<PasswordResetRecord>(
  {
    resetId: { type: String, required: true, unique: true, immutable: true, maxlength: 128 },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    emailNormalized: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    otpHash: { type: String, required: true, select: false, maxlength: 256 },
    expiresAt: { type: Date, required: true },
    verifiedAt: { type: Date },
    consumedAt: { type: Date },
    attemptCount: { type: Number, required: true, default: 0, min: 0, max: 5 },
  },
  { timestamps: true, versionKey: false },
);

PasswordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
PasswordResetSchema.index({ userId: 1, createdAt: -1 });
PasswordResetSchema.index({ emailNormalized: 1, createdAt: -1 });

export const PasswordResetModel = model<PasswordResetRecord>('PasswordReset', PasswordResetSchema);
