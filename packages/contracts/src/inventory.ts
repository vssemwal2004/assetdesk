import { z } from 'zod';

import {
  AssetUnitStatusSchema,
  AssignmentTypeSchema,
  ReturnPolicySchema,
  TrackingModeSchema,
} from './domain.js';
import { AssetTagSchema, MaterialCodeSchema } from './identifiers.js';

const NameSchema = z.string().trim().min(2).max(120);
const MaterialDisplayNameSchema = z.string().trim().min(2).max(241);
const CategorySchema = z.string().trim().min(2).max(120);
const DescriptionSchema = z.string().trim().max(1_000);
const AssetTypeNameSchema = z.string().trim().min(2).max(120);
const LocationBlockSchema = z.string().trim().min(1).max(120);
const LocationSchema = z.string().trim().min(1).max(120);
const BlockSchema = z.string().trim().min(1).max(120);
const DepartmentSchema = z.string().trim().min(1).max(120);
const VendorNameSchema = z.string().trim().max(120);
const UnitLabelSchema = z.string().trim().min(1).max(40);
const ConditionSchema = z.string().trim().min(1).max(120);
const SerialNumberSchema = z.string().trim().min(1).max(120);
const ConfigurationSchema = z.string().trim().min(1).max(1_000);

export const MaterialStatusSchema = z.enum([
  'ACTIVE',
  'UNDER_MAINTENANCE',
  'SCRAP',
  'NOT_IN_USE',
  'ARCHIVED',
]);
export type MaterialStatus = z.infer<typeof MaterialStatusSchema>;

const CreateMaterialBaseSchema = z.object({
  name: MaterialDisplayNameSchema,
  category: CategorySchema,
  typeModelName: NameSchema,
  location: LocationSchema,
  block: BlockSchema,
  department: DepartmentSchema.optional(),
  vendorName: VendorNameSchema.optional(),
  locationBlock: LocationBlockSchema.optional(),
  description: DescriptionSchema.optional(),
  status: MaterialStatusSchema.exclude(['ARCHIVED']).default('ACTIVE'),
  assignmentTypes: z.array(AssignmentTypeSchema).min(1).max(2),
});

