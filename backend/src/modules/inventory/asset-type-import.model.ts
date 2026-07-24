import { model, Schema, type Types } from 'mongoose';

export interface AssetTypeImportPreviewRow {
  rowNumber: number;
  kind?: string;
  name: string;
  valid: boolean;
  errors: string[];
}

export interface AssetTypeImportRecord {
  _id: Types.ObjectId;
  fileName: string;
  createdBy: Types.ObjectId;
  rows: AssetTypeImportPreviewRow[];
  inputs: Array<{ kind: string; name: string }>;
  status: 'PREVIEWED' | 'PROCESSING' | 'COMPLETED';
  expiresAt: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PreviewRowSchema = new Schema<AssetTypeImportPreviewRow>(
  {
    rowNumber: { type: Number, required: true },
    kind: { type: String },
    name: { type: String, default: '' },
    valid: { type: Boolean, required: true },
    errors: { type: [String], required: true, default: [] },
  },
  { _id: false, suppressReservedKeysWarning: true },
);

const AssetTypeImportSchema = new Schema<AssetTypeImportRecord>(
  {
    fileName: { type: String, required: true, maxlength: 255 },
    createdBy: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
    rows: { type: [PreviewRowSchema], required: true },
    inputs: { type: [{ kind: String, name: String }], required: true },
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

AssetTypeImportSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AssetTypeImportModel = model<AssetTypeImportRecord>(
  'AssetTypeImport',
  AssetTypeImportSchema,
);
