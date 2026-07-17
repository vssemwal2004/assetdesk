import { z } from 'zod';

import {
  AssignmentTypeSchema,
  IssueStatusSchema,
  ReceiverTypeSchema,
  ReturnPolicySchema,
  TrackingModeSchema,
  UserRoleSchema,
} from './domain.js';
import { CreateReceiverRequestSchema } from './receivers.js';
import {
  AssetTagSchema,
  IssueIdSchema,
  MaterialCodeSchema,
  ReceiverCodeSchema,
  WorkerIdSchema,
} from './identifiers.js';

const OptionalPurposeSchema = z.string().trim().min(1).max(240).optional();
const OptionalNotesSchema = z.string().trim().min(1).max(2_000).optional();
const LineIdSchema = z.string().uuid();

export const DuePresetSchema = z.enum([
  'ONE_DAY',
  'ONE_WEEK',
  'ONE_MONTH',
  'SIX_MONTHS',
  'ONE_YEAR',
  'CUSTOM',
]);

export const DueSelectionSchema = z.discriminatedUnion('preset', [
  z.object({ preset: z.literal('ONE_DAY') }).strict(),
  z.object({ preset: z.literal('ONE_WEEK') }).strict(),
  z.object({ preset: z.literal('ONE_MONTH') }).strict(),
  z.object({ preset: z.literal('SIX_MONTHS') }).strict(),
  z.object({ preset: z.literal('ONE_YEAR') }).strict(),
  z
    .object({
      preset: z.literal('CUSTOM'),
      expectedReturnAt: z.string().datetime({ offset: true }),
    })
    .strict(),
]);

export const CreateIssueQuantityLineSchema = z
  .object({
    trackingMode: z.literal('QUANTITY'),
    materialCode: MaterialCodeSchema,
    quantity: z.number().int().min(1).max(1_000_000),
  })
  .strict();

export const CreateIssueSerializedLineSchema = z
  .object({
    trackingMode: z.literal('SERIALIZED'),
    materialCode: MaterialCodeSchema,
    assetTags: z.array(AssetTagSchema).min(1).max(100),
  })
  .strict()
  .superRefine((line, context) => {
    if (new Set(line.assetTags).size !== line.assetTags.length) {
      context.addIssue({
        code: 'custom',
        path: ['assetTags'],
        message: 'Asset tags must be unique.',
      });
    }
  });

export const CreateIssueLineSchema = z.discriminatedUnion('trackingMode', [
  CreateIssueQuantityLineSchema,
  CreateIssueSerializedLineSchema,
]);

export const CreateCatalogIssueRequestSchema = z
  .object({
    mode: z.literal('CATALOG').optional(),
    assignmentType: AssignmentTypeSchema,
    receiverCode: ReceiverCodeSchema.optional(),
    receiver: CreateReceiverRequestSchema.optional(),
    lines: z.array(CreateIssueLineSchema).min(1).max(50),
    due: DueSelectionSchema.optional(),
    purpose: OptionalPurposeSchema,
    notes: OptionalNotesSchema,
  })
  .strict()
  .superRefine((request, context) => {
    if ((request.receiverCode ? 1 : 0) + (request.receiver ? 1 : 0) !== 1) {
      context.addIssue({
        code: 'custom',
        path: ['receiver'],
        message: 'Provide issued-to details.',
      });
    }
    const materialCodes = request.lines.map((line) => line.materialCode);
    if (new Set(materialCodes).size !== materialCodes.length) {
      context.addIssue({
        code: 'custom',
        path: ['lines'],
        message: 'Each material can appear only once.',
      });
    }
    const assetTags = request.lines.flatMap((line) =>
      line.trackingMode === 'SERIALIZED' ? line.assetTags : [],
    );
    if (new Set(assetTags).size !== assetTags.length) {
      context.addIssue({
        code: 'custom',
        path: ['lines'],
        message: 'Asset tags must be unique across the request.',
      });
    }
    if (assetTags.length > 100) {
      context.addIssue({
        code: 'custom',
        path: ['lines'],
        message: 'At most 100 serialized assets can be issued at once.',
      });
    }
    if (request.assignmentType === 'SHORT_TERM' && !request.due) {
      context.addIssue({
        code: 'custom',
        path: ['due'],
        message: 'Short-Term Assignment requires an expected return date.',
      });
    }
    if (request.assignmentType === 'LONG_TERM' && request.due) {
      context.addIssue({
        code: 'custom',
        path: ['due'],
        message: 'Long-Term Assignment does not use a fixed return date.',
      });
    }
  });