export const CreateMaterialRequestSchema = z.discriminatedUnion('trackingMode', [
  CreateMaterialBaseSchema.extend({
    trackingMode: z.literal('SERIALIZED'),
    returnPolicy: z.literal('REUSABLE'),
    configuration: ConfigurationSchema,
    serialNumbers: z
      .array(SerialNumberSchema)
      .min(1)
      .max(1_000)
      .refine(
        (values) =>
          new Set(values.map((value) => value.toLocaleUpperCase('en-US'))).size === values.length,
        'Serial numbers must be unique.',
      ),
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
    typeModelName: NameSchema.optional(),
    configuration: ConfigurationSchema.optional(),
    location: LocationSchema.optional(),
    block: BlockSchema.optional(),
    department: DepartmentSchema.optional(),
    vendorName: VendorNameSchema.nullable().optional(),
    locationBlock: LocationBlockSchema.optional(),
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

export const BulkUpdateMaterialStatusRequestSchema = z
  .object({
    materialCodes: z.array(MaterialCodeSchema).min(1).max(1_000),
    status: MaterialStatusSchema,
  })
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
    serialNumber: SerialNumberSchema,
    condition: ConditionSchema.default('Good'),
  })
  .strict();

export const ManualAssetUnitStatusSchema = AssetUnitStatusSchema.exclude(['ISSUED', 'OUTSIDE']);

export const UpdateAssetUnitRequestSchema = z
  .object({
    serialNumber: SerialNumberSchema.optional(),
    condition: ConditionSchema.optional(),
    status: ManualAssetUnitStatusSchema.optional(),
    reason: z.string().trim().min(5).max(500).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

export const MaterialSchema = z
  .object({
    id: z.string().min(1),
    materialCode: MaterialCodeSchema,
    name: z.string().min(1),
    category: z.string().min(1),
    typeModelName: z.string().nullable().optional().default(null),
    configuration: z.string().nullable().optional(),
    location: z.string().nullable().optional().default(null),
    block: z.string().nullable().optional().default(null),
    department: z.string().nullable().optional().default(null),
    vendorName: z.string().nullable().optional().default(null),
    locationBlock: z.string().nullable().optional().default(null),
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

export const AssetTypeSchema = z.object({
  id: z.string().min(1),
  name: AssetTypeNameSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const AssetTypesResponseSchema = z.object({ data: z.array(AssetTypeSchema) });
export const CreateAssetTypeRequestSchema = z.object({ name: AssetTypeNameSchema }).strict();
export const InventoryModelSchema = z.object({
  id: z.string().min(1),
  category: CategorySchema,
  name: NameSchema,
  trackingMode: TrackingModeSchema,
  aliases: z.array(z.string()),
  materialCount: z.number().int().nonnegative(),
  totalQuantity: z.number().int().nonnegative(),
  availableQuantity: z.number().int().nonnegative(),
  issuedQuantity: z.number().int().nonnegative(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export const InventoryModelsResponseSchema = z.object({ data: z.array(InventoryModelSchema) });
export const InventoryModelResponseSchema = z.object({
  data: z.object({ model: InventoryModelSchema }),
});
export const CreateInventoryModelRequestSchema = z
  .object({ category: CategorySchema, name: NameSchema, trackingMode: TrackingModeSchema })
  .strict();
export const MergeInventoryModelsRequestSchema = z
  .object({ modelIds: z.array(z.string().min(1)).min(2).max(200), canonicalName: NameSchema })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.modelIds).size !== value.modelIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['modelIds'],
        message: 'Choose at least two different models to merge.',
      });
    }
  });
export const UpdateInventoryModelRequestSchema = z.object({ name: NameSchema }).strict();
export const InventoryModelMutationResponseSchema = z.object({
  data: z.object({
    model: InventoryModelSchema,
    mergedMaterialCount: z.number().int().nonnegative(),
  }),
});
export const AssetDetailKindSchema = z.enum([
  'ASSET_TYPE',
  'CONSUMABLE_TYPE',
  'LOCATION',
  'BLOCK',
  'STORE',
  'DEPARTMENT',
]);
export const AssetDetailSchema = z.object({
  id: z.string().min(1),
  kind: AssetDetailKindSchema,
  name: z.string().trim().min(1).max(120),
  models: z.array(z.string().trim().min(2).max(120)).default([]),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export const AssetDetailsResponseSchema = z.object({ data: z.array(AssetDetailSchema) });
export const CreateAssetDetailRequestSchema = z
  .object({ kind: AssetDetailKindSchema, name: z.string().trim().min(1).max(120) })
  .strict();
export const UpdateAssetDetailRequestSchema = z
  .object({ name: z.string().trim().min(1).max(120) })
  .strict();
export const AssetTypeImportResponseSchema = z.object({
  data: z.object({
    created: z.array(AssetTypeSchema),
    skipped: z.array(z.object({ name: z.string().min(1), reason: z.string().min(1) })),
    failed: z.array(
      z.object({
        rowNumber: z.number().int().positive(),
        name: z.string(),
        reason: z.string().min(1),
      }),
    ),
  }),
});
export const AssetTypeImportPreviewResponseSchema = z.object({
  data: z.object({
    importId: z.string().min(1),
    fileName: z.string().min(1),
    totalRows: z.number().int().nonnegative(),
    validRows: z.number().int().nonnegative(),
    invalidRows: z.number().int().nonnegative(),
    rows: z.array(
      z.object({
        rowNumber: z.number().int().positive(),
        kind: z.string().optional(),
        name: z.string(),
        valid: z.boolean(),
        errors: z.array(z.string()),
      }),
    ),
    expiresAt: z.string().datetime({ offset: true }),
  }),
});

export type CreateMaterialRequest = z.infer<typeof CreateMaterialRequestSchema>;
export type UpdateMaterialRequest = z.infer<typeof UpdateMaterialRequestSchema>;
export type BulkUpdateMaterialStatusRequest = z.infer<typeof BulkUpdateMaterialStatusRequestSchema>;
export type AdjustQuantityRequest = z.infer<typeof AdjustQuantityRequestSchema>;
export type CreateAssetUnitRequest = z.infer<typeof CreateAssetUnitRequestSchema>;
export type UpdateAssetUnitRequest = z.infer<typeof UpdateAssetUnitRequestSchema>;
export type ManualAssetUnitStatus = z.infer<typeof ManualAssetUnitStatusSchema>;
export type Material = z.infer<typeof MaterialSchema>;
export type AssetUnit = z.infer<typeof AssetUnitSchema>;
export type AssetType = z.infer<typeof AssetTypeSchema>;
export type CreateAssetTypeRequest = z.infer<typeof CreateAssetTypeRequestSchema>;
export type InventoryModel = z.infer<typeof InventoryModelSchema>;
export type CreateInventoryModelRequest = z.infer<typeof CreateInventoryModelRequestSchema>;
export type MergeInventoryModelsRequest = z.infer<typeof MergeInventoryModelsRequestSchema>;
export type UpdateInventoryModelRequest = z.infer<typeof UpdateInventoryModelRequestSchema>;
export type AssetDetailKind = z.infer<typeof AssetDetailKindSchema>;
export type AssetDetail = z.infer<typeof AssetDetailSchema>;
export type CreateAssetDetailRequest = z.infer<typeof CreateAssetDetailRequestSchema>;
export type UpdateAssetDetailRequest = z.infer<typeof UpdateAssetDetailRequestSchema>;
export type AssetTypeImportResponse = z.infer<typeof AssetTypeImportResponseSchema>;
export type AssetTypeImportPreviewResponse = z.infer<typeof AssetTypeImportPreviewResponseSchema>;
export type MaterialResponse = z.infer<typeof MaterialResponseSchema>;
export type MaterialsListResponse = z.infer<typeof MaterialsListResponseSchema>;
export type AdjustQuantityResponse = z.infer<typeof AdjustQuantityResponseSchema>;
export type AssetUnitMutationResponse = z.infer<typeof AssetUnitMutationResponseSchema>;
export type AssetUnitsListResponse = z.infer<typeof AssetUnitsListResponseSchema>;
