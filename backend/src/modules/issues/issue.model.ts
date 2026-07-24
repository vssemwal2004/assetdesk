import { model, Schema, type HydratedDocument, type Types } from 'mongoose';

import type {
  IssueStatus,
  DuePreset,
  AssignmentType,
  ReceiverType,
  ReturnDisposition,
  ReturnPolicy,
  TrackingMode,
  UserRole,
} from '@assetdesk/contracts';

export interface IssueReceiverSnapshotRecord {
  receiverId: Types.ObjectId;
  receiverCode: string;
  fullName: string;
  universityId?: string;
  type: ReceiverType;
  department?: string;
  contact: string;
  email: string;
}

export interface IssueActorSnapshotRecord {
  userId: Types.ObjectId;
  workerId: string;
  name: string;
  role: UserRole;
}

export interface IssueMaterialSnapshotRecord {
  materialId: Types.ObjectId;
  materialCode: string;
  name: string;
  category: string;
  description?: string;
  source: 'CATALOG';
  trackingMode: TrackingMode;
  returnPolicy: ReturnPolicy;
  unitLabel?: string;
}

export interface IssueAssetRecord {
  assetUnitId: Types.ObjectId;
  assetTag: string;
  serialNumber?: string;
  conditionAtIssue: string;
  outstanding: boolean;
  returnDisposition?: ReturnDisposition;
  returnedAt?: Date;
}

export interface IssueLineRecord {
  lineId: string;
  material: IssueMaterialSnapshotRecord;
  issuedQuantity: number;
  outstandingQuantity: number;
  assets: IssueAssetRecord[];
}

export interface ReturnEventQuantityItemRecord {
  trackingMode: 'QUANTITY';
  lineId: string;
  materialCode: string;
  materialName: string;
  quantity: number;
  disposition: ReturnDisposition;
  condition: string;
}

export interface ReturnEventSerializedItemRecord {
  trackingMode: 'SERIALIZED';
  lineId: string;
  materialCode: string;
  materialName: string;
  assetTag: string;
  serialNumber?: string;
  disposition: ReturnDisposition;
  condition: string;
}

export type ReturnEventItemRecord = ReturnEventQuantityItemRecord | ReturnEventSerializedItemRecord;

export interface ReturnEventRecord {
  returnEventId: string;
  issueId: string;
  returnedAt: Date;
  performedBy: IssueActorSnapshotRecord;
  items: ReturnEventItemRecord[];
  notes?: string;
  remainingOutstandingQuantity: number;
  resultingIssueStatus: IssueStatus;
  completedIssue: boolean;
  idempotencyKeyHash: string;
  requestFingerprint: string;
}

export interface IssueRecord {
  _id: Types.ObjectId;
  issueId: string;
  receiver: IssueReceiverSnapshotRecord;
  issuedBy: IssueActorSnapshotRecord;
  issuedAt: Date;
  expectedReturnAt?: Date;
  duePreset?: DuePreset;
  assignmentType: AssignmentType;
  status: IssueStatus;
  purpose?: string;
  notes?: string;
  lines: IssueLineRecord[];
  returnEvents: ReturnEventRecord[];
  totalIssuedQuantity: number;
  totalOutstandingQuantity: number;
  hasDamagedOutcome: boolean;
  hasLostOutcome: boolean;
  reminderCount: number;
  lastReminderAt?: Date;
  idempotencyKeyHash: string;
  requestFingerprint: string;
  createdByUserId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type IssueDocument = HydratedDocument<IssueRecord>;

const ActorSnapshotSchema = new Schema<IssueActorSnapshotRecord>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    workerId: { type: String, required: true, immutable: true, maxlength: 32 },
    name: { type: String, required: true, immutable: true, maxlength: 120 },
    role: { type: String, enum: ['ADMIN', 'WORKER'], required: true, immutable: true },
  },
  { _id: false },
);

const ReceiverSnapshotSchema = new Schema<IssueReceiverSnapshotRecord>(
  {
    receiverId: { type: Schema.Types.ObjectId, ref: 'Receiver', required: true, immutable: true },
    receiverCode: { type: String, required: true, immutable: true, maxlength: 32 },
    fullName: { type: String, required: true, maxlength: 120 },
    universityId: { type: String, maxlength: 64 },
    type: {
      type: String,
      enum: ['FACULTY', 'STAFF', 'STUDENT', 'DEPARTMENT', 'AUTHORIZED_EXTERNAL', 'MANAGEMENT', 'GEHU'],
      required: true,
    },
    department: { type: String, maxlength: 120 },
    contact: { type: String, required: true, maxlength: 40 },
    email: { type: String, required: true, maxlength: 254 },
  },
  { _id: false },
);

