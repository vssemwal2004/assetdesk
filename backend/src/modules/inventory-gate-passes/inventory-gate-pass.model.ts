import { model, Schema, type Types } from 'mongoose';

export interface GatePassActorSnapshot {
  userId: Types.ObjectId;
  workerId: string;
  name: string;
  role: 'ADMIN' | 'WORKER';
}
export interface InventoryGatePassItemRecord {
  itemId: string;
  materialId: Types.ObjectId;
  materialCode: string;
  materialName: string;
  category: string;
  model?: string;
  trackingMode: 'SERIALIZED' | 'QUANTITY';
  returnRequirement: 'RETURNABLE' | 'NON_RETURNABLE';
  assetUnitId?: Types.ObjectId;
  assetTag?: string;
  serialNumber?: string;
  quantity: number;
  unitLabel?: string;
  conditionOut?: string;
  assetStatusOut?: 'AVAILABLE' | 'RETURNED' | 'UNDER_REPAIR' | 'DAMAGED';
  movementCondition?: 'NOT_WORKING' | 'FAULTY' | 'DAMAGED' | 'UNDER_REPAIR' | 'OTHER';
  faultDescription?: string;
  receivedQuantity: number;
  remainingOutsideQuantity: number;
}
export interface InventoryGatePassRecord {
  _id: Types.ObjectId;
  gatePassNumber: string;
  source: 'ISSUE' | 'MANUAL';
  purpose: 'ISSUE_PERMANENT' | 'ISSUE_RETURNABLE' | 'REPAIR' | 'OTHER';
  issueId?: string;
  materialComposition: 'ASSET_ONLY' | 'CONSUMABLE_ONLY' | 'MIXED';
  status:
    | 'READY_FOR_OUT'
    | 'OUTSIDE'
    | 'PARTIALLY_IN'
    | 'GATE_IN_COMPLETED'
    | 'CLOSED_NON_RETURNABLE'
    | 'CANCELLED';
  destination: { name: string; organization?: string; address?: string; contact?: string };
  carrier: { name: string; contact?: string; vehicleNumber?: string };
  items: InventoryGatePassItemRecord[];
  expectedGateInAt?: Date;
  remarks?: string;
  createdBy: GatePassActorSnapshot;
  gateOut?: { at: Date; by: GatePassActorSnapshot };
  gateInEvents: Array<{
    eventId: string;
    receivedAt: Date;
    receivedBy: GatePassActorSnapshot;
    personReturning?: string;
    remarks?: string;
    items: Array<{
      itemId: string;
      quantity: number;
      condition: string;
      outcome: string;
      replacementSerialNumber?: string;
      remarks?: string;
    }>;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const ActorSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    workerId: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, enum: ['ADMIN', 'WORKER'], required: true },
  },
  { _id: false },
);
const ItemSchema = new Schema(
  {
    itemId: { type: String, required: true },
    materialId: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    materialCode: { type: String, required: true },
    materialName: { type: String, required: true },
    category: { type: String, required: true },
    model: String,
    trackingMode: { type: String, enum: ['SERIALIZED', 'QUANTITY'], required: true },
    returnRequirement: { type: String, enum: ['RETURNABLE', 'NON_RETURNABLE'], required: true },
    assetUnitId: { type: Schema.Types.ObjectId, ref: 'AssetUnit' },
    assetTag: String,
    serialNumber: String,
    quantity: { type: Number, required: true, min: 1 },
    unitLabel: String,
    conditionOut: String,
    assetStatusOut: {
      type: String,
      enum: ['AVAILABLE', 'RETURNED', 'UNDER_REPAIR', 'DAMAGED'],
    },
    movementCondition: {
      type: String,
      enum: ['NOT_WORKING', 'FAULTY', 'DAMAGED', 'UNDER_REPAIR', 'OTHER'],
    },
    faultDescription: String,
    receivedQuantity: { type: Number, required: true, default: 0 },
    remainingOutsideQuantity: { type: Number, required: true, default: 0 },
  },
  { _id: false },
);
const GateInItemSchema = new Schema(
  {
    itemId: { type: String, required: true },
    quantity: { type: Number, required: true },
    condition: { type: String, required: true },
    outcome: { type: String, required: true },
    replacementSerialNumber: String,
    remarks: String,
  },
  { _id: false },
);
const GateInEventSchema = new Schema(
  {
    eventId: { type: String, required: true },
    receivedAt: { type: Date, required: true },
    receivedBy: { type: ActorSchema, required: true },
    personReturning: String,
    remarks: String,
    items: { type: [GateInItemSchema], required: true },
  },
  { _id: false },
);
const InventoryGatePassSchema = new Schema<InventoryGatePassRecord>(
  {
    gatePassNumber: { type: String, required: true, unique: true, immutable: true },
    source: { type: String, enum: ['ISSUE', 'MANUAL'], required: true },
    purpose: {
      type: String,
      enum: ['ISSUE_PERMANENT', 'ISSUE_RETURNABLE', 'REPAIR', 'OTHER'],
      required: true,
    },
    issueId: String,
    materialComposition: {
      type: String,
      enum: ['ASSET_ONLY', 'CONSUMABLE_ONLY', 'MIXED'],
      required: true,
    },
    status: {
      type: String,
      enum: [
        'READY_FOR_OUT',
        'OUTSIDE',
        'PARTIALLY_IN',
        'GATE_IN_COMPLETED',
        'CLOSED_NON_RETURNABLE',
        'CANCELLED',
      ],
      required: true,
    },
    destination: {
      name: { type: String, required: true },
      organization: String,
      address: String,
      contact: String,
    },
    carrier: { name: { type: String, required: true }, contact: String, vehicleNumber: String },
    items: { type: [ItemSchema], required: true },
    expectedGateInAt: Date,
    remarks: String,
    createdBy: { type: ActorSchema, required: true },
    gateOut: { at: Date, by: ActorSchema },
    gateInEvents: { type: [GateInEventSchema], default: [] },
  },
  { timestamps: true, versionKey: false },
);
InventoryGatePassSchema.index({ status: 1, createdAt: -1 });
InventoryGatePassSchema.index({ issueId: 1, status: 1 });
InventoryGatePassSchema.index({ 'items.assetTag': 1, status: 1 });
export const InventoryGatePassModel = model<InventoryGatePassRecord>(
  'InventoryGatePass',
  InventoryGatePassSchema,
);
