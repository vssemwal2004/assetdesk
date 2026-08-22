import { z } from 'zod';

export const InventoryGatePassPurposeSchema = z.enum([
  'ISSUE_PERMANENT',
  'ISSUE_RETURNABLE',
  'REPAIR',
  'OTHER',
]);
export const InventoryGatePassStatusSchema = z.enum([
  'READY_FOR_OUT',
  'OUTSIDE',
  'PARTIALLY_IN',
  'GATE_IN_COMPLETED',
  'CLOSED_NON_RETURNABLE',
  'CANCELLED',
]);
export const GatePassReturnRequirementSchema = z.enum(['RETURNABLE', 'NON_RETURNABLE']);
export const InventoryGatePassMaterialConditionSchema = z.enum([
  'NOT_WORKING',
  'FAULTY',
  'DAMAGED',
  'UNDER_REPAIR',
  'OTHER',
]);

const DestinationSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    organization: z.string().trim().max(120).optional(),
    address: z.string().trim().max(300).optional(),
    contact: z.string().trim().max(40).optional(),
  })
  .strict();
const CarrierSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    contact: z.string().trim().max(40).optional(),
    vehicleNumber: z.string().trim().max(40).optional(),
  })
  .strict();

export const CreateInventoryGatePassItemSchema = z.discriminatedUnion('trackingMode', [
  z
    .object({
      trackingMode: z.literal('SERIALIZED'),
      materialCode: z.string().min(1),
      assetTag: z.string().min(1),
      returnRequirement: GatePassReturnRequirementSchema.default('RETURNABLE'),
      movementCondition: InventoryGatePassMaterialConditionSchema.optional(),
      faultDescription: z.string().trim().min(2).max(500).optional(),
    })
    .strict(),
  z
    .object({
      trackingMode: z.literal('QUANTITY'),
      materialCode: z.string().min(1),
      quantity: z.number().int().positive().max(1_000_000),
      returnRequirement: GatePassReturnRequirementSchema,
      movementCondition: InventoryGatePassMaterialConditionSchema.optional(),
      faultDescription: z.string().trim().min(2).max(500).optional(),
    })
    .strict(),
]);

export const CreateInventoryGatePassRequestSchema = z
  .object({
    purpose: InventoryGatePassPurposeSchema,
    issueId: z.string().trim().min(1).max(64).optional(),
    destination: DestinationSchema,
    carrier: CarrierSchema,
    items: z.array(CreateInventoryGatePassItemSchema).min(1).max(200),
    expectedGateInAt: z.string().datetime({ offset: true }).optional(),
    remarks: z.string().trim().max(1000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.purpose === 'REPAIR') {
      value.items.forEach((item, index) => {
        if (!item.movementCondition) {
          context.addIssue({
            code: 'custom',
            path: ['items', index, 'movementCondition'],
            message: 'Select the material condition for every repair item.',
          });
        }
        if (!item.faultDescription) {
          context.addIssue({
            code: 'custom',
            path: ['items', index, 'faultDescription'],
            message: 'Describe the fault or repair work for every repair item.',
          });
        }
      });
    }
    value.items.forEach((item, index) => {
      if (item.trackingMode === 'SERIALIZED' && item.returnRequirement !== 'RETURNABLE') {
        context.addIssue({
          code: 'custom',
          path: ['items', index, 'returnRequirement'],
          message: 'IT Assets must be returnable and completed through Gate Pass In.',
        });
      }
    });
  });

export const UpdateInventoryGatePassRequestSchema = z
  .object({
    destination: DestinationSchema.optional(),
    carrier: CarrierSchema.optional(),
    expectedGateInAt: z.string().datetime({ offset: true }).nullable().optional(),
    remarks: z.string().trim().max(1000).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one Gate Pass field.');

export const InventoryGatePassMaterialOptionSchema = z.object({
  materialCode: z.string(),
  name: z.string(),
  category: z.string(),
  model: z.string().nullable(),
  trackingMode: z.enum(['SERIALIZED', 'QUANTITY']),
  returnPolicy: z.enum(['REUSABLE', 'CONSUMABLE']),
  availableQuantity: z.number().int().nonnegative(),
  totalQuantity: z.number().int().nonnegative(),
  unitLabel: z.string().nullable(),
});

export const InventoryGatePassAssetOptionSchema = z.object({
  assetTag: z.string(),
  serialNumber: z.string().nullable(),
  condition: z.string(),
  status: z.enum(['AVAILABLE', 'RETURNED', 'UNDER_REPAIR', 'DAMAGED']),
});

export const InventoryGatePassMaterialOptionsResponseSchema = z.object({
  data: z.array(InventoryGatePassMaterialOptionSchema),
  meta: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
    categories: z.array(z.string()),
  }),
});

