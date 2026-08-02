import { model, Schema, type Types } from 'mongoose';
export interface GatePassRecord {
  _id: Types.ObjectId;
  gatePassNumber: string;
  vendorName: string;
  personTakingMaterial: string;
  cartridgeIds: Types.ObjectId[];
  cartridgeSerialNumbers: string[];
  quantity: number;
  status: string;
  preparedByUserId: Types.ObjectId;
  preparedByWorkerId: string;
  preparedByName: string;
  verifiedByUserId?: Types.ObjectId;
  verifiedByWorkerId?: string;
  verifiedByName?: string;
  verifiedAt?: Date;
  gateOutAt?: Date;
  gateOutByName?: string;
  gateInEvents: Array<{ at: Date; byName: string; serialNumbers: string[]; remarks?: string }>;
  expectedReturnDate?: Date;
  remarks?: string;
  createdAt: Date;
  updatedAt: Date;
}
const GateInEventSchema = new Schema(
  {
    at: { type: Date, required: true },
    byName: { type: String, required: true },
    serialNumbers: { type: [String], required: true },
    remarks: String,
  },
  { _id: false },
);
const GatePassSchema = new Schema<GatePassRecord>(
  {
    gatePassNumber: { type: String, required: true, unique: true, immutable: true },
    vendorName: { type: String, required: true, trim: true },
    personTakingMaterial: { type: String, required: true, trim: true },
    cartridgeIds: [{ type: Schema.Types.ObjectId, ref: 'Cartridge', required: true }],
    cartridgeSerialNumbers: { type: [String], required: true, immutable: true },
    quantity: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: [
        'DRAFT',
        'AWAITING_VERIFICATION',
        'VERIFIED',
        'GATE_OUT',
        'PARTIALLY_RETURNED',
        'QC_PENDING',
        'CLOSED',
        'CANCELLED',
      ],
      required: true,
    },
    preparedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    preparedByWorkerId: { type: String, required: true },
    preparedByName: { type: String, required: true },
    verifiedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    verifiedByWorkerId: String,
    verifiedByName: String,
    verifiedAt: Date,
    gateOutAt: Date,
    gateOutByName: String,
    gateInEvents: { type: [GateInEventSchema], default: [] },
    expectedReturnDate: Date,
    remarks: { type: String, maxlength: 500 },
  },
  { timestamps: true, versionKey: false },
);
GatePassSchema.index({ status: 1, createdAt: -1 });
export const GatePassModel = model<GatePassRecord>('CartridgeGatePass', GatePassSchema);
