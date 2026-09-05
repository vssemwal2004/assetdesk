import { model, Schema, type HydratedDocument, type Types } from 'mongoose';

import type { AssetUnitStatus } from '@assetdesk/contracts';

export interface AssetUnitRecord {
  _id: Types.ObjectId;
  assetTag: string;
  materialId: Types.ObjectId;
  materialCode: string;
  serialNumber?: string;
  serialNumberNormalized?: string;
  condition: string;
  entryDate?: Date;
  vendorName?: string;
  status: AssetUnitStatus;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type AssetUnitDocument = HydratedDocument<AssetUnitRecord>;

const AssetUnitSchema = new Schema<AssetUnitRecord>(
  {
    assetTag: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      match: /^GEU-(?:AST-\d{6}|\d{4}-\d{6})$/,
    },
    materialId: { type: Schema.Types.ObjectId, ref: 'Material', required: true, immutable: true },
    materialCode: {
      type: String,
      required: true,
      immutable: true,
      match: /^GEU-(?:MAT-\d{6}|\d{4}-\d{6})$/,
    },
    serialNumber: { type: String, trim: true, minlength: 1, maxlength: 120 },
    serialNumberNormalized: { type: String, trim: true, uppercase: true, maxlength: 120 },
    condition: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    entryDate: { type: Date },
    vendorName: { type: String, trim: true, maxlength: 120 },
    status: {
      type: String,
      enum: [
        'AVAILABLE',
        'ISSUED',
        'OUTSIDE',
        'RETURNED',
        'UNDER_REPAIR',
        'DAMAGED',
        'LOST',
        'SCRAPPED',
      ],
      required: true,
      default: 'AVAILABLE',
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  },
  { timestamps: true, versionKey: false },
);

AssetUnitSchema.index({ materialId: 1, status: 1, createdAt: -1 });
AssetUnitSchema.index(
  { serialNumberNormalized: 1 },
  {
    unique: true,
    partialFilterExpression: { serialNumberNormalized: { $type: 'string' } },
  },
);

export const AssetUnitModel = model<AssetUnitRecord>('AssetUnit', AssetUnitSchema);
