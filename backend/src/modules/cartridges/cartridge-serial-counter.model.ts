import { model, Schema } from 'mongoose';

interface CartridgeSerialCounterRecord {
  _id: string;
  sequence: number;
}

const CartridgeSerialCounterSchema = new Schema<CartridgeSerialCounterRecord>(
  {
    _id: { type: String, required: true },
    sequence: { type: Number, required: true, default: 0, min: 0 },
  },
  { versionKey: false },
);

export const CartridgeSerialCounterModel = model<CartridgeSerialCounterRecord>(
  'CartridgeSerialCounter',
  CartridgeSerialCounterSchema,
);
