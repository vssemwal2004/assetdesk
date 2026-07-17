import { model, Schema, type Types } from 'mongoose';

export interface WorkerImportRow {
  rowNumber: number;
  name: string;
  email: string;
  emailNormalized: string;
  contact?: string;
  department?: string;
  valid: boolean;
  errors: string[];
}

export interface WorkerImportRecord {
  _id: Types.ObjectId;
  fileName: string;
  createdBy: Types.ObjectId;
  rows: WorkerImportRow[];
  status: 'PREVIEWED' | 'PROCESSING' | 'COMPLETED';
  expiresAt: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WorkerImportRowSchema = new Schema<WorkerImportRow>(
  {
    rowNumber: { type: Number, required: true },
    // Invalid preview rows are intentionally persisted so an Admin can see and
    // correct them. Empty required cells therefore need an empty-string default
    // rather than Mongoose's string `required` validator.
    name: { type: String, default: '' },
    email: { type: String, default: '' },
    emailNormalized: { type: String, default: '' },
    contact: { type: String },
    department: { type: String },
    valid: { type: Boolean, required: true },
    errors: { type: [String], required: true, default: [] },
  },
  { _id: false, suppressReservedKeysWarning: true },
);

const WorkerImportSchema = new Schema<WorkerImportRecord>(
  {
    fileName: { type: String, required: true, maxlength: 255 },
    createdBy: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
    rows: { type: [WorkerImportRowSchema], required: true },
    status: {
      type: String,
      enum: ['PREVIEWED', 'PROCESSING', 'COMPLETED'],
      required: true,
      default: 'PREVIEWED',
    },
    expiresAt: { type: Date, required: true },
    completedAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

WorkerImportSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const WorkerImportModel = model<WorkerImportRecord>('WorkerImport', WorkerImportSchema);
