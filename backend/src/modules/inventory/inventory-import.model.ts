import { model, Schema, type Types } from 'mongoose';

import type { TrackingMode } from '@assetdesk/contracts';

export interface InventoryImportPreviewRow {
  rowNumber: number;
  name: string;
  category: string;
  typeModelName?: string;
  location?: string;
  block?: string;
  locationBlock?: string;
  serialNumber?: string;
  quantity?: number;
  unitLabel?: string;
  status?: string;
  valid: boolean;
  errors: string[];
}

export interface InventoryImportInput {
  name: string;
  category: string;
  typeModelName?: string | undefined;
  location?: string | undefined;
  block?: string | undefined;
  locationBlock?: string | undefined;
  description?: string | undefined;
  assignmentTypes: string[];
  trackingMode: TrackingMode;
  returnPolicy: string;
  serialNumbers?: string[] | undefined;
  totalQuantity?: number | undefined;
  unitLabel?: string | undefined;
  status?: string | undefined;
}

export interface InventoryImportRecord {
  _id: Types.ObjectId;
  fileName: string;
  createdBy: Types.ObjectId;
  mode: TrackingMode;
  rows: InventoryImportPreviewRow[];
  inputs: InventoryImportInput[];
  status: 'PREVIEWED' | 'PROCESSING' | 'COMPLETED';
  expiresAt: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PreviewRowSchema = new Schema<InventoryImportPreviewRow>(
  {
    rowNumber: { type: Number, required: true },
    name: { type: String, default: '' },
    category: { type: String, default: '' },
    typeModelName: { type: String },
    location: { type: String },
    block: { type: String },
    locationBlock: { type: String },
    serialNumber: { type: String },
    quantity: { type: Number },
    unitLabel: { type: String },
    status: { type: String },
    valid: { type: Boolean, required: true },
    errors: { type: [String], required: true, default: [] },
  },
  { _id: false, suppressReservedKeysWarning: true },
);

const ImportInputSchema = new Schema<InventoryImportInput>(
  {
    name: { type: String, required: true },
    category: { type: String, required: true },
    typeModelName: { type: String },
    location: { type: String },
    block: { type: String },
    locationBlock: { type: String },
    description: { type: String },
    assignmentTypes: { type: [String], required: true },
    trackingMode: { type: String, enum: ['SERIALIZED', 'QUANTITY'], required: true },
    returnPolicy: { type: String, enum: ['REUSABLE', 'CONSUMABLE'], required: true },
    serialNumbers: { type: [String] },
    totalQuantity: { type: Number },
    unitLabel: { type: String },
    status: { type: String, enum: ['ACTIVE', 'SCRAP', 'NOT_IN_USE'] },
  },
  { _id: false },
);

const InventoryImportSchema = new Schema<InventoryImportRecord>(
  {
    fileName: { type: String, required: true, maxlength: 255 },
    createdBy: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
    mode: { type: String, enum: ['SERIALIZED', 'QUANTITY'], required: true },
    rows: { type: [PreviewRowSchema], required: true },
    inputs: { type: [ImportInputSchema], required: true },
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

InventoryImportSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const InventoryImportModel = model<InventoryImportRecord>(
  'InventoryImport',
  InventoryImportSchema,
);