const MaterialSnapshotSchema = new Schema<IssueMaterialSnapshotRecord>(
  {
    materialId: { type: Schema.Types.ObjectId, ref: 'Material', required: true, immutable: true },
    materialCode: { type: String, required: true, immutable: true, maxlength: 32 },
    name: { type: String, required: true, immutable: true, maxlength: 120 },
    category: { type: String, required: true, immutable: true, maxlength: 120 },
    description: { type: String, immutable: true, maxlength: 500 },
    source: {
      type: String,
      enum: ['CATALOG'],
      required: true,
      immutable: true,
      default: 'CATALOG',
    },
    trackingMode: {
      type: String,
      enum: ['SERIALIZED', 'QUANTITY'],
      required: true,
      immutable: true,
    },
    returnPolicy: {
      type: String,
      enum: ['REUSABLE', 'CONSUMABLE'],
      required: true,
      immutable: true,
    },
    unitLabel: { type: String, immutable: true, maxlength: 40 },
  },
  { _id: false },
);

const IssueAssetSchema = new Schema<IssueAssetRecord>(
  {
    assetUnitId: { type: Schema.Types.ObjectId, ref: 'AssetUnit', required: true, immutable: true },
    assetTag: { type: String, required: true, immutable: true, maxlength: 32 },
    serialNumber: { type: String, immutable: true, maxlength: 120 },
    conditionAtIssue: { type: String, required: true, immutable: true, maxlength: 120 },
    outstanding: { type: Boolean, required: true, default: true },
    returnDisposition: {
      type: String,
      enum: ['AVAILABLE', 'RETURNED', 'UNDER_REPAIR', 'DAMAGED', 'LOST', 'SCRAPPED'],
    },
    returnedAt: { type: Date },
  },
  { _id: false },
);

IssueAssetSchema.pre('validate', function validateAssetReturnEvidence() {
  const hasDisposition = this.returnDisposition !== undefined;
  const hasReturnTime = this.returnedAt !== undefined;
  if (this.outstanding && (hasDisposition || hasReturnTime)) {
    this.invalidate(
      'outstanding',
      'An outstanding asset cannot contain Return disposition or time.',
    );
  }
  if (!this.outstanding && (!hasDisposition || !hasReturnTime)) {
    this.invalidate('outstanding', 'A processed asset requires both Return disposition and time.');
  }
});

const IssueLineSchema = new Schema<IssueLineRecord>(
  {
    lineId: { type: String, required: true, immutable: true },
    material: { type: MaterialSnapshotSchema, required: true, immutable: true },
    issuedQuantity: {
      type: Number,
      required: true,
      min: 1,
      immutable: true,
      validate: Number.isSafeInteger,
    },
    outstandingQuantity: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isSafeInteger,
    },
    assets: { type: [IssueAssetSchema], required: true, default: [] },
  },
  { _id: false },
);

IssueLineSchema.pre('validate', function validateIssueLineInvariants() {
  if (this.outstandingQuantity > this.issuedQuantity) {
    this.invalidate('outstandingQuantity', 'Outstanding quantity cannot exceed issued quantity.');
  }
  if (!this.material) return;

  if (this.material.trackingMode === 'SERIALIZED') {
    if (this.material.returnPolicy !== 'REUSABLE' || this.material.unitLabel !== undefined) {
      this.invalidate('material', 'Serialized material must be reusable without a unit label.');
    }
    if (this.assets.length !== this.issuedQuantity) {
      this.invalidate('assets', 'Serialized asset count must equal issued quantity.');
    }
    if (this.assets.filter((asset) => asset.outstanding).length !== this.outstandingQuantity) {
      this.invalidate('outstandingQuantity', 'Outstanding quantity must match outstanding assets.');
    }
    return;
  }

  if (!this.material.unitLabel) {
    this.invalidate('material.unitLabel', 'Quantity material requires a unit label.');
  }
  if (this.assets.length > 0) {
    this.invalidate('assets', 'Quantity-tracked lines cannot contain serialized assets.');
  }
});

