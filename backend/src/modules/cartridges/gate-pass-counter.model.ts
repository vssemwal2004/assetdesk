import { model, Schema } from 'mongoose';

interface GatePassCounterRecord {
  _id: string;
  sequence: number;
}

const GatePassCounterSchema = new Schema<GatePassCounterRecord>(
  {
    _id: { type: String, required: true },
    sequence: { type: Number, required: true, default: 0, min: 0 },
  },
  { versionKey: false },
);

export const GatePassCounterModel = model<GatePassCounterRecord>(
  'CartridgeGatePassCounter',
  GatePassCounterSchema,
);
