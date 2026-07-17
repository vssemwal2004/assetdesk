import { model, Schema } from 'mongoose';

interface InventoryCounterRecord {
  _id: 'MATERIAL' | 'ASSET';
  sequence: number;
}

const InventoryCounterSchema = new Schema<InventoryCounterRecord>(
  {
    _id: { type: String, enum: ['MATERIAL', 'ASSET'], required: true },
    sequence: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  },
  { versionKey: false },
);

export const InventoryCounterModel = model<InventoryCounterRecord>(
  'InventoryCounter',
  InventoryCounterSchema,
);
