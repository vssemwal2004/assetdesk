import { model, Schema } from 'mongoose';
const SchemaDefinition = new Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: Number, required: true, default: 0 },
  },
  { versionKey: false },
);
export const InventoryGatePassCounterModel = model('InventoryGatePassCounter', SchemaDefinition);
