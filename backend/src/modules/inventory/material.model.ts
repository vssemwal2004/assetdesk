import { model, Schema, type HydratedDocument, type Types } from 'mongoose';

import type {
  AssignmentType,
  MaterialStatus,
  ReturnPolicy,
  TrackingMode,
} from '@assetdesk/contracts';

export interface MaterialRecord {
  _id: Types.ObjectId;
  materialCode: string;
  name: string;
  category: string;
  typeModelName?: string;
  configuration?: string;
  location?: string;
  block?: string;
  department?: string;
  vendorName?: string;
  locationBlock?: string;
  identityKey?: string;
  description?: string;
  trackingMode: TrackingMode;
  returnPolicy: ReturnPolicy;
  status: MaterialStatus;
  totalQuantity: number;
  availableQuantity: number;
  issuedQuantity: number;
  unitLabel?: string;
  assignmentTypes: AssignmentType[];
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type MaterialDocument = HydratedDocument<MaterialRecord>;

const MaterialSchema = new Schema<MaterialRecord>(
  {
    materialCode: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      match: /^GEU-(?:MAT-\d{6}|\d{4}-\d{6})$/,
    },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    category: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    typeModelName: { type: String, trim: true, minlength: 2, maxlength: 120 },
    configuration: { type: String, trim: true, minlength: 1, maxlength: 1_000 },
    location: { type: String, trim: true, minlength: 1, maxlength: 120 },
    block: { type: String, trim: true, minlength: 1, maxlength: 120 },
    department: { type: String, trim: true, minlength: 1, maxlength: 120 },
    vendorName: { type: String, trim: true, maxlength: 120 },
    locationBlock: { type: String, trim: true, minlength: 1, maxlength: 120 },
    identityKey: { type: String, maxlength: 300 },
    description: { type: String, trim: true, maxlength: 1_000 },
    trackingMode: {
      type: String,
      enum: ['SERIALIZED', 'QUANTITY'],
      required: true,
      immutable: true,
    },
    returnPolicy: { type: String, enum: ['REUSABLE', 'CONSUMABLE'], required: true },
    status: {
      type: String,
      enum: ['ACTIVE', 'UNDER_MAINTENANCE', 'SCRAP', 'NOT_IN_USE', 'ARCHIVED'],
      required: true,
      default: 'ACTIVE',
    },
    totalQuantity: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    availableQuantity: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    issuedQuantity: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    unitLabel: { type: String, trim: true, minlength: 1, maxlength: 40 },
    assignmentTypes: {
      type: [String],
      enum: ['LONG_TERM', 'SHORT_TERM'],
      required: true,
      default: ['LONG_TERM', 'SHORT_TERM'],
      validate: {
        validator: (values: AssignmentType[]) =>
          values.length >= 1 && new Set(values).size === values.length,
        message: 'Select at least one assignment type.',
      },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  },
  { timestamps: true, versionKey: false },
);

MaterialSchema.pre('validate', function validateInventoryInvariants() {
  if (this.availableQuantity > this.totalQuantity) {
    this.invalidate('availableQuantity', 'Available quantity cannot exceed total quantity.');
  }
  if (this.trackingMode === 'SERIALIZED') {
    if (this.availableQuantity + this.issuedQuantity > this.totalQuantity) {
      this.invalidate('issuedQuantity', 'Available and issued units cannot exceed total units.');
    }
    if (this.returnPolicy !== 'REUSABLE') {
      this.invalidate('returnPolicy', 'Serialized material must be reusable.');
    }
    if (this.unitLabel !== undefined) {
      this.invalidate('unitLabel', 'Serialized material cannot have a unit label.');
    }
  } else {
    if (!this.unitLabel) {
      this.invalidate('unitLabel', 'Quantity material requires a unit label.');
    }
    if (this.issuedQuantity !== this.totalQuantity - this.availableQuantity) {
      this.invalidate(
        'issuedQuantity',
        'Issued quantity must equal total minus available quantity.',
      );
    }
  }
});

MaterialSchema.index({ status: 1, trackingMode: 1, category: 1 });
MaterialSchema.index({ status: 1, trackingMode: 1, availableQuantity: 1, createdAt: -1 });
MaterialSchema.index({ name: 1 });
MaterialSchema.index(
  { name: 'text', category: 'text', description: 'text' },
  { name: 'material_search_text', weights: { name: 10, category: 5, description: 1 } },
);
MaterialSchema.index(
  { identityKey: 1 },
  { unique: true, partialFilterExpression: { identityKey: { $type: 'string' } } },
);

export const MaterialModel = model<MaterialRecord>('Material', MaterialSchema);
