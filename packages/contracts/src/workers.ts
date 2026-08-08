import { z } from 'zod';

import { AccountStatusSchema } from './domain.js';
import { WorkerIdSchema } from './identifiers.js';

export const WorkerPermissionSchema = z.enum([
  'DASHBOARD',
  'ISSUES_VIEW',
  'ASSIGNMENTS_CREATE',
  'ISSUES_EDIT',
  'ISSUES_DELETE',
  'ISSUE_SLIPS_VIEW',
  'RETURN_DATES_EXTEND',
  'RETURNS_RECORD',
  'RETURNS_VIEW',
  'INVENTORY_VIEW',
  'INVENTORY_MANAGE',
  'INVENTORY_ADD',
  'INVENTORY_EDIT',
  'INVENTORY_DELETE',
  'INVENTORY_QUANTITY_ADJUST',
  'INVENTORY_MODELS_ADD',
  'INVENTORY_MODELS_MERGE',
  'ASSET_TYPES_MANAGE',
  'ASSET_TYPES_ADD',
  'ASSET_TYPES_DELETE',
  'INVENTORY_IMPORT',
  'INVENTORY_EXPORT',
  'ASSET_UNITS_MANAGE',
  'ASSET_UNITS_ADD',
  'ASSET_UNITS_EDIT',
  'ASSET_UNITS_DELETE',
  'RECEIVERS_VIEW',
  'RECEIVERS_MANAGE',
  'RECEIVERS_ADD',
  'RECEIVERS_EDIT',
  'RECEIVERS_DELETE',
  'REPORTS_VIEW',
  'CARTRIDGES_VIEW',
  'CARTRIDGES_ADD',
  'CARTRIDGES_EDIT',
  'CARTRIDGES_ISSUE',
  'CARTRIDGES_RETURN',
  'CARTRIDGE_GATE_PASSES_VIEW',
  'CARTRIDGE_GATE_PASSES_CREATE',
  'CARTRIDGE_GATE_PASSES_VERIFY',
  'CARTRIDGE_GATE_OUT',
  'CARTRIDGE_GATE_IN',
  'CARTRIDGE_QC',
  'CARTRIDGE_REPORTS_VIEW',
]);

export const WorkerPermissionsSchema = z.array(WorkerPermissionSchema).min(1);
const LEGACY_BROAD_PERMISSIONS = [
  'INVENTORY_MANAGE',
  'ASSET_TYPES_MANAGE',
  'ASSET_UNITS_MANAGE',
  'RECEIVERS_MANAGE',
  'INVENTORY_MODELS_ADD',
  'INVENTORY_MODELS_MERGE',
] satisfies string[];

export const DEFAULT_WORKER_PERMISSIONS = WorkerPermissionSchema.options.filter(
  (permission) => !LEGACY_BROAD_PERMISSIONS.includes(permission),
);

export const WorkerDataScopeSchema = z.enum(['OWN', 'ALL']);
export const WorkerDataAccessSchema = z.object({
  inventory: WorkerDataScopeSchema.default('OWN'),
  issues: WorkerDataScopeSchema.default('OWN'),
  cartridges: WorkerDataScopeSchema.default('OWN'),
});

const OptionalTrimmedTextSchema = z
  .string()
  .trim()
  .max(120)
  .optional()
  .transform((value) => value || undefined);

export const CreateWorkerRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  contact: OptionalTrimmedTextSchema,
  department: OptionalTrimmedTextSchema,
  permissions: WorkerPermissionsSchema,
  dataAccess: WorkerDataAccessSchema.default({
    inventory: 'OWN',
    issues: 'OWN',
    cartridges: 'OWN',
  }),
});

export const UpdateWorkerRequestSchema = CreateWorkerRequestSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'Provide at least one field to update',
);

export const UpdateWorkerAccessRequestSchema = z
  .object({
    permissions: WorkerPermissionsSchema,
    dataAccess: WorkerDataAccessSchema.strict(),
  })
  .strict();

