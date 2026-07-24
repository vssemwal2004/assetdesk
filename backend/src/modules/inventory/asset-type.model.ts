import { model, Schema, type HydratedDocument, type Types } from 'mongoose';

export interface AssetTypeRecord {
  _id: Types.ObjectId;
  name: string;
  normalizedName: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type AssetTypeDocument = HydratedDocument<AssetTypeRecord>;

const AssetTypeSchema = new Schema<AssetTypeRecord>(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    normalizedName: { type: String, required: true, unique: true, maxlength: 120 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  },
  { timestamps: true, versionKey: false },
);

export const AssetTypeModel = model<AssetTypeRecord>('AssetType', AssetTypeSchema);
