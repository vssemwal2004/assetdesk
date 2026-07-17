import { z } from 'zod';

import {
  AssetUnitStatusSchema,
  AssignmentTypeSchema,
  ReturnPolicySchema,
  TrackingModeSchema,
} from './domain.js';
import { AssetTagSchema, MaterialCodeSchema } from './identifiers.js';

const NameSchema = z.string().trim().min(2).max(120);
const CategorySchema = z.string().trim().min(2).max(120);
const DescriptionSchema = z.string().trim().max(1_000);
const UnitLabelSchema = z.string().trim().min(1).max(40);
const ConditionSchema = z.string().trim().min(1).max(120);
const SerialNumberSchema = z.string().trim().min(1).max(120);

export const MaterialStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);
export type MaterialStatus = z.infer<typeof MaterialStatusSchema>;

const CreateMaterialBaseSchema = z.object({
  name: NameSchema,
  category: CategorySchema,
  description: DescriptionSchema.optional(),
  assignmentTypes: z.array(AssignmentTypeSchema).min(1).max(2),
});

export const CreateMaterialRequestSchema = z.discriminatedUnion('trackingMode', [
  CreateMaterialBaseSchema.extend({
    trackingMode: z.literal('SERIALIZED'),
    returnPolicy: z.literal('REUSABLE'),
  }).strict(),
  CreateMaterialBaseSchema.extend({
    trackingMode: z.literal('QUANTITY'),
    returnPolicy: ReturnPolicySchema,
    totalQuantity: z.number().int().min(0).max(1_000_000_000),
    unitLabel: UnitLabelSchema,
  }).strict(),
]);

export const UpdateMaterialRequestSchema = z
  .object({
    name: NameSchema.optional(),
    category: CategorySchema.optional(),
    description: DescriptionSchema.nullable().optional(),
    returnPolicy: ReturnPolicySchema.optional(),
    unitLabel: UnitLabelSchema.optional(),
    assignmentTypes: z.array(AssignmentTypeSchema).min(1).max(2).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

export const UpdateMaterialStatusRequestSchema = z
  .object({ status: MaterialStatusSchema })
  .strict();

export const AdjustQuantityRequestSchema = z
  .object({
    quantityDelta: z.number().int().min(-1_000_000_000).max(1_000_000_000),
    reason: z.string().trim().min(5).max(500),
  })
  .strict()
  .refine((value) => value.quantityDelta !== 0, {
    message: 'Quantity adjustment cannot be zero.',
    path: ['quantityDelta'],
  });

export const CreateAssetUnitRequestSchema = z
  .object({
    serialNumber: SerialNumberSchema.optional(),
    condition: ConditionSchema.default('Good'),
  })
  .strict();

export const ManualAssetUnitStatusSchema = AssetUnitStatusSchema.exclude(['ISSUED']);

export const UpdateAssetUnitRequestSchema = z
  .object({
    serialNumber: SerialNumberSchema.nullable().optional(),
    condition: ConditionSchema.optional(),
    status: ManualAssetUnitStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

export const MaterialSchema = z
  .object({
    id: z.string().min(1),
    materialCode: MaterialCodeSchema,
    name: z.string().min(1),
    category: z.string().min(1),
    description: z.string().nullable(),
    trackingMode: TrackingModeSchema,
    returnPolicy: ReturnPolicySchema,
    status: MaterialStatusSchema,
    totalQuantity: z.number().int().nonnegative(),
    availableQuantity: z.number().int().nonnegative(),
    issuedQuantity: z.number().int().nonnegative(),
    unitLabel: z.string().nullable(),
    assignmentTypes: z.array(AssignmentTypeSchema).min(1).max(2),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .superRefine((material, context) => {
    if (material.availableQuantity > material.totalQuantity) {
      context.addIssue({
        code: 'custom',
        path: ['availableQuantity'],
        message: 'Available quantity cannot exceed total quantity.',
      });
    }
    if (material.trackingMode === 'SERIALIZED') {
      if (material.availableQuantity + material.issuedQuantity > material.totalQuantity) {
        context.addIssue({
          code: 'custom',
          path: ['issuedQuantity'],
          message: 'Available and issued serialized units cannot exceed total units.',
        });
      }
      if (material.returnPolicy !== 'REUSABLE') {
        context.addIssue({
          code: 'custom',
          path: ['returnPolicy'],
          message: 'Serialized material must be reusable.',
        });
      }
      if (material.unitLabel !== null) {
        context.addIssue({
          code: 'custom',
          path: ['unitLabel'],
          message: 'Serialized material cannot have a quantity unit label.',
        });
      }
    } else {
      if (!material.unitLabel) {
        context.addIssue({
          code: 'custom',
          path: ['unitLabel'],
          message: 'Quantity material requires a unit label.',
        });
      }
      if (material.issuedQuantity !== material.totalQuantity - material.availableQuantity) {
        context.addIssue({
          code: 'custom',
          path: ['issuedQuantity'],
          message: 'Issued quantity must equal total minus available quantity.',
        });
      }
    }
  });

export const AssetUnitSchema = z.object({
  id: z.string().min(1),
  assetTag: AssetTagSchema,
  materialCode: MaterialCodeSchema,
  serialNumber: z.string().nullable(),
  condition: z.string().min(1),
  status: AssetUnitStatusSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

const PaginationMetaSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const MaterialResponseSchema = z.object({ data: z.object({ material: MaterialSchema }) });

export const MaterialsListResponseSchema = z.object({
  data: z.array(MaterialSchema),
  meta: PaginationMetaSchema,
});

export const AdjustQuantityResponseSchema = z.object({
  data: z.object({
    material: MaterialSchema,
    adjustment: z.object({
      quantityDelta: z.number().int(),
      reason: z.string().min(1),
      previousTotalQuantity: z.number().int().nonnegative(),
      previousAvailableQuantity: z.number().int().nonnegative(),
    }),
  }),
});

export const AssetUnitMutationResponseSchema = z.object({
  data: z.object({ unit: AssetUnitSchema, material: MaterialSchema }),
});

export const AssetUnitsListResponseSchema = z.object({
  data: z.array(AssetUnitSchema),
  meta: PaginationMetaSchema,
});

export type CreateMaterialRequest = z.infer<typeof CreateMaterialRequestSchema>;
export type UpdateMaterialRequest = z.infer<typeof UpdateMaterialRequestSchema>;
export type AdjustQuantityRequest = z.infer<typeof AdjustQuantityRequestSchema>;
export type CreateAssetUnitRequest = z.infer<typeof CreateAssetUnitRequestSchema>;
export type UpdateAssetUnitRequest = z.infer<typeof UpdateAssetUnitRequestSchema>;
export type ManualAssetUnitStatus = z.infer<typeof ManualAssetUnitStatusSchema>;
export type Material = z.infer<typeof MaterialSchema>;
export type AssetUnit = z.infer<typeof AssetUnitSchema>;
export type MaterialResponse = z.infer<typeof MaterialResponseSchema>;
export type MaterialsListResponse = z.infer<typeof MaterialsListResponseSchema>;
export type AdjustQuantityResponse = z.infer<typeof AdjustQuantityResponseSchema>;
export type AssetUnitMutationResponse = z.infer<typeof AssetUnitMutationResponseSchema>;
export type AssetUnitsListResponse = z.infer<typeof AssetUnitsListResponseSchema>;