export const UpdateWorkerStatusRequestSchema = z.object({
  status: z.enum(['ACTIVE', 'DISABLED']),
});

export const WorkerSchema = z.object({
  id: z.string().min(1),
  workerId: WorkerIdSchema,
  name: z.string().min(1),
  email: z.string().email(),
  contact: z.string().nullable(),
  department: z.string().nullable(),
  status: AccountStatusSchema,
  invitationStatus: z.enum(['PENDING', 'SENT', 'FAILED']),
  mustChangePassword: z.boolean(),
  permissions: z.array(WorkerPermissionSchema),
  dataAccess: WorkerDataAccessSchema,
  temporaryPasswordExpiresAt: z.string().datetime({ offset: true }).nullable(),
  lastLoginAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
});

export const TemporaryCredentialSchema = z.object({
  workerId: WorkerIdSchema,
  temporaryPassword: z.string().min(20),
  expiresAt: z.string().datetime({ offset: true }),
  deliveryStatus: z.literal('QUEUED'),
});

export const CreateWorkerResponseSchema = z.object({
  data: z.object({
    worker: WorkerSchema,
    credential: TemporaryCredentialSchema,
  }),
});

export const WorkerResponseSchema = z.object({
  data: z.object({
    worker: WorkerSchema,
  }),
});

export const RegenerateWorkerCredentialResponseSchema = CreateWorkerResponseSchema;

export const WorkersListResponseSchema = z.object({
  data: z.array(WorkerSchema),
  meta: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});

export const WorkerImportRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  name: z.string(),
  email: z.string(),
  contact: z.string().optional(),
  department: z.string().optional(),
  valid: z.boolean(),
  errors: z.array(z.string()),
});

export const WorkerImportPreviewResponseSchema = z.object({
  data: z.object({
    importId: z.string().min(1),
    fileName: z.string().min(1),
    totalRows: z.number().int().nonnegative(),
    validRows: z.number().int().nonnegative(),
    invalidRows: z.number().int().nonnegative(),
    rows: z.array(WorkerImportRowSchema),
    expiresAt: z.string().datetime({ offset: true }),
  }),
});

export const WorkerImportCommitResponseSchema = z.object({
  data: z.object({
    importId: z.string().min(1),
    created: z.array(
      z.object({
        worker: WorkerSchema,
        credential: TemporaryCredentialSchema,
      }),
    ),
    failed: z.array(
      z.object({
        rowNumber: z.number().int().positive(),
        email: z.string(),
        reason: z.string(),
      }),
    ),
  }),
});

export type CreateWorkerRequest = z.infer<typeof CreateWorkerRequestSchema>;
export type UpdateWorkerRequest = z.infer<typeof UpdateWorkerRequestSchema>;
export type UpdateWorkerAccessRequest = z.infer<typeof UpdateWorkerAccessRequestSchema>;
export type WorkerPermission = z.infer<typeof WorkerPermissionSchema>;
export type WorkerDataScope = z.infer<typeof WorkerDataScopeSchema>;
export type WorkerDataAccess = z.infer<typeof WorkerDataAccessSchema>;
export type Worker = z.infer<typeof WorkerSchema>;
export type TemporaryCredential = z.infer<typeof TemporaryCredentialSchema>;
export type CreateWorkerResponse = z.infer<typeof CreateWorkerResponseSchema>;
export type WorkerResponse = z.infer<typeof WorkerResponseSchema>;
export type RegenerateWorkerCredentialResponse = z.infer<
  typeof RegenerateWorkerCredentialResponseSchema
>;
export type WorkersListResponse = z.infer<typeof WorkersListResponseSchema>;
export type WorkerImportPreviewResponse = z.infer<typeof WorkerImportPreviewResponseSchema>;
export type WorkerImportCommitResponse = z.infer<typeof WorkerImportCommitResponseSchema>;