export const InventoryGatePassAssetOptionsResponseSchema = z.object({
  data: z.array(InventoryGatePassAssetOptionSchema),
  meta: z.object({ total: z.number().int().nonnegative() }),
});

export const GateInItemRequestSchema = z
  .object({
    itemId: z.string().uuid(),
    quantity: z.number().int().positive(),
    condition: z.string().trim().min(2).max(120),
    outcome: z.enum(['RECEIVED', 'REPAIRED', 'STILL_FAULTY', 'DAMAGED', 'REPLACED']),
    replacementSerialNumber: z.string().trim().max(120).optional(),
    remarks: z.string().trim().max(500).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.outcome === 'REPLACED' && !value.replacementSerialNumber) {
      context.addIssue({
        code: 'custom',
        path: ['replacementSerialNumber'],
        message: 'Enter the replacement serial number.',
      });
    }
  });
export const RecordInventoryGateInRequestSchema = z
  .object({
    items: z.array(GateInItemRequestSchema).min(1).max(200),
    personReturning: z.string().trim().max(120).optional(),
    remarks: z.string().trim().max(1000).optional(),
  })
  .strict();

const ActorSchema = z.object({
  userId: z.string(),
  workerId: z.string(),
  name: z.string(),
  role: z.enum(['ADMIN', 'WORKER']),
});
const GatePassItemSchema = z.object({
  itemId: z.string().uuid(),
  materialId: z.string(),
  materialCode: z.string(),
  materialName: z.string(),
  category: z.string(),
  model: z.string().nullable(),
  trackingMode: z.enum(['SERIALIZED', 'QUANTITY']),
  returnRequirement: GatePassReturnRequirementSchema,
  assetUnitId: z.string().nullable(),
  assetTag: z.string().nullable(),
  serialNumber: z.string().nullable(),
  quantity: z.number().int().positive(),
  unitLabel: z.string().nullable(),
  conditionOut: z.string().nullable(),
  assetStatusOut: z.enum(['AVAILABLE', 'RETURNED', 'UNDER_REPAIR', 'DAMAGED']).nullable(),
  movementCondition: InventoryGatePassMaterialConditionSchema.nullable(),
  faultDescription: z.string().nullable(),
  receivedQuantity: z.number().int().nonnegative(),
  remainingOutsideQuantity: z.number().int().nonnegative(),
});
const MovementSchema = z.object({ at: z.string().datetime({ offset: true }), by: ActorSchema });

export const InventoryGatePassSchema = z.object({
  id: z.string(),
  gatePassNumber: z.string(),
  source: z.enum(['ISSUE', 'MANUAL']),
  purpose: InventoryGatePassPurposeSchema,
  issueId: z.string().nullable(),
  materialComposition: z.enum(['ASSET_ONLY', 'CONSUMABLE_ONLY', 'MIXED']),
  status: InventoryGatePassStatusSchema,
  destination: DestinationSchema,
  carrier: CarrierSchema,
  items: z.array(GatePassItemSchema),
  expectedGateInAt: z.string().datetime({ offset: true }).nullable(),
  remarks: z.string().nullable(),
  createdBy: ActorSchema,
  gateOut: MovementSchema.nullable(),
  gateInEvents: z.array(
    z.object({
      eventId: z.string().uuid(),
      receivedAt: z.string().datetime({ offset: true }),
      receivedBy: ActorSchema,
      personReturning: z.string().nullable(),
      remarks: z.string().nullable(),
      items: z.array(GateInItemRequestSchema),
    }),
  ),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export const InventoryGatePassResponseSchema = z.object({
  data: z.object({ gatePass: InventoryGatePassSchema }),
});
export const InventoryGatePassListResponseSchema = z.object({
  data: z.array(InventoryGatePassSchema),
  meta: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});

export type CreateInventoryGatePassRequest = z.infer<typeof CreateInventoryGatePassRequestSchema>;
export type UpdateInventoryGatePassRequest = z.infer<typeof UpdateInventoryGatePassRequestSchema>;
export type RecordInventoryGateInRequest = z.infer<typeof RecordInventoryGateInRequestSchema>;
export type InventoryGatePass = z.infer<typeof InventoryGatePassSchema>;
export type InventoryGatePassStatus = z.infer<typeof InventoryGatePassStatusSchema>;
export type InventoryGatePassMaterialCondition = z.infer<
  typeof InventoryGatePassMaterialConditionSchema
>;
export type InventoryGatePassMaterialOption = z.infer<typeof InventoryGatePassMaterialOptionSchema>;
export type InventoryGatePassAssetOption = z.infer<typeof InventoryGatePassAssetOptionSchema>;