const ReturnEventItemSchema = new Schema<ReturnEventItemRecord>(
  {
    trackingMode: { type: String, enum: ['QUANTITY', 'SERIALIZED'], required: true },
    lineId: { type: String, required: true },
    materialCode: { type: String, required: true, maxlength: 32 },
    materialName: { type: String, required: true, maxlength: 120 },
    quantity: { type: Number, min: 1 },
    assetTag: { type: String, maxlength: 32 },
    serialNumber: { type: String, maxlength: 120 },
    disposition: {
      type: String,
      enum: ['AVAILABLE', 'RETURNED', 'UNDER_REPAIR', 'DAMAGED', 'LOST', 'SCRAPPED'],
    },
    condition: { type: String, maxlength: 120 },
  },
  { _id: false },
);

ReturnEventItemSchema.pre('validate', function validateReturnItemSubtype() {
  const quantity = this.get('quantity') as number | undefined;
  const assetTag = this.get('assetTag') as string | undefined;
  const disposition = this.get('disposition') as string | undefined;
  const condition = this.get('condition') as string | undefined;
  if (this.trackingMode === 'QUANTITY') {
    if (!Number.isSafeInteger(quantity) || (quantity ?? 0) < 1) {
      this.invalidate('quantity', 'A quantity Return item requires a positive integer quantity.');
    }
    if (assetTag !== undefined) {
      this.invalidate('trackingMode', 'A quantity Return item cannot contain asset tags.');
    }
    if (!disposition || !condition) {
      this.invalidate('trackingMode', 'A quantity Return item requires disposition and condition.');
    }
    return;
  }

  if (!assetTag || !disposition || !condition) {
    this.invalidate(
      'trackingMode',
      'A serialized Return item requires asset tag, disposition, and condition.',
    );
  }
  if (quantity !== undefined) {
    this.invalidate('quantity', 'A serialized Return item cannot contain quantity.');
  }
});

const ReturnEventSchema = new Schema<ReturnEventRecord>(
  {
    returnEventId: { type: String, required: true },
    issueId: { type: String, required: true, immutable: true },
    returnedAt: { type: Date, required: true, immutable: true },
    performedBy: { type: ActorSnapshotSchema, required: true, immutable: true },
    items: {
      type: [ReturnEventItemSchema],
      required: true,
      immutable: true,
      validate: {
        validator: (items: ReturnEventItemRecord[]) => items.length >= 1 && items.length <= 100,
        message: 'A Return event requires 1–100 items.',
      },
    },
    notes: { type: String, maxlength: 2_000, immutable: true },
    remainingOutstandingQuantity: { type: Number, required: true, min: 0, immutable: true },
    resultingIssueStatus: {
      type: String,
      enum: ['ISSUED', 'PARTIALLY_RETURNED', 'RETURNED', 'DAMAGED', 'LOST', 'CANCELLED'],
      required: true,
      immutable: true,
    },
    completedIssue: { type: Boolean, required: true, immutable: true },
    idempotencyKeyHash: { type: String, required: true, select: false, immutable: true },
    requestFingerprint: { type: String, required: true, select: false, immutable: true },
  },
  { _id: false },
);

const IssueSchema = new Schema<IssueRecord>(
  {
    issueId: { type: String, required: true, immutable: true, match: /^GEU-ISS-\d{4}-\d{6}$/ },
    receiver: { type: ReceiverSnapshotSchema, required: true, immutable: true },
    issuedBy: { type: ActorSnapshotSchema, required: true, immutable: true },
    issuedAt: { type: Date, required: true, immutable: true },
    expectedReturnAt: { type: Date },
    duePreset: {
      type: String,
      enum: ['ONE_DAY', 'ONE_WEEK', 'ONE_MONTH', 'SIX_MONTHS', 'ONE_YEAR', 'CUSTOM'],
    },
    assignmentType: {
      type: String,
      enum: ['LONG_TERM', 'SHORT_TERM'],
      required: true,
      immutable: true,
      default: 'SHORT_TERM',
    },
    status: {
      type: String,
      enum: ['ISSUED', 'PARTIALLY_RETURNED', 'RETURNED', 'DAMAGED', 'LOST', 'CANCELLED'],
      required: true,
      default: 'ISSUED',
    },
    purpose: { type: String, immutable: true, maxlength: 240 },
    notes: { type: String, immutable: true, maxlength: 2_000 },
    lines: {
      type: [IssueLineSchema],
      required: true,
      validate: {
        validator: (lines: IssueLineRecord[]) => lines.length >= 1 && lines.length <= 50,
        message: 'An Issue requires 1–50 lines.',
      },
    },
    returnEvents: {
      type: [ReturnEventSchema],
      required: true,
      default: [],
      validate: {
        validator: (events: ReturnEventRecord[]) => events.length <= 100,
        message: 'An Issue cannot contain more than 100 Return events.',
      },
    },
    totalIssuedQuantity: { type: Number, required: true, min: 1, immutable: true },
    totalOutstandingQuantity: { type: Number, required: true, min: 0 },
    hasDamagedOutcome: { type: Boolean, required: true, default: false },
    hasLostOutcome: { type: Boolean, required: true, default: false },
    reminderCount: { type: Number, required: true, min: 0, default: 0 },
    lastReminderAt: { type: Date },
    idempotencyKeyHash: { type: String, required: true, select: false, immutable: true },
    requestFingerprint: { type: String, required: true, select: false, immutable: true },
    createdByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
  },
  { timestamps: true, versionKey: false },
);

