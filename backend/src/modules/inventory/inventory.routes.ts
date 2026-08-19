import { Router, type Request, type RequestHandler } from 'express';
import mongoose, { type ClientSession } from 'mongoose';
import multer from 'multer';
import { z } from 'zod';

import {
  AdjustQuantityRequestSchema,
  AssetTagSchema,
  AssetDetailKindSchema,
  AssetUnitStatusSchema,
  CreateAssetDetailRequestSchema,
  CreateAssetTypeRequestSchema,
  BulkUpdateMaterialStatusRequestSchema,
  CreateAssetUnitRequestSchema,
  CreateMaterialRequestSchema,
  CreateInventoryModelRequestSchema,
  MergeInventoryModelsRequestSchema,
  UpdateInventoryModelRequestSchema,
  UpdateAssetDetailRequestSchema,
  MaterialCodeSchema,
  MaterialStatusSchema,
  ReturnPolicySchema,
  TrackingModeSchema,
  UpdateAssetUnitRequestSchema,
  UpdateMaterialRequestSchema,
  UpdateMaterialStatusRequestSchema,
} from '@assetdesk/contracts';

import { AppError } from '../../middleware/error-handler.js';
import { appendAuditEvent } from '../audit/audit.service.js';
import {
  hasServerPermission,
  requireAuth,
  requireCsrf,
  requireFullAccess,
  requirePermission,
  requireRole,
  requireTrustedOrigin,
} from '../auth/auth.middleware.js';
import {
  adjustQuantity,
  createAssetDetail,
  createAssetType,
  createAssetUnit,
  deleteAssetDetail,
  deleteAssetType,
  deleteAssetUnit,
  createMaterial,
  deleteMaterial,
  exportMaterialsCsv,
  getMaterial,
  listAssetDetails,
  listAssetTypes,
  listAssetUnits,
  listMaterials,
  updateAssetUnit,
  updateAssetDetail,
  updateMaterial,
  updateMaterialStatus,
} from './inventory.service.js';
import {
  commitInventoryImport,
  getInventoryImportPreview,
  previewInventoryImport,
} from './inventory-import.service.js';
import { commitAssetTypeImport, previewAssetTypeImport } from './asset-type-import.service.js';
import { importInventoryModels } from './inventory-model-import.service.js';
import {
  createInventoryModel,
  listInventoryModels,
  syncAllInventoryModels,
  mergeInventoryModels,
  updateInventoryModel,
  deleteInventoryModel,
} from './inventory-model.service.js';

const inventoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1 },
});
const uploadInventoryFile: RequestHandler = (request, _response, next) => {
  inventoryUpload.single('file')(request, _response, (error: unknown) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE')
      return next(
        new AppError(413, 'INVENTORY_IMPORT_TOO_LARGE', 'Upload a file no larger than 5 MB.'),
      );
    return next(
      new AppError(400, 'INVENTORY_IMPORT_UPLOAD_INVALID', 'Upload one CSV or XLSX file.'),
    );
  });
};

const OptionalQueryTextSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().trim().min(1).max(120).optional(),
);

const OptionalDateSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.coerce.date().optional(),
);

const MaterialListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(500).default(20),
    search: OptionalQueryTextSchema,
    issueable: z.preprocess((value) => {
      if (value === 'true' || value === true) return true;
      if (value === 'false' || value === false) return false;
      return undefined;
    }, z.boolean().optional()),
    storeOnly: z.preprocess((value) => value === 'true' || value === true ? true : undefined, z.boolean().optional()),
    status: z.preprocess(
      (value) => (value === '' ? undefined : value),
      MaterialStatusSchema.optional(),
    ),
    trackingMode: z.preprocess(
      (value) => (value === '' ? undefined : value),
      TrackingModeSchema.optional(),
    ),
    returnPolicy: z.preprocess(
      (value) => (value === '' ? undefined : value),
      ReturnPolicySchema.optional(),
    ),
    stockState: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.enum(['AVAILABLE', 'LOW_STOCK', 'OUT_OF_STOCK', 'ISSUED', 'FULLY_ISSUED']).optional(),
    ),
    category: OptionalQueryTextSchema,
    location: OptionalQueryTextSchema,
    block: OptionalQueryTextSchema,
    department: OptionalQueryTextSchema,
    vendorName: OptionalQueryTextSchema,
    createdFrom: OptionalDateSchema,
    createdTo: OptionalDateSchema,
  })
  .strict();

function endOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

const AssetUnitListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: OptionalQueryTextSchema,
    status: z.preprocess(
      (value) => (value === '' ? undefined : value),
      AssetUnitStatusSchema.optional(),
    ),
  })
  .strict();

function materialCode(request: Request): string {
  return MaterialCodeSchema.parse(request.params.materialCode);
}

function assetTag(request: Request): string {
  return AssetTagSchema.parse(request.params.assetTag);
}

function authenticated(request: Request): NonNullable<Request['auth']> {
  if (!request.auth) throw new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
  return request.auth;
}

async function audit(
  request: Request,
  action: string,
  targetType: string,
  targetId: string,
  metadata?: Record<string, unknown>,
  session?: ClientSession,
): Promise<void> {
  const actor = authenticated(request);
  const event: {
    requestId: string;
    actorUserId: string;
    actorWorkerId: string;
    actorRole: 'ADMIN' | 'WORKER';
    action: string;
    targetType: string;
    targetId: string;
    result: 'SUCCESS' | 'DENIED' | 'FAILED';
    metadata?: Record<string, unknown>;
  } = {
    requestId: request.requestId,
    actorUserId: actor.userId,
    actorWorkerId: actor.workerId,
    actorRole: actor.role,
    action,
    targetType,
    targetId,
    result: 'SUCCESS',
    ...(metadata ? { metadata } : {}),
  };
  if (session) {
    await appendAuditEvent(event, { session });
    return;
  }
  await appendAuditEvent(event);
}

async function runInventoryTransaction<T>(
  operation: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const session = await mongoose.startSession();
  let completed = false;
  let result: T;
  try {
    await session.withTransaction(async () => {
      result = await operation(session);
      completed = true;
    });
  } finally {
    await session.endSession();
  }
  if (!completed) throw new Error('Inventory transaction completed without a result.');
  return result!;
}

function pageMeta(result: { page: number; pageSize: number; total: number; totalPages: number }) {
  return {
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    totalPages: result.totalPages,
  };
}

function ensureInventoryListAccess(request: Request, issueable: boolean | undefined): void {
  const actor = authenticated(request);
  const allowed =
    hasServerPermission(actor, 'INVENTORY_VIEW') ||
    (issueable === true && hasServerPermission(actor, 'ASSIGNMENTS_CREATE'));
  if (!allowed) {
    throw new AppError(403, 'PERMISSION_DENIED', 'You do not have access to this feature.');
  }
}

function ensureAssetUnitListAccess(
  request: Request,
  status: z.infer<typeof AssetUnitStatusSchema> | undefined,
): void {
  const actor = authenticated(request);
  const allowed =
    hasServerPermission(actor, 'INVENTORY_VIEW') ||
    (status === 'AVAILABLE' && hasServerPermission(actor, 'ASSIGNMENTS_CREATE'));
  if (!allowed) {
    throw new AppError(403, 'PERMISSION_DENIED', 'You do not have access to this feature.');
  }
}

function ensureAssetDetailsAccess(request: Request): void {
  const actor = authenticated(request);
  const allowed =
    hasServerPermission(actor, 'INVENTORY_VIEW') ||
    hasServerPermission(actor, 'INVENTORY_ADD') ||
    hasServerPermission(actor, 'INVENTORY_IMPORT') ||
    hasServerPermission(actor, 'ASSET_TYPES_ADD') ||
    hasServerPermission(actor, 'INVENTORY_MODELS_ADD');
  if (!allowed) {
    throw new AppError(403, 'PERMISSION_DENIED', 'You do not have access to asset details.');
  }
}

