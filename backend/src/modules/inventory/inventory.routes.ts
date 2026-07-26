import { Router, type Request, type RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';

import {
  AdjustQuantityRequestSchema,
  AssetTagSchema,
  AssetDetailKindSchema,
  AssetUnitStatusSchema,
  CreateAssetDetailRequestSchema,
  CreateAssetTypeRequestSchema,
  CreateAssetUnitRequestSchema,
  CreateMaterialRequestSchema,
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
  updateMaterial,
  updateMaterialStatus,
} from './inventory.service.js';
import {
  commitInventoryImport,
  getInventoryImportPreview,
  previewInventoryImport,
} from './inventory-import.service.js';
import { commitAssetTypeImport, previewAssetTypeImport } from './asset-type-import.service.js';

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
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: OptionalQueryTextSchema,
    issueable: z.preprocess(
      (value) => {
        if (value === 'true' || value === true) return true;
        if (value === 'false' || value === false) return false;
        return undefined;
      },
      z.boolean().optional(),
    ),
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
      z
        .enum(['AVAILABLE', 'LOW_STOCK', 'OUT_OF_STOCK', 'ISSUED', 'FULLY_ISSUED'])
        .optional(),
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
): Promise<void> {
  const actor = authenticated(request);
  await appendAuditEvent({
    requestId: request.requestId,
    actorUserId: actor.userId,
    actorWorkerId: actor.workerId,
    actorRole: actor.role,
    action,
    targetType,
    targetId,
    result: 'SUCCESS',
    ...(metadata ? { metadata } : {}),
  });
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

  router.get('/asset-types', requirePermission('INVENTORY_VIEW'), async (_request, response, next) => {
    try {
      const result = await listAssetTypes();
      response.json({ data: result.assetTypes });
    } catch (error) {
      next(error);
    }
  });

  router.get('/asset-details', requirePermission('INVENTORY_VIEW'), async (request, response, next) => {
    try {
      const kind = request.query.kind
        ? AssetDetailKindSchema.parse(request.query.kind)
        : undefined;
      const result = await listAssetDetails(kind);
      response.json({ data: result.assetDetails });
    } catch (error) {
      next(error);
    }
  });

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
        await audit(request, 'ASSET_TYPE_SAVED', 'ASSET_TYPE', assetType.id, { name: assetType.name });
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
        const detail = await createAssetDetail(input.kind, input.name, authenticated(request).userId);
        if (input.kind === 'ASSET_TYPE') {
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
        const kind = request.body.kind
          ? AssetDetailKindSchema.parse(request.body.kind)
          : undefined;
        const result = await previewAssetTypeImport(request.file, authenticated(request).userId, kind);
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
        const material = await createMaterial(input, authenticated(request).userId);
        await audit(request, 'MATERIAL_CREATED', 'MATERIAL', material.materialCode, {
          trackingMode: material.trackingMode,
          returnPolicy: material.returnPolicy,
          initialQuantity: material.totalQuantity,
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
        const result = await adjustQuantity(code, input);
        await audit(request, 'MATERIAL_QUANTITY_ADJUSTED', 'MATERIAL', code, {
          quantityDelta: input.quantityDelta,
          reason: input.reason,
          previousTotalQuantity: result.adjustment.previousTotalQuantity,
          previousAvailableQuantity: result.adjustment.previousAvailableQuantity,
          totalQuantity: result.material.totalQuantity,
          availableQuantity: result.material.availableQuantity,
        });
        response.json({ data: result });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    '/:materialCode/units',
    async (request, response, next) => {
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
    },
  );

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