IssueSchema.pre('validate', function validateIssueInvariants() {
  const issuedTotal = this.lines.reduce((total, line) => total + line.issuedQuantity, 0);
  const outstandingTotal = this.lines.reduce((total, line) => total + line.outstandingQuantity, 0);
  if (issuedTotal !== this.totalIssuedQuantity) {
    this.invalidate('totalIssuedQuantity', 'Total issued quantity must match Issue lines.');
  }
  if (outstandingTotal !== this.totalOutstandingQuantity) {
    this.invalidate(
      'totalOutstandingQuantity',
      'Total outstanding quantity must match Issue lines.',
    );
  }

  const hasReturnableQuantity = this.lines.some((line) => line.outstandingQuantity > 0);
  const hasExpectedReturn = this.expectedReturnAt !== undefined;
  const hasDuePreset = this.duePreset !== undefined;
  const requiresExpectedReturn =
    hasReturnableQuantity && this.assignmentType === 'SHORT_TERM';
  const hasForbiddenReturnDate =
    this.assignmentType === 'LONG_TERM' && (hasExpectedReturn || hasDuePreset);
  if (
    (requiresExpectedReturn && (!hasExpectedReturn || !hasDuePreset)) ||
    hasForbiddenReturnDate
  ) {
    this.invalidate(
      'expectedReturnAt',
      requiresExpectedReturn
        ? 'Return-by-date Issues require an expected Return time and due preset.'
        : 'Permanent Issues cannot have a Return due time.',
    );
  }
});

IssueSchema.index({ issueId: 1 }, { unique: true, name: 'issue_id_unique' });
IssueSchema.index(
  { createdByUserId: 1, idempotencyKeyHash: 1 },
  { unique: true, name: 'issue_actor_idempotency_unique' },
);
IssueSchema.index(
  { 'returnEvents.idempotencyKeyHash': 1 },
  {
    unique: true,
    name: 'return_event_idempotency_unique',
    partialFilterExpression: { 'returnEvents.idempotencyKeyHash': { $type: 'string' } },
  },
);
IssueSchema.index({ createdByUserId: 1, issuedAt: -1 });
IssueSchema.index({ 'returnEvents.performedBy.userId': 1, issuedAt: -1 });
IssueSchema.index({ status: 1, expectedReturnAt: 1, issuedAt: -1 });
IssueSchema.index({ status: 1, totalOutstandingQuantity: 1, issuedAt: -1 });
IssueSchema.index({ issuedAt: -1, _id: -1 });
IssueSchema.index({ status: 1, totalOutstandingQuantity: 1 });
IssueSchema.index({ 'receiver.receiverCode': 1 });
IssueSchema.index({ 'receiver.fullName': 1 });
IssueSchema.index({ 'lines.material.materialCode': 1 });
IssueSchema.index({ 'lines.assets.assetTag': 1 });
IssueSchema.index({ 'lines.assets.serialNumber': 1 });
IssueSchema.index(
  {
    'receiver.fullName': 'text',
    'receiver.universityId': 'text',
    'lines.material.name': 'text',
  },
  {
    name: 'issue_search_text',
    weights: {
      'receiver.fullName': 10,
      'receiver.universityId': 8,
      'lines.material.name': 6,
    },
  },
);

export const IssueModel = model<IssueRecord>('Issue', IssueSchema);
