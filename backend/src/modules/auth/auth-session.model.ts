import { model, Schema, type Types } from 'mongoose';

const UUID_V4_PATTERN = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const SHA_256_PATTERN = /^[a-f\d]{64}$/;

export interface AuthSessionRecord {
  _id: Types.ObjectId;
  sid: string;
  familyId: string;
  userId: Types.ObjectId;
  refreshTokenHash: string;
  previousRefreshTokenHashes: string[];
  csrfTokenHash: string;
  userAgentSummary?: string;
  ipHash?: string;
  lastUsedAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  revokedAt?: Date;
  revokedReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AuthSessionSchema = new Schema<AuthSessionRecord>(
  {
    sid: { type: String, required: true, unique: true, match: UUID_V4_PATTERN },
    familyId: { type: String, required: true, index: true, match: UUID_V4_PATTERN },
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
    refreshTokenHash: { type: String, required: true, match: SHA_256_PATTERN },
    previousRefreshTokenHashes: {
      type: [String],
      required: true,
      default: [],
      validate: {
        validator: (hashes: string[]) =>
          hashes.length <= 128 && hashes.every((hash) => SHA_256_PATTERN.test(hash)),
        message: 'Invalid refresh-token history',
      },
    },
    csrfTokenHash: { type: String, required: true, match: SHA_256_PATTERN },
    userAgentSummary: { type: String, maxlength: 240 },
    ipHash: { type: String, maxlength: 64 },
    lastUsedAt: { type: Date, required: true },
    idleExpiresAt: { type: Date, required: true, index: true },
    absoluteExpiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    revokedReason: { type: String, maxlength: 120 },
  },
  { timestamps: true, versionKey: false },
);

AuthSessionSchema.index({ absoluteExpiresAt: 1 }, { expireAfterSeconds: 0 });
AuthSessionSchema.index({ userId: 1, revokedAt: 1 });

export const AuthSessionModel = model<AuthSessionRecord>('AuthSession', AuthSessionSchema);