export const CreateIssueRequestSchema = CreateCatalogIssueRequestSchema;

export const UpdateIssueReceiverSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    universityId: z
      .string()
      .trim()
      .max(64)
      .optional()
      .nullable()
      .transform((value) => value || null),
    type: ReceiverTypeSchema,
    department: z
      .string()
      .trim()
      .max(120)
      .optional()
      .nullable()
      .transform((value) => value || null),
    contact: z.string().trim().min(3).max(40),
    email: z.string().trim().toLowerCase().email().max(254),
  })
  .strict();

export const UpdateIssueRequestSchema = z
  .object({
    receiver: UpdateIssueReceiverSchema.optional(),
    purpose: z
      .string()
      .trim()
      .min(1)
      .max(240)
      .optional()
      .nullable()
      .transform((value) => value || null),
    notes: z
      .string()
      .trim()
      .min(1)
      .max(2_000)
      .optional()
      .nullable()
      .transform((value) => value || null),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update.');

export const IssueReceiverSnapshotSchema = z
  .object({
    receiverCode: ReceiverCodeSchema,
    fullName: z.string().min(1),
    universityId: z.string().nullable(),
    type: ReceiverTypeSchema,
    department: z.string().nullable(),
    contact: z.string().min(1),
    email: z.string().email(),
  })
  .strict();

export const IssueActorSnapshotSchema = z
  .object({
    userId: z.string().min(1),
    workerId: WorkerIdSchema,
    name: z.string().min(1),
    role: UserRoleSchema,
  })
  .strict();

export const IssueMaterialSnapshotSchema = z
  .object({
    materialCode: MaterialCodeSchema,
    name: z.string().min(1),
    category: z.string().min(1),
    description: z.string().nullable().optional(),
    source: z.literal('CATALOG').default('CATALOG'),
    trackingMode: TrackingModeSchema,
    returnPolicy: ReturnPolicySchema,
    unitLabel: z.string().nullable(),
  })
  .strict();

export const ReturnDispositionSchema = z.enum([
  'AVAILABLE',
  'RETURNED',
  'UNDER_REPAIR',
  'DAMAGED',
  'LOST',
  'SCRAPPED',
]);

export const IssueAssetSchema = z
  .object({
    assetTag: AssetTagSchema,
    serialNumber: z.string().nullable(),
    conditionAtIssue: z.string().min(1),
    outstanding: z.boolean(),
    returnDisposition: ReturnDispositionSchema.nullable(),
    returnedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict()
  .superRefine((asset, context) => {
    const hasDisposition = asset.returnDisposition !== null;
    const hasReturnTime = asset.returnedAt !== null;
    const invalidOutstandingEvidence = asset.outstanding && (hasDisposition || hasReturnTime);
    const incompleteReturnedEvidence = !asset.outstanding && (!hasDisposition || !hasReturnTime);
    if (invalidOutstandingEvidence || incompleteReturnedEvidence) {
      context.addIssue({
        code: 'custom',
        path: ['outstanding'],
        message: asset.outstanding
          ? 'An outstanding asset cannot have return evidence.'
          : 'A returned asset requires disposition and return time.',
      });
    }
  });

export const IssueLineSchema = z
  .object({
    lineId: LineIdSchema,
    material: IssueMaterialSnapshotSchema,
    issuedQuantity: z.number().int().positive(),
    outstandingQuantity: z.number().int().nonnegative(),
    assets: z.array(IssueAssetSchema),
  })
  .strict();

export const CreateReturnQuantityItemSchema = z
  .object({
    trackingMode: z.literal('QUANTITY'),
    lineId: LineIdSchema,
    quantity: z.number().int().positive().max(1_000_000),
  })
  .strict();

export const CreateReturnSerializedItemSchema = z
  .object({
    trackingMode: z.literal('SERIALIZED'),
    lineId: LineIdSchema,
    assetTag: AssetTagSchema,
    disposition: ReturnDispositionSchema,
    condition: z.string().trim().min(1).max(120),
  })
  .strict();

export const CreateReturnItemSchema = z.discriminatedUnion('trackingMode', [
  CreateReturnQuantityItemSchema,
  CreateReturnSerializedItemSchema,
]);

export const CreateReturnRequestSchema = z
  .object({
    items: z.array(CreateReturnItemSchema).min(1).max(100),
    notes: OptionalNotesSchema,
  })
  .strict()
  .superRefine((request, context) => {
    const quantityLineIds = request.items
      .filter((item) => item.trackingMode === 'QUANTITY')
      .map((item) => item.lineId);
    if (new Set(quantityLineIds).size !== quantityLineIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['items'],
        message: 'A quantity line can appear only once.',
      });
    }
    const serializedItems = request.items.filter((item) => item.trackingMode === 'SERIALIZED');
    const assetTags = serializedItems.map((item) => item.assetTag);
    if (new Set(assetTags).size !== assetTags.length) {
      context.addIssue({
        code: 'custom',
        path: ['items'],
        message: 'An asset tag can appear only once.',
      });
    }
    const serializedLineIds = new Set(serializedItems.map((item) => item.lineId));
    if (quantityLineIds.some((lineId) => serializedLineIds.has(lineId))) {
      context.addIssue({
        code: 'custom',
        path: ['items'],
        message: 'A line cannot mix quantity and serialized return items.',
      });
    }
  });

export const ReturnEventQuantityItemSchema = z
  .object({
    trackingMode: z.literal('QUANTITY'),
    lineId: LineIdSchema,
    materialCode: MaterialCodeSchema,
    materialName: z.string().min(1),
    quantity: z.number().int().positive(),
  })
  .strict();

export const ReturnEventSerializedItemSchema = z
  .object({
    trackingMode: z.literal('SERIALIZED'),
    lineId: LineIdSchema,
    materialCode: MaterialCodeSchema,
    materialName: z.string().min(1),
    assetTag: AssetTagSchema,
    serialNumber: z.string().nullable(),
    disposition: ReturnDispositionSchema,
    condition: z.string().min(1),
  })
  .strict();

export const ReturnEventItemSchema = z.discriminatedUnion('trackingMode', [
  ReturnEventQuantityItemSchema,
  ReturnEventSerializedItemSchema,
]);

export const ReturnEventSchema = z
  .object({
    returnEventId: z.string().uuid(),
    issueId: IssueIdSchema,
    returnedAt: z.string().datetime({ offset: true }),
    performedBy: IssueActorSnapshotSchema,
    items: z.array(ReturnEventItemSchema).min(1),
    notes: z.string().nullable(),
    remainingOutstandingQuantity: z.number().int().nonnegative(),
    resultingIssueStatus: IssueStatusSchema,
    completedIssue: z.boolean(),
  })
  .strict();

const IssueBaseSchema = z
  .object({
    id: z.string().min(1),
    issueId: IssueIdSchema,
    receiver: IssueReceiverSnapshotSchema,
    issuedBy: IssueActorSnapshotSchema,
    issuedAt: z.string().datetime({ offset: true }),
    expectedReturnAt: z.string().datetime({ offset: true }).nullable(),
    duePreset: DuePresetSchema.nullable(),
    assignmentType: AssignmentTypeSchema.default('SHORT_TERM'),
    status: IssueStatusSchema,
    purpose: z.string().nullable(),
    notes: z.string().nullable(),
    lines: z.array(IssueLineSchema).min(1),
    returnEvents: z.array(ReturnEventSchema),
    totalIssuedQuantity: z.number().int().positive(),
    totalOutstandingQuantity: z.number().int().nonnegative(),
    hasDamagedOutcome: z.boolean(),
    hasLostOutcome: z.boolean(),
    reminderCount: z.number().int().nonnegative().default(0),
    lastReminderAt: z.string().datetime({ offset: true }).nullable().default(null),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const IssueSchema = IssueBaseSchema.superRefine((issue, context) => {
  const totalIssued = issue.lines.reduce((sum, line) => sum + line.issuedQuantity, 0);
  const totalOutstanding = issue.lines.reduce((sum, line) => sum + line.outstandingQuantity, 0);
  if (issue.totalIssuedQuantity !== totalIssued) {
    context.addIssue({
      code: 'custom',
      path: ['totalIssuedQuantity'],
      message: 'Total issued quantity must equal the line total.',
    });
  }
  if (issue.totalOutstandingQuantity !== totalOutstanding) {
    context.addIssue({
      code: 'custom',
      path: ['totalOutstandingQuantity'],
      message: 'Total outstanding quantity must equal the line total.',
    });
  }
  for (const [index, line] of issue.lines.entries()) {
    if (line.outstandingQuantity > line.issuedQuantity) {
      context.addIssue({
        code: 'custom',
        path: ['lines', index, 'outstandingQuantity'],
        message: 'Outstanding quantity cannot exceed issued quantity.',
      });
    }
    if (line.material.trackingMode === 'SERIALIZED') {
      if (line.material.returnPolicy !== 'REUSABLE' || line.material.unitLabel !== null) {
        context.addIssue({
          code: 'custom',
          path: ['lines', index, 'material'],
          message: 'Serialized material must be reusable and cannot have a unit label.',
        });
      }
      if (line.assets.length !== line.issuedQuantity) {
        context.addIssue({
          code: 'custom',
          path: ['lines', index, 'assets'],
          message: 'Serialized asset count must equal issued quantity.',
        });
      }
      if (line.assets.filter((asset) => asset.outstanding).length !== line.outstandingQuantity) {
        context.addIssue({
          code: 'custom',
          path: ['lines', index, 'outstandingQuantity'],
          message: 'Serialized outstanding count must match outstanding assets.',
        });
      }
    } else {
      if (line.material.unitLabel === null) {
        context.addIssue({
          code: 'custom',
          path: ['lines', index, 'material', 'unitLabel'],
          message: 'Quantity-tracked material requires a unit label.',
        });
      }
      if (line.assets.length > 0) {
        context.addIssue({
          code: 'custom',
          path: ['lines', index, 'assets'],
          message: 'Quantity-tracked lines cannot contain serialized assets.',
        });
      }
    }
    if (line.material.returnPolicy === 'CONSUMABLE' && line.outstandingQuantity !== 0) {
      context.addIssue({
        code: 'custom',
        path: ['lines', index, 'outstandingQuantity'],
        message: 'Consumable material cannot remain outstanding.',
      });
    }
  }
  const hasReusable = issue.lines.some((line) => line.material.returnPolicy === 'REUSABLE');
  const hasExpectedReturn = issue.expectedReturnAt !== null;
  const hasDuePreset = issue.duePreset !== null;
  if (
    (hasReusable && (!hasExpectedReturn || !hasDuePreset)) ||
    (!hasReusable && (hasExpectedReturn || hasDuePreset))
  ) {
    context.addIssue({
      code: 'custom',
      path: ['expectedReturnAt'],
      message: hasReusable
        ? 'Reusable material requires an expected return date and due preset.'
        : 'Consumable-only Issues cannot have a return due date.',
    });
  }
});

export const IssueSummarySchema = IssueBaseSchema.omit({ lines: true, returnEvents: true }).extend({
  materialNames: z.array(z.string().min(1)).min(1),
});

export const IssuePeriodSchema = z.enum(['TODAY']);
export const IssueReturnStateSchema = z.enum([
  'PENDING',
  'DUE_TODAY',
]);

export const ReturnableIssueSchema = z
  .object({
    issueId: IssueIdSchema,
    receiver: IssueReceiverSnapshotSchema,
    issuedBy: IssueActorSnapshotSchema,
    issuedAt: z.string().datetime({ offset: true }),
    expectedReturnAt: z.string().datetime({ offset: true }).nullable(),
    duePreset: DuePresetSchema.nullable(),
    assignmentType: AssignmentTypeSchema.default('SHORT_TERM'),
    status: IssueStatusSchema,
    lines: z.array(IssueLineSchema).min(1),
    totalOutstandingQuantity: z.number().int().positive(),
  })
  .strict();

const PaginationMetaSchema = z
  .object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .strict();

export const CreateIssueResponseSchema = z
  .object({
    data: z.object({ issue: IssueSchema }).strict(),
    meta: z.object({ idempotentReplay: z.boolean() }).strict(),
  })
  .strict();

export const IssueResponseSchema = z.object({ data: z.object({ issue: IssueSchema }).strict() });

export const IssuesListResponseSchema = z
  .object({ data: z.array(IssueSummarySchema), meta: PaginationMetaSchema })
  .strict();

export const IssueDetailResponseSchema = z.discriminatedUnion('accessScope', [
  z
    .object({
      accessScope: z.literal('FULL'),
      data: z.object({ issue: IssueSchema }).strict(),
    })
    .strict(),
  z
    .object({
      accessScope: z.literal('RETURN_ONLY'),
      data: z.object({ issue: ReturnableIssueSchema }).strict(),
    })
    .strict(),
]);

export const ReturnSearchResponseSchema = z
  .object({ data: z.array(ReturnableIssueSchema), meta: PaginationMetaSchema })
  .strict();

export const CreateReturnResponseSchema = z
  .object({
    data: z.object({ issue: IssueSchema, returnEvent: ReturnEventSchema }).strict(),
    meta: z.object({ idempotentReplay: z.boolean() }).strict(),
  })
  .strict();

export const ReturnEventResponseSchema = z
  .object({ data: z.object({ returnEvent: ReturnEventSchema }).strict() })
  .strict();

export const ReturnEventsListResponseSchema = z
  .object({ data: z.array(ReturnEventSchema), meta: PaginationMetaSchema })
  .strict();

export type DuePreset = z.infer<typeof DuePresetSchema>;
export type DueSelection = z.infer<typeof DueSelectionSchema>;
export type CreateIssueRequest = z.infer<typeof CreateIssueRequestSchema>;
export type CreateCatalogIssueRequest = z.infer<typeof CreateCatalogIssueRequestSchema>;
export type UpdateIssueReceiver = z.infer<typeof UpdateIssueReceiverSchema>;
export type UpdateIssueRequest = z.infer<typeof UpdateIssueRequestSchema>;
export type IssueReceiverSnapshot = z.infer<typeof IssueReceiverSnapshotSchema>;
export type IssueActorSnapshot = z.infer<typeof IssueActorSnapshotSchema>;
export type IssueMaterialSnapshot = z.infer<typeof IssueMaterialSnapshotSchema>;
export type ReturnDisposition = z.infer<typeof ReturnDispositionSchema>;
export type IssueAsset = z.infer<typeof IssueAssetSchema>;
export type IssueLine = z.infer<typeof IssueLineSchema>;
export type CreateReturnRequest = z.infer<typeof CreateReturnRequestSchema>;
export type ReturnEventItem = z.infer<typeof ReturnEventItemSchema>;
export type ReturnEvent = z.infer<typeof ReturnEventSchema>;
export type Issue = z.infer<typeof IssueSchema>;
export type IssueSummary = z.infer<typeof IssueSummarySchema>;
export type IssuePeriod = z.infer<typeof IssuePeriodSchema>;
export type IssueReturnState = z.infer<typeof IssueReturnStateSchema>;
export type ReturnableIssue = z.infer<typeof ReturnableIssueSchema>;
export type CreateIssueResponse = z.infer<typeof CreateIssueResponseSchema>;
export type IssueResponse = z.infer<typeof IssueResponseSchema>;
export type IssuesListResponse = z.infer<typeof IssuesListResponseSchema>;
export type IssueDetailResponse = z.infer<typeof IssueDetailResponseSchema>;
export type ReturnSearchResponse = z.infer<typeof ReturnSearchResponseSchema>;
export type CreateReturnResponse = z.infer<typeof CreateReturnResponseSchema>;
export type ReturnEventResponse = z.infer<typeof ReturnEventResponseSchema>;
export type ReturnEventsListResponse = z.infer<typeof ReturnEventsListResponseSchema>;
