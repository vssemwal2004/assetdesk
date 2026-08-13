import { model, Schema, type HydratedDocument, type Types } from 'mongoose';

import { ReceiverCodeSchema, type ReceiverStatus, type ReceiverType } from '@assetdesk/contracts';

export interface ReceiverRecord {
  _id: Types.ObjectId;
  receiverCode: string;
  fullName: string;
  fullNameNormalized: string;
  universityId?: string;
  universityIdNormalized?: string;
  type: ReceiverType;
  department?: string;
  departmentNormalized?: string;
  contact?: string;
  contactNormalized?: string;
  email?: string;
  emailNormalized?: string;
  status: ReceiverStatus;
  operationalUseCount: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type ReceiverDocument = HydratedDocument<ReceiverRecord>;

const ReceiverSchema = new Schema<ReceiverRecord>(
  {
    receiverCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      validate: {
        validator: (value: string) => ReceiverCodeSchema.safeParse(value).success,
        message: 'Invalid Receiver code',
      },
    },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    fullNameNormalized: { type: String, required: true, trim: true, maxlength: 120 },
    universityId: { type: String, trim: true, maxlength: 64 },
    universityIdNormalized: { type: String, trim: true, maxlength: 64 },
    type: {
      type: String,
      enum: ['FACULTY', 'STAFF', 'STUDENT', 'DEPARTMENT', 'AUTHORIZED_EXTERNAL', 'MANAGEMENT', 'GEHU'],
      required: true,
    },
    department: { type: String, trim: true, maxlength: 120 },
    departmentNormalized: { type: String, trim: true, maxlength: 120 },
    contact: { type: String, trim: true, maxlength: 40 },
    contactNormalized: { type: String, trim: true, maxlength: 40 },
    email: { type: String, trim: true, maxlength: 254 },
    emailNormalized: {
      type: String,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], required: true, default: 'ACTIVE' },
    operationalUseCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: Number.isSafeInteger,
      select: false,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

ReceiverSchema.index({ receiverCode: 1 }, { unique: true, name: 'receiver_code_unique' });
ReceiverSchema.index(
  { emailNormalized: 1 },
  {
    unique: true,
    name: 'receiver_email_unique',
    partialFilterExpression: { emailNormalized: { $type: 'string' } },
  },
);
ReceiverSchema.index(
  { universityIdNormalized: 1 },
  {
    unique: true,
    name: 'receiver_university_id_unique',
    partialFilterExpression: { universityIdNormalized: { $type: 'string' } },
  },
);
ReceiverSchema.index({ status: 1, type: 1, fullNameNormalized: 1 });
ReceiverSchema.index({ departmentNormalized: 1, status: 1 });

export const ReceiverModel = model<ReceiverRecord>('Receiver', ReceiverSchema);
