import { model, Schema, type Types } from 'mongoose';
export interface CartridgeMovementRecord {
  _id: Types.ObjectId;
  cartridgeId: Types.ObjectId;
  serialNumber: string;
  type: string;
  fromStatus?: string;
  toStatus: string;
  employeeName?: string;
  employeeId?: string;
  department?: string;
  defectReason?: string;
  remarks?: string;
  actorUserId: Types.ObjectId;
  actorWorkerId: string;
  createdAt: Date;
  updatedAt: Date;
}
const CartridgeMovementSchema = new Schema<CartridgeMovementRecord>(
  {
    cartridgeId: { type: Schema.Types.ObjectId, ref: 'Cartridge', required: true },
    serialNumber: { type: String, required: true },
    type: {
      type: String,
      enum: ['CREATED', 'ISSUED', 'RETURNED', 'GATE_OUT', 'GATE_IN', 'QC', 'STATUS_CHANGED'],
      required: true,
    },
    fromStatus: String,
    toStatus: { type: String, required: true },
    employeeName: String,
    employeeId: String,
    department: String,
    defectReason: { type: String, maxlength: 500 },
    remarks: { type: String, maxlength: 500 },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actorWorkerId: { type: String, required: true },
  },
  { timestamps: true, versionKey: false },
);
CartridgeMovementSchema.index({ cartridgeId: 1, createdAt: -1 });
export const CartridgeMovementModel = model<CartridgeMovementRecord>(
  'CartridgeMovement',
  CartridgeMovementSchema,
);
