import { model, Schema, type HydratedDocument, type Types } from 'mongoose';

import type { AssetDetailKind } from '@assetdesk/contracts';

export interface AssetDetailRecord {
  _id: Types.ObjectId;
  kind: AssetDetailKind;
  name: string;
  normalizedName: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type AssetDetailDocument = HydratedDocument<AssetDetailRecord>;

const AssetDetailSchema = new Schema<AssetDetailRecord>(
  {
    kind: {
      type: String,
      enum: ['ASSET_TYPE', 'CONSUMABLE_TYPE', 'LOCATION', 'BLOCK', 'DEPARTMENT'],
      required: true,
      immutable: true,
    },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    normalizedName: { type: String, required: true, maxlength: 120 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  },
  { timestamps: true, versionKey: false },
);

AssetDetailSchema.index({ kind: 1, normalizedName: 1 }, { unique: true });

export const AssetDetailModel = model<AssetDetailRecord>('AssetDetail', AssetDetailSchema);
