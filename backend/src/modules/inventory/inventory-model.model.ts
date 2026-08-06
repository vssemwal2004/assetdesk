import { model, Schema, type Types } from 'mongoose';

import type { TrackingMode } from '@assetdesk/contracts';

export interface InventoryModelRecord {
  _id: Types.ObjectId;
  category: string;
  categoryNormalized: string;
  name: string;
  nameNormalized: string;
  trackingMode: TrackingMode;
  aliases: string[];
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const InventoryModelSchema = new Schema<InventoryModelRecord>(
  {
    category: { type: String, required: true, trim: true, maxlength: 120 },
    categoryNormalized: { type: String, required: true, maxlength: 120 },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    nameNormalized: { type: String, required: true, maxlength: 120 },
    trackingMode: { type: String, enum: ['SERIALIZED', 'QUANTITY'], required: true },
    aliases: { type: [String], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, versionKey: false },
);

InventoryModelSchema.index(
  { categoryNormalized: 1, nameNormalized: 1, trackingMode: 1 },
  { unique: true },
);

export const InventoryModelModel = model<InventoryModelRecord>(
  'InventoryModel',
  InventoryModelSchema,
);