export function createInventoryRouter(): Router {
  const router = Router();

  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    next();
  });
  router.use(requireAuth, requireFullAccess);

  router.get('/', async (request, response, next) => {
    try {
      const input = MaterialListQuerySchema.parse(request.query);
      ensureInventoryListAccess(request, input.issueable);
      const actor = authenticated(request);
      const result = await listMaterials({
        page: input.page,
        pageSize: input.pageSize,
        role: actor.role,
        actorUserId: actor.userId,
        dataScope: actor.dataAccess.inventory,
        ...(input.issueable !== undefined ? { issueable: input.issueable } : {}),
        ...(input.storeOnly !== undefined ? { storeOnly: input.storeOnly } : {}),
        ...(input.search ? { search: input.search } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.trackingMode ? { trackingMode: input.trackingMode } : {}),
        ...(input.returnPolicy ? { returnPolicy: input.returnPolicy } : {}),
        ...(input.stockState ? { stockState: input.stockState } : {}),
        ...(input.category ? { category: input.category } : {}),
        ...(input.location ? { location: input.location } : {}),
        ...(input.block ? { block: input.block } : {}),
        ...(input.department ? { department: input.department } : {}),
        ...(input.vendorName ? { vendorName: input.vendorName } : {}),
        ...(input.createdFrom ? { createdFrom: input.createdFrom } : {}),
        ...(input.createdTo ? { createdTo: endOfDay(input.createdTo) } : {}),
      });
      response.json({ data: result.materials, meta: pageMeta(result) });
    } catch (error) {
      next(error);
    }
  });

  router.get(
    '/asset-types',
    requirePermission('INVENTORY_VIEW'),
    async (_request, response, next) => {
      try {
        const result = await listAssetTypes();
        response.json({ data: result.assetTypes });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    '/asset-details',
    async (request, response, next) => {
      try {
        ensureAssetDetailsAccess(request);
        const kind = request.query.kind
          ? AssetDetailKindSchema.parse(request.query.kind)
          : undefined;
        const result = await listAssetDetails(kind);
        response.json({ data: result.assetDetails });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get('/models', async (request, response, next) => {
    try {
      const actor = authenticated(request);
      if (
        !hasServerPermission(actor, 'INVENTORY_VIEW') &&
        !hasServerPermission(actor, 'INVENTORY_ADD') &&
        !hasServerPermission(actor, 'INVENTORY_IMPORT') &&
        !hasServerPermission(actor, 'INVENTORY_MODELS_ADD') &&
        !hasServerPermission(actor, 'INVENTORY_MODELS_MERGE')
      ) {
        throw new AppError(403, 'PERMISSION_DENIED', 'You do not have access to inventory models.');
      }
      const category =
        typeof request.query.category === 'string' ? request.query.category : undefined;
      const trackingMode = request.query.trackingMode
        ? TrackingModeSchema.parse(request.query.trackingMode)
        : undefined;
      const includeStock = request.query.includeStock === 'true';
      response.json({
        data: await listInventoryModels(category, trackingMode, includeStock, {
          role: actor.role,
          actorUserId: actor.userId,
          dataScope: actor.dataAccess.inventory,
        }),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    '/models',
    requirePermission('INVENTORY_MODELS_ADD'),
    requireTrustedOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const input = CreateInventoryModelRequestSchema.parse(request.body);
        const model = await runInventoryTransaction(async (session) => {
          const created = await createInventoryModel(
            input.category,
            input.name,
            input.trackingMode,
            authenticated(request).userId,
            session,
          );
          await audit(
            request,
            'INVENTORY_MODEL_CREATED',
            'INVENTORY_MODEL',
            created.id,
            {
              category: created.category,
              name: created.name,
            },
            session,
          );
          return created;
        });
        response.status(201).json({ data: { model } });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/models/import',
    requirePermission('INVENTORY_MODELS_ADD'),
    requireTrustedOrigin,
    requireCsrf,
    uploadInventoryFile,
    async (request, response, next) => {
      try {
        if (!request.file)
          throw new AppError(400, 'MODEL_IMPORT_FILE_REQUIRED', 'Choose a CSV or XLSX file.');
        const trackingMode = TrackingModeSchema.parse(request.body.trackingMode);
        const result = await importInventoryModels(
          request.file,
          trackingMode,
          authenticated(request).userId,
        );
        await audit(request, 'INVENTORY_MODELS_IMPORTED', 'INVENTORY_MODEL', 'BULK', {
          created: result.created.length,
          failed: result.failed.length,
          trackingMode,
        });
        response.json({ data: result });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/models/sync',
    requireRole('ADMIN'),
    requireTrustedOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const result = await syncAllInventoryModels();
        await audit(request, 'INVENTORY_MODELS_SYNCED', 'INVENTORY_MODEL', 'ALL', result);
        response.json({ data: result });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/models/merge',
    requirePermission('INVENTORY_MODELS_MERGE'),
    requireTrustedOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const input = MergeInventoryModelsRequestSchema.parse(request.body);
        const result = await runInventoryTransaction(async (session) => {
          const merged = await mergeInventoryModels(
            input.modelIds,
            input.canonicalName,
            authenticated(request).userId,
            session,
          );
          await audit(
            request,
            'INVENTORY_MODELS_MERGED',
            'INVENTORY_MODEL',
            merged.model.id,
            {
              sourceModelIds: input.modelIds,
              canonicalName: merged.model.name,
              mergedMaterialCount: merged.mergedMaterialCount,
            },
            session,
          );
          return merged;
        });
        response.json({ data: result });
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    '/models/:modelId',
    requireRole('ADMIN'),
    requireTrustedOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const input = UpdateInventoryModelRequestSchema.parse(request.body);
        const model = await runInventoryTransaction(async (session) => {
          const updated = await updateInventoryModel(
            String(request.params.modelId),
            input.name,
            session,
          );
          await audit(
            request,
            'INVENTORY_MODEL_UPDATED',
            'INVENTORY_MODEL',
            updated.id,
            {
              name: updated.name,
            },
            session,
          );
          return updated;
        });
        response.json({ data: { model } });
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete(
    '/models/:modelId',
    requireRole('ADMIN'),
    requireTrustedOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const modelId = String(request.params.modelId);
        await runInventoryTransaction(async (session) => {
          await deleteInventoryModel(modelId, session);
          await audit(
            request,
            'INVENTORY_MODEL_DELETED',
            'INVENTORY_MODEL',
            modelId,
            undefined,
            session,
          );
        });
        response.status(204).send();
      } catch (error) {
        next(error);
      }
    },
  );

  router.get('/export', requirePermission('INVENTORY_EXPORT'), async (request, response, next) => {
    try {
      const input = MaterialListQuerySchema.parse(request.query);
      const actor = authenticated(request);
      const csv = await exportMaterialsCsv({
        role: actor.role,
        actorUserId: actor.userId,
        dataScope: actor.dataAccess.inventory,
        ...(input.issueable !== undefined ? { issueable: input.issueable } : {}),
        ...(input.search ? { search: input.search } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.trackingMode ? { trackingMode: input.trackingMode } : {}),
        ...(input.returnPolicy ? { returnPolicy: input.returnPolicy } : {}),
        ...(input.stockState ? { stockState: input.stockState } : {}),
        ...(input.category ? { category: input.category } : {}),
        ...(input.location ? { location: input.location } : {}),
        ...(input.block ? { block: input.block } : {}),
        ...(input.department ? { department: input.department } : {}),
        ...(input.vendorName ? { vendorName: input.vendorName } : {}),
        ...(input.createdFrom ? { createdFrom: input.createdFrom } : {}),
        ...(input.createdTo ? { createdTo: endOfDay(input.createdTo) } : {}),
      });
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader('Content-Disposition', 'attachment; filename="assetdesk-inventory.csv"');
      response.send(`\uFEFF${csv}`);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    '/asset-types',
    requireRole('ADMIN', 'WORKER'),
    requirePermission('ASSET_TYPES_ADD'),
    requireTrustedOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const input = CreateAssetTypeRequestSchema.parse(request.body);
        const assetType = await createAssetType(input.name, authenticated(request).userId);
        await audit(request, 'ASSET_TYPE_SAVED', 'ASSET_TYPE', assetType.id, {
          name: assetType.name,
        });
        response.status(201).json({ data: { assetType } });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/asset-details',
    requireRole('ADMIN', 'WORKER'),
    requirePermission('ASSET_TYPES_ADD'),
    requireTrustedOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const input = CreateAssetDetailRequestSchema.parse(request.body);
        const detail = await createAssetDetail(
          input.kind,
          input.name,
          authenticated(request).userId,
        );
        if (input.kind === 'ASSET_TYPE' || input.kind === 'CONSUMABLE_TYPE') {
          await createAssetType(input.name, authenticated(request).userId);
        }
        await audit(request, 'ASSET_DETAIL_SAVED', 'ASSET_DETAIL', detail.id, {
          kind: detail.kind,
          name: detail.name,
        });
        response.status(201).json({ data: { detail } });
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete(
    '/asset-details/:assetDetailId',
    requireRole('ADMIN', 'WORKER'),
    requirePermission('ASSET_TYPES_DELETE'),
    requireTrustedOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const assetDetailId = z.string().parse(request.params.assetDetailId);
        const detail = await deleteAssetDetail(assetDetailId);
        await audit(request, 'ASSET_DETAIL_DELETED', 'ASSET_DETAIL', detail.id, {
          kind: detail.kind,
          name: detail.name,
        });
        response.status(204).send();
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    '/asset-details/:assetDetailId',
    requireRole('ADMIN', 'WORKER'),
    requirePermission('ASSET_TYPES_ADD'),
    requireTrustedOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const assetDetailId = z.string().parse(request.params.assetDetailId);
        const input = UpdateAssetDetailRequestSchema.parse(request.body);
        const detail = await updateAssetDetail(assetDetailId, input.name);
        await audit(request, 'ASSET_DETAIL_UPDATED', 'ASSET_DETAIL', detail.id, {
          kind: detail.kind,
          name: detail.name,
        });
        response.json({ data: { detail } });
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete(
    '/asset-types/:assetTypeId',
    requireRole('ADMIN', 'WORKER'),
    requirePermission('ASSET_TYPES_DELETE'),
    requireTrustedOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const assetTypeId = z.string().parse(request.params.assetTypeId);
        const assetType = await deleteAssetType(assetTypeId);
        await audit(request, 'ASSET_TYPE_DELETED', 'ASSET_TYPE', assetType.id, {
          name: assetType.name,
        });
        response.status(204).send();
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/asset-types/imports/preview',
    requireRole('ADMIN', 'WORKER'),
    requirePermission('ASSET_TYPES_ADD'),
    requireTrustedOrigin,
    requireCsrf,
    uploadInventoryFile,
    async (request, response, next) => {
      try {
        if (!request.file)
          throw new AppError(400, 'ASSET_TYPE_IMPORT_FILE_REQUIRED', 'Choose a CSV or XLSX file.');
        const kind = request.body.kind ? AssetDetailKindSchema.parse(request.body.kind) : undefined;
        const result = await previewAssetTypeImport(
          request.file,
          authenticated(request).userId,
          kind,
        );
        await audit(request, 'ASSET_TYPE_IMPORT_PREVIEWED', 'ASSET_TYPE_IMPORT', result.importId, {
          validRows: result.validRows,
          invalidRows: result.invalidRows,
        });
        response.status(201).json({ data: result });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/asset-types/imports/:importId/commit',
    requireRole('ADMIN', 'WORKER'),
    requirePermission('ASSET_TYPES_ADD'),
    requireTrustedOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const importId = z.string().parse(request.params.importId);
        const result = await commitAssetTypeImport(importId, authenticated(request).userId);
        await audit(request, 'ASSET_TYPES_IMPORTED', 'ASSET_TYPE_IMPORT', importId, {
          createdCount: result.created.length,
          skippedCount: result.skipped.length,
          failedCount: result.failed.length,
        });
        response.json({ data: result });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/',
    requireRole('ADMIN', 'WORKER'),
    requirePermission('INVENTORY_ADD'),
    requireTrustedOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const input = CreateMaterialRequestSchema.parse(request.body);
        const material = await runInventoryTransaction(async (session) => {
          const created = await createMaterial(input, authenticated(request).userId, session);
          await audit(
            request,
            'MATERIAL_CREATED',
            'MATERIAL',
            created.materialCode,
            {
              trackingMode: created.trackingMode,
              returnPolicy: created.returnPolicy,
              initialQuantity: created.totalQuantity,
            },
            session,
          );
          return created;
        });
        response.status(201).json({ data: { material } });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/imports/preview',
    requireRole('ADMIN', 'WORKER'),
    requirePermission('INVENTORY_IMPORT'),
    requireTrustedOrigin,
    requireCsrf,
    uploadInventoryFile,
    async (request, response, next) => {
      try {
        if (!request.file)
          throw new AppError(400, 'INVENTORY_IMPORT_FILE_REQUIRED', 'Choose a CSV or XLSX file.');
        const mode = TrackingModeSchema.parse(request.body.mode);
        const result = await previewInventoryImport(
          request.file,
          mode,
          authenticated(request).userId,
        );
        await audit(request, 'INVENTORY_IMPORT_PREVIEWED', 'INVENTORY_IMPORT', result.importId, {
          trackingMode: mode,
          validRows: result.validRows,
          invalidRows: result.invalidRows,
        });
        response.status(201).json({ data: result });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    '/imports/:importId',
    requireRole('ADMIN', 'WORKER'),
    requirePermission('INVENTORY_IMPORT'),
    async (request, response, next) => {
      try {
        const importId = z.string().parse(request.params.importId);
        const result = await getInventoryImportPreview(importId, authenticated(request).userId);
        response.json({ data: result });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/imports/:importId/commit',
    requireRole('ADMIN', 'WORKER'),
    requirePermission('INVENTORY_IMPORT'),
    requireTrustedOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const importId = z.string().parse(request.params.importId);
        const result = await commitInventoryImport(importId, authenticated(request).userId);
        await audit(request, 'MATERIALS_IMPORTED', 'INVENTORY_IMPORT', importId, {
          createdCount: result.created.length,
          failedCount: result.failed.length,
        });
        response.json({ data: result });
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    '/bulk-status',
    requireRole('ADMIN', 'WORKER'),
    requirePermission('INVENTORY_EDIT'),
    requireTrustedOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const input = BulkUpdateMaterialStatusRequestSchema.parse(request.body);
        const updated = [];
        const failed: Array<{ materialCode: string; reason: string }> = [];
        for (const code of input.materialCodes) {
          try {
            const result = await updateMaterialStatus(code, input.status);
            updated.push(result.material);
            await audit(request, 'MATERIAL_STATUS_CHANGED', 'MATERIAL', code, {
              previousStatus: result.previousStatus,
              status: result.material.status,
              bulk: true,
            });
          } catch (error) {
            failed.push({
              materialCode: code,
              reason: error instanceof Error ? error.message : 'Status update failed.',
            });
          }
        }
        response.json({ data: { updated, failed } });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    '/:materialCode',
    requirePermission('INVENTORY_VIEW'),
    async (request, response, next) => {
      try {
        const actor = authenticated(request);
        const material = await getMaterial(
          materialCode(request),
          actor.role,
          actor.userId,
          actor.dataAccess.inventory,
        );
        response.json({ data: { material } });
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    '/:materialCode',
    requireRole('ADMIN', 'WORKER'),
    requirePermission('INVENTORY_EDIT'),
    requireTrustedOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const code = materialCode(request);
        const input = UpdateMaterialRequestSchema.parse(request.body);
        const material = await updateMaterial(code, input);
        await audit(request, 'MATERIAL_UPDATED', 'MATERIAL', code, {
          fields: Object.keys(input),
        });
        response.json({ data: { material } });
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    '/:materialCode/status',
    requireRole('ADMIN', 'WORKER'),
    requirePermission('INVENTORY_EDIT'),
    requireTrustedOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const code = materialCode(request);
        const input = UpdateMaterialStatusRequestSchema.parse(request.body);
        const result = await updateMaterialStatus(code, input.status);
        await audit(request, 'MATERIAL_STATUS_CHANGED', 'MATERIAL', code, {
          previousStatus: result.previousStatus,
          status: result.material.status,
        });
        response.json({ data: { material: result.material } });
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete(
    '/:materialCode',
    requireRole('ADMIN', 'WORKER'),
    requirePermission('INVENTORY_DELETE'),
    requireTrustedOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const code = materialCode(request);
        const material = await deleteMaterial(code);
        await audit(request, 'MATERIAL_DELETED', 'MATERIAL', code, {
          name: material.name,
          trackingMode: material.trackingMode,
          totalQuantity: material.totalQuantity,
        });
        response.status(204).send();
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/:materialCode/adjust-quantity',
    requireRole('ADMIN', 'WORKER'),
    requirePermission('INVENTORY_QUANTITY_ADJUST'),
    requireTrustedOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const code = materialCode(request);
        const input = AdjustQuantityRequestSchema.parse(request.body);
        const result = await runInventoryTransaction(async (session) => {
          const adjusted = await adjustQuantity(code, input, session);
          await audit(
            request,
            'MATERIAL_QUANTITY_ADJUSTED',
            'MATERIAL',
            code,
            {
              quantityDelta: input.quantityDelta,
              reason: input.reason,
              previousTotalQuantity: adjusted.adjustment.previousTotalQuantity,
              previousAvailableQuantity: adjusted.adjustment.previousAvailableQuantity,
              totalQuantity: adjusted.material.totalQuantity,
              availableQuantity: adjusted.material.availableQuantity,
            },
            session,
          );
          return adjusted;
        });
        response.json({ data: result });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get('/:materialCode/units', async (request, response, next) => {
    try {
      const query = AssetUnitListQuerySchema.parse(request.query);
      ensureAssetUnitListAccess(request, query.status);
      const actor = authenticated(request);
      const result = await listAssetUnits({
        materialCode: materialCode(request),
        page: query.page,
        pageSize: query.pageSize,
        role: actor.role,
        actorUserId: actor.userId,
        dataScope: actor.dataAccess.inventory,
        ...(query.search ? { search: query.search } : {}),
        ...(query.status ? { status: query.status } : {}),
      });
      response.json({ data: result.units, meta: pageMeta(result) });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    '/:materialCode/units',
    requireRole('ADMIN', 'WORKER'),
    requirePermission('ASSET_UNITS_ADD'),
    requireTrustedOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const code = materialCode(request);
        const input = CreateAssetUnitRequestSchema.parse(request.body);
        const result = await createAssetUnit(code, input, authenticated(request).userId);
        await audit(request, 'ASSET_UNIT_CREATED', 'ASSET_UNIT', result.unit.assetTag, {
          materialCode: code,
          status: result.unit.status,
        });
        response.status(201).json({ data: result });
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    '/:materialCode/units/:assetTag',
    requireRole('ADMIN', 'WORKER'),
    requirePermission('ASSET_UNITS_EDIT'),
    requireTrustedOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const code = materialCode(request);
        const tag = assetTag(request);
        const input = UpdateAssetUnitRequestSchema.parse(request.body);
        const result = await updateAssetUnit(code, tag, input);
        await audit(request, 'ASSET_UNIT_UPDATED', 'ASSET_UNIT', tag, {
          materialCode: code,
          fields: Object.keys(input).filter((field) => field !== 'reason'),
          reason: input.reason,
          previousStatus: result.previousUnit?.status,
          status: result.unit.status,
          previousCondition: result.previousUnit?.condition,
          condition: result.unit.condition,
          previousSerialNumber: result.previousUnit?.serialNumber,
          serialNumber: result.unit.serialNumber,
        });
        response.json({ data: result });
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete(
    '/:materialCode/units/:assetTag',
    requireRole('ADMIN', 'WORKER'),
    requirePermission('ASSET_UNITS_DELETE'),
    requireTrustedOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const code = materialCode(request);
        const tag = assetTag(request);
        const result = await deleteAssetUnit(code, tag);
        await audit(request, 'ASSET_UNIT_DELETED', 'ASSET_UNIT', tag, {
          materialCode: code,
          serialNumber: result.unit.serialNumber,
          status: result.unit.status,
        });
        response.json({ data: { material: result.material, unit: result.unit } });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
