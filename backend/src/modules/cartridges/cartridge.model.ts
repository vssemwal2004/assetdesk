import { model, Schema, type HydratedDocument, type Types } from 'mongoose';
import type { CartridgeStatus } from '@assetdesk/contracts';

export interface CartridgeRecord {
  _id: Types.ObjectId;
  serialNumber: string;
  serialNumberNormalized: string;
  cartridgeModel: string;
  colour: 'BLACK' | 'CYAN' | 'MAGENTA' | 'YELLOW' | 'OTHER';
  compatiblePrinter?: string;
  location: string;
  department: string;
  vendorName?: string;
  status: CartridgeStatus;
  currentHolderName?: string;
  currentHolderId?: string;
  refillCount: number;
  notes?: string;
  createdBy: Types.ObjectId;
  createdByWorkerId: string;
  createdAt: Date;
  updatedAt: Date;
}
export type CartridgeDocument = HydratedDocument<CartridgeRecord>;
const CartridgeSchema = new Schema<CartridgeRecord>(
  {
    serialNumber: { type: String, required: true, trim: true, maxlength: 120 },
    serialNumberNormalized: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: 120,
    },
    cartridgeModel: { type: String, required: true, trim: true, maxlength: 120 },
    colour: { type: String, enum: ['BLACK', 'CYAN', 'MAGENTA', 'YELLOW', 'OTHER'], required: true },
    compatiblePrinter: { type: String, trim: true, maxlength: 120 },
    location: { type: String, required: true, trim: true, maxlength: 120 },
    department: { type: String, required: true, trim: true, maxlength: 120 },
    vendorName: { type: String, trim: true, maxlength: 120 },
    status: {
      type: String,
      enum: [
        'FILLED_AVAILABLE',
        'ISSUED',
        'EMPTY',
        'DEFECTIVE',
        'READY_FOR_GATE_OUT',
        'WITH_VENDOR',
        'QC_PENDING',
        'REFILL_FAILED',
        'DAMAGED',
        'SCRAP_PENDING',
        'SCRAPPED',
      ],
      required: true,
    },
    currentHolderName: { type: String, trim: true, maxlength: 120 },
    currentHolderId: { type: String, trim: true, maxlength: 40 },
    refillCount: { type: Number, required: true, default: 0, min: 0 },
    notes: { type: String, trim: true, maxlength: 500 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    createdByWorkerId: { type: String, required: true, immutable: true },
  },
  { timestamps: true, versionKey: false },
);
CartridgeSchema.index({ status: 1, cartridgeModel: 1, updatedAt: -1 });
CartridgeSchema.index({ createdBy: 1, updatedAt: -1 });
export const CartridgeModel = model<CartridgeRecord>('Cartridge', CartridgeSchema);
