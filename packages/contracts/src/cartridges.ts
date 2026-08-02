import { z } from 'zod';

export const CartridgeStatusSchema = z.enum([
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
]);
export const CartridgeColourSchema = z.enum(['BLACK', 'CYAN', 'MAGENTA', 'YELLOW', 'OTHER']);
export const CartridgeReturnConditionSchema = z.enum([
  'EMPTY',
  'DEFECTIVE',
  'FILLED_UNUSED',
  'DAMAGED',
  'WRONG_MODEL',
]);
export const GatePassStatusSchema = z.enum([
  'DRAFT',
  'AWAITING_VERIFICATION',
  'VERIFIED',
  'GATE_OUT',
  'PARTIALLY_RETURNED',
  'QC_PENDING',
  'CLOSED',
  'CANCELLED',
]);

const Text = z.string().trim().min(1).max(120);
export const CartridgeSchema = z.object({
  id: z.string(),
  serialNumber: Text,
  model: Text,
  colour: CartridgeColourSchema,
  compatiblePrinter: z.string().nullable(),
  location: Text,
  department: Text,
  vendorName: z.string().nullable(),
  status: CartridgeStatusSchema,
  currentHolderName: z.string().nullable(),
  refillCount: z.number().int().nonnegative(),
  notes: z.string().nullable(),
  createdByWorkerId: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const CreateCartridgesRequestSchema = z
  .object({
    model: Text,
    colour: CartridgeColourSchema,
    compatiblePrinter: z.string().trim().max(120).optional(),
    location: Text,
    department: Text,
    vendorName: z.string().trim().max(120).optional(),
    status: z.enum(['FILLED_AVAILABLE', 'EMPTY']).default('FILLED_AVAILABLE'),
    quantity: z.number().int().min(1).max(500),
    serialNumbers: z.array(Text).min(1).max(500),
    notes: z.string().trim().max(500).optional(),
  })
  .superRefine((value, context) => {
    if (value.quantity !== value.serialNumbers.length)
      context.addIssue({
        code: 'custom',
        path: ['serialNumbers'],
        message: 'Quantity must match the number of serial numbers.',
      });
    if (
      new Set(value.serialNumbers.map((item) => item.toUpperCase())).size !==
      value.serialNumbers.length
    )
      context.addIssue({
        code: 'custom',
        path: ['serialNumbers'],
        message: 'Serial numbers must be unique.',
      });
  });
export const IssueCartridgeRequestSchema = z.object({
  serialNumber: Text,
  employeeName: Text,
  employeeId: z.string().trim().max(40).optional(),
  department: z.string().trim().max(120).optional(),
  printerLocation: z.string().trim().max(120).optional(),
  remarks: z.string().trim().max(500).optional(),
});
export const ReturnCartridgeRequestSchema = z.object({
  serialNumber: Text,
  returnedByName: Text,
  condition: CartridgeReturnConditionSchema,
  defectReason: z.string().trim().max(500).optional(),
  remarks: z.string().trim().max(500).optional(),
});
export const CreateGatePassRequestSchema = z.object({
  vendorName: Text,
  personTakingMaterial: Text,
  cartridgeSerialNumbers: z.array(Text).min(1).max(200),
  expectedReturnDate: z.string().datetime().optional(),
  remarks: z.string().trim().max(500).optional(),
  submitForVerification: z.boolean().default(false),
});
export const GateInRequestSchema = z.object({
  cartridgeSerialNumbers: z.array(Text).min(1),
  remarks: z.string().trim().max(500).optional(),
});
export const CartridgeQcRequestSchema = z.object({
  serialNumber: Text,
  result: z.enum(['PASS', 'REFILL_FAILED', 'DAMAGED']),
  remarks: z.string().trim().max(500).optional(),
});
export const CartridgeListResponseSchema = z.object({
  data: z.array(CartridgeSchema),
  meta: z.object({
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

export type CartridgeStatus = z.infer<typeof CartridgeStatusSchema>;
export type Cartridge = z.infer<typeof CartridgeSchema>;
export type CreateCartridgesRequest = z.infer<typeof CreateCartridgesRequestSchema>;
