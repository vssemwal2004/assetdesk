import { Router, type Request } from 'express';
import { z } from 'zod';

import {
  AdjustQuantityRequestSchema,
  AssetTagSchema,
  AssetUnitStatusSchema,
  AssignmentTypeSchema,
  CreateAssetUnitRequestSchema,
  CreateMaterialRequestSchema,
  MaterialCodeSchema,
  MaterialStatusSchema,
  ReturnPolicySchema,
  TrackingModeSchema,
  UpdateAssetUnitRequestSchema,
  UpdateMaterialRequestSchema,
  UpdateMaterialStatusRequestSchema,
  type UserRole,
} from '@assetdesk/contracts';

import { AppError } from '../../middleware/error-handler.js';
import { appendAuditEvent } from '../audit/audit.service.js';
import {
  requireAuth,
  requireCsrf,
  requireFullAccess,
  requirePermission,
  requireRole,
  requireTrustedOrigin,
} from '../auth/auth.middleware.js';
import {
  adjustQuantity,
  createAssetUnit,
  createMaterial,
  deleteMaterial,
  getMaterial,
  listAssetUnits,
  listMaterials,
  updateAssetUnit,
  updateMaterial,
  updateMaterialStatus,
} from './inventory.service.js';

const OptionalQueryTextSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().trim().min(1).max(120).optional(),
);

const MaterialListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: OptionalQueryTextSchema,
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
    assignmentType: z.preprocess(
      (value) => (value === '' ? undefined : value),
      AssignmentTypeSchema.optional(),
    ),
    stockState: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.enum(['IN_STOCK', 'OUT_OF_STOCK']).optional(),
    ),
    category: OptionalQueryTextSchema,
  })
  .strict();

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

function authenticatedRole(request: Request): UserRole {
  return authenticated(request).role;
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

export function createInventoryRouter(): Router {
  const router = Router();

  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    next();
  });
  router.use(requireAuth, requireFullAccess);

  router.get('/', requirePermission('INVENTORY_VIEW'), async (request, response, next) => {
    try {
      const input = MaterialListQuerySchema.parse(request.query);
      const result = await listMaterials({
        page: input.page,
        pageSize: input.pageSize,
        role: authenticatedRole(request),
        ...(input.search ? { search: input.search } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.trackingMode ? { trackingMode: input.trackingMode } : {}),
        ...(input.returnPolicy ? { returnPolicy: input.returnPolicy } : {}),
        ...(input.assignmentType ? { assignmentType: input.assignmentType } : {}),
        ...(input.stockState ? { stockState: input.stockState } : {}),
        ...(input.category ? { category: input.category } : {}),
      });
      response.json({ data: result.materials, meta: pageMeta(result) });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    '/',
    requireRole('ADMIN'),
    requirePermission('INVENTORY_MANAGE'),
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

  router.get('/:materialCode', requirePermission('INVENTORY_VIEW'), async (request, response, next) => {
    try {
      const material = await getMaterial(materialCode(request), authenticatedRole(request));
      response.json({ data: { material } });
    } catch (error) {
      next(error);
    }
  });

  router.patch(
    '/:materialCode',
    requireRole('ADMIN'),
    requirePermission('INVENTORY_MANAGE'),
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
    requireRole('ADMIN'),
    requirePermission('INVENTORY_MANAGE'),
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
    requireRole('ADMIN'),
    requirePermission('INVENTORY_MANAGE'),
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
    requireRole('ADMIN'),
    requirePermission('INVENTORY_MANAGE'),
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

  router.get('/:materialCode/units', requirePermission('INVENTORY_VIEW'), async (request, response, next) => {
    try {
      const query = AssetUnitListQuerySchema.parse(request.query);
      const result = await listAssetUnits({
        materialCode: materialCode(request),
        page: query.page,
        pageSize: query.pageSize,
        role: authenticatedRole(request),
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
    requireRole('ADMIN'),
    requirePermission('INVENTORY_MANAGE'),
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
    requireRole('ADMIN'),
    requirePermission('INVENTORY_MANAGE'),
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
          fields: Object.keys(input),
          ...(input.status ? { status: input.status } : {}),
        });
        response.json({ data: result });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
