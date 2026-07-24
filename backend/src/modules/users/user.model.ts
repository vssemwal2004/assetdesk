import { model, Schema, type HydratedDocument, type Types } from 'mongoose';

import {
  WorkerIdSchema,
  type AccountStatus,
  type UserRole,
  type WorkerPermission,
} from '@assetdesk/contracts';

export type InvitationStatus = 'PENDING' | 'SENT' | 'FAILED';

export interface UserRecord {
  _id: Types.ObjectId;
  workerId: string;
  name: string;
  email: string;
  emailNormalized: string;
  contact?: string;
  department?: string;
  role: UserRole;
  permissions: WorkerPermission[];
  status: AccountStatus;
  invitationStatus: InvitationStatus;
  passwordHash: string;
  mustChangePassword: boolean;
  temporaryPasswordExpiresAt?: Date;
  authVersion: number;
  failedLoginCount: number;
  lockedUntil?: Date;
  passwordChangedAt?: Date;
  lastLoginAt?: Date;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<UserRecord>;

const UserSchema = new Schema<UserRecord>(
  {
    workerId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      validate: {
        validator: (value: string) => WorkerIdSchema.safeParse(value).success,
        message: 'Invalid Worker ID',
      },
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, maxlength: 254 },
    emailNormalized: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    contact: { type: String, trim: true, maxlength: 120 },
    department: { type: String, trim: true, maxlength: 120 },
    role: { type: String, enum: ['ADMIN', 'WORKER'], required: true },
    permissions: {
      type: [String],
      enum: [
        'DASHBOARD',
        'ISSUES_VIEW',
        'ASSIGNMENTS_CREATE',
        'ISSUES_EDIT',
        'ISSUES_DELETE',
        'ISSUE_SLIPS_VIEW',
        'RETURN_DATES_EXTEND',
        'RETURNS_RECORD',
        'RETURNS_VIEW',
        'INVENTORY_VIEW',
        'INVENTORY_MANAGE',
        'ASSET_TYPES_MANAGE',
        'INVENTORY_IMPORT',
        'INVENTORY_EXPORT',
        'ASSET_UNITS_MANAGE',
        'RECEIVERS_VIEW',
        'RECEIVERS_MANAGE',
        'REPORTS_VIEW',
      ],
      default: [],
    },
    status: { type: String, enum: ['INVITED', 'ACTIVE', 'DISABLED'], required: true },
    invitationStatus: {
      type: String,
      enum: ['PENDING', 'SENT', 'FAILED'],
      required: true,
      default: 'PENDING',
    },
    passwordHash: { type: String, required: true, select: false, maxlength: 256 },
    mustChangePassword: { type: Boolean, required: true, default: true },
    temporaryPasswordExpiresAt: { type: Date },
    authVersion: { type: Number, required: true, default: 1, min: 1, validate: Number.isInteger },
    failedLoginCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 5,
      validate: Number.isInteger,
    },
    lockedUntil: { type: Date },
    passwordChangedAt: { type: Date },
    lastLoginAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

UserSchema.index({ role: 1, status: 1 });
UserSchema.index({ name: 1 });

export const UserModel = model<UserRecord>('User', UserSchema);
