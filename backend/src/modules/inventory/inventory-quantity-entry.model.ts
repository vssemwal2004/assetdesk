import { model, Schema, type Types } from 'mongoose';

export type InventoryQuantityEntryAction = 'INITIAL' | 'INCREASE' | 'DECREASE';

export interface InventoryQuantityEntryRecord {
  _id: Types.ObjectId;
  materialId: Types.ObjectId;
  materialCode: string;
  trackingMode: 'SERIALIZED' | 'QUANTITY';
  action: InventoryQuantityEntryAction;
  quantityDelta: number;
  previousTotalQuantity: number;
  totalQuantity: number;
  entryDate: Date;
  vendorName?: string;
  reason?: string;
  actorUserId?: Types.ObjectId;
  actorWorkerId?: string;
  actorRole?: 'ADMIN' | 'WORKER';
  createdAt: Date;
  updatedAt: Date;
}

const InventoryQuantityEntrySchema = new Schema<InventoryQuantityEntryRecord>(
  {
    materialId: { type: Schema.Types.ObjectId, ref: 'Material', required: true, immutable: true },
    materialCode: { type: String, required: true, immutable: true, index: true },
    trackingMode: { type: String, enum: ['SERIALIZED', 'QUANTITY'], required: true },
    action: { type: String, enum: ['INITIAL', 'INCREASE', 'DECREASE'], required: true },
    quantityDelta: { type: Number, required: true, validate: Number.isSafeInteger },
    previousTotalQuantity: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    totalQuantity: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    entryDate: { type: Date, required: true, index: true },
    vendorName: { type: String, trim: true, maxlength: 120 },
    reason: { type: String, trim: true, maxlength: 500 },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    actorWorkerId: { type: String, maxlength: 32 },
    actorRole: { type: String, enum: ['ADMIN', 'WORKER'] },
  },
  { timestamps: true, versionKey: false },
);

InventoryQuantityEntrySchema.index({ materialCode: 1, entryDate: -1, _id: -1 });
InventoryQuantityEntrySchema.index({ materialCode: 1, vendorName: 1, entryDate: -1 });

export const InventoryQuantityEntryModel = model<InventoryQuantityEntryRecord>(
  'InventoryQuantityEntry',
  InventoryQuantityEntrySchema,
);
