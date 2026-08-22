import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  CreateInventoryGatePassRequestSchema,
  InventoryGatePassStatusSchema,
  RecordInventoryGateInRequestSchema,
  UpdateInventoryGatePassRequestSchema,
} from '@assetdesk/contracts';
import { AppError } from '../../middleware/error-handler.js';
import {
  hasServerPermission,
  requireAuth,
  requireCsrf,
  requireFullAccess,
  requirePermission,
  requireTrustedOrigin,
} from '../auth/auth.middleware.js';
import {
  cancelGatePass,
  createInventoryGatePass,
  getInventoryGatePass,
  listGatePassAssetOptions,
  listGatePassMaterialOptions,
  listInventoryGatePasses,
  recordGateIn,
  recordGateOut,
  updateReadyGatePass,
} from './inventory-gate-pass.service.js';

function actor(request: Request) {
  if (!request.auth) throw new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
  return {
    userId: request.auth.userId,
    workerId: request.auth.workerId,
    role: request.auth.role,
    requestId: request.requestId,
  };
}

function ownerScope(request: Request): string | undefined {
  if (!request.auth) throw new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
  return hasServerPermission(request.auth, 'GATE_PASS_VIEW_ALL') ? undefined : request.auth.userId;
}
const ListSchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    status: z.preprocess(
      (value) => (value === '' ? undefined : value),
      InventoryGatePassStatusSchema.optional(),
    ),
    statuses: z.preprocess(
      (value) =>
        typeof value === 'string'
          ? value
              .split(',')
              .map((entry) => entry.trim())
              .filter(Boolean)
          : value,
      z.array(InventoryGatePassStatusSchema).min(1).max(6).optional(),
    ),
    purpose: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.enum(['ISSUE_PERMANENT', 'ISSUE_RETURNABLE', 'REPAIR', 'OTHER']).optional(),
    ),
    trackingMode: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.enum(['SERIALIZED', 'QUANTITY']).optional(),
    ),
    search: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().trim().max(120).optional(),
    ),
  })
  .strict();
const MaterialOptionsSchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    purpose: z.enum(['REPAIR', 'OTHER']),
    trackingMode: z.enum(['SERIALIZED', 'QUANTITY']),
    conditionType: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.enum(['ANY', 'UNDER_MAINTENANCE', 'FAULTY', 'NOT_WORKING', 'DAMAGED']).optional(),
    ),
    category: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().trim().max(120).optional(),
    ),
    search: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().trim().max(120).optional(),
    ),
  })
  .strict();
const AssetOptionsSchema = z
  .object({
    purpose: z.enum(['REPAIR', 'OTHER']),
    conditionType: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.enum(['ANY', 'UNDER_MAINTENANCE', 'FAULTY', 'NOT_WORKING', 'DAMAGED']).optional(),
    ),
    search: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().trim().max(120).optional(),
    ),
  })
  .strict();

export function createInventoryGatePassRouter(): Router {
  const router = Router();
  router.use(requireAuth, requireFullAccess);
  router.get('/', requirePermission('GATE_PASS_VIEW'), async (req, res, next) => {
    try {
      const input = ListSchema.parse(req.query);
      const ownerUserId = ownerScope(req);
      const result = await listInventoryGatePasses({
        page: input.page,
        pageSize: input.pageSize,
        ...(input.status ? { status: input.status } : {}),
        ...(input.statuses ? { statuses: input.statuses } : {}),
        ...(input.purpose ? { purpose: input.purpose } : {}),
        ...(input.trackingMode ? { trackingMode: input.trackingMode } : {}),
        ...(ownerUserId ? { ownerUserId } : {}),
        ...(input.search ? { search: input.search } : {}),
      });
      res.json({
        data: result.data,
        meta: {
          page: input.page,
          pageSize: input.pageSize,
          total: result.total,
          totalPages: result.totalPages,
        },
      });
    } catch (error) {
      next(error);
    }
  });
  router.get('/export', requirePermission('GATE_PASS_EXPORT'), async (req, res, next) => {
    try {
      const input = ListSchema.parse(req.query);
      const ownerUserId = ownerScope(req);
      const result = await listInventoryGatePasses({
        page: 1,
        pageSize: 10_000,
        ...(input.status ? { status: input.status } : {}),
        ...(input.statuses ? { statuses: input.statuses } : {}),
        ...(input.purpose ? { purpose: input.purpose } : {}),
        ...(input.trackingMode ? { trackingMode: input.trackingMode } : {}),
        ...(ownerUserId ? { ownerUserId } : {}),
        ...(input.search ? { search: input.search } : {}),
      });
      const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
      const header = [
        'Gate Pass Number',
        'Source',
        'Purpose',
        'Status',
        'Material Type',
        'Destination',
        'Carrier',
        'Vehicle Number',
        'Created At',
        'Gate Out At',
        'Expected Gate In',
        'Items',
      ];
      const rows = result.data.map((pass) => [
        pass.gatePassNumber,
        pass.source,
        pass.purpose,
        pass.status,
        pass.materialComposition,
        pass.destination.name,
        pass.carrier.name,
        pass.carrier.vehicleNumber ?? '',
        pass.createdAt,
        pass.gateOut?.at ?? '',
        pass.expectedGateInAt ?? '',
        pass.items
          .map((item) => `${item.materialName} (${item.assetTag ?? item.quantity})`)
          .join('; '),
      ]);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="inventory-gate-passes.csv"');
      res.send(`\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`);
    } catch (error) {
      next(error);
    }
  });
  router.get(
    '/options/materials',
    requirePermission('GATE_PASS_CREATE'),
    async (req, res, next) => {
      try {
        const input = MaterialOptionsSchema.parse(req.query);
        const result = await listGatePassMaterialOptions({
          page: input.page,
          pageSize: input.pageSize,
          purpose: input.purpose,
          trackingMode: input.trackingMode,
          ...(input.conditionType ? { conditionType: input.conditionType } : {}),
          ...(input.category ? { category: input.category } : {}),
          ...(input.search ? { search: input.search } : {}),
        });
        res.json({
          data: result.data,
          meta: {
            page: input.page,
            pageSize: input.pageSize,
            total: result.total,
            totalPages: result.totalPages,
            categories: result.categories,
          },
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.get(
    '/options/materials/:materialCode/assets',
    requirePermission('GATE_PASS_CREATE'),
    async (req, res, next) => {
      try {
        const input = AssetOptionsSchema.parse(req.query);
        const result = await listGatePassAssetOptions({
          materialCode: String(req.params.materialCode),
          purpose: input.purpose,
          ...(input.conditionType ? { conditionType: input.conditionType } : {}),
          ...(input.search ? { search: input.search } : {}),
        });
        res.json({ data: result.data, meta: { total: result.total } });
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    '/',
    requirePermission('GATE_PASS_CREATE'),
    requireTrustedOrigin,
    requireCsrf,
    async (req, res, next) => {
      try {
        const input = CreateInventoryGatePassRequestSchema.parse(req.body);
        if (input.issueId || input.purpose.startsWith('ISSUE_'))
          throw new AppError(
            400,
            'MANUAL_GATE_PASS_PURPOSE_INVALID',
            'Issue Gate Passes are created automatically from the Issue Material workflow.',
          );
        res
          .status(201)
          .json({ data: { gatePass: await createInventoryGatePass(input, actor(req)) } });
      } catch (error) {
        next(error);
      }
    },
  );
  router.get('/:number', requirePermission('GATE_PASS_VIEW'), async (req, res, next) => {
    try {
      res.json({
        data: {
          gatePass: await getInventoryGatePass(String(req.params.number), ownerScope(req)),
        },
      });
    } catch (error) {
      next(error);
    }
  });
  router.patch(
    '/:number',
    requirePermission('GATE_PASS_EDIT_READY'),
    requireTrustedOrigin,
    requireCsrf,
    async (req, res, next) => {
      try {
        res.json({
          data: {
            gatePass: await updateReadyGatePass(
              String(req.params.number),
              UpdateInventoryGatePassRequestSchema.parse(req.body),
              actor(req),
            ),
          },
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    '/:number/gate-out',
    requirePermission('GATE_PASS_GATE_OUT'),
    requireTrustedOrigin,
    requireCsrf,
    async (req, res, next) => {
      try {
        res.json({
          data: { gatePass: await recordGateOut(String(req.params.number), actor(req)) },
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    '/:number/gate-in',
    requirePermission('GATE_PASS_GATE_IN'),
    requireTrustedOrigin,
    requireCsrf,
    async (req, res, next) => {
      try {
        res.json({
          data: {
            gatePass: await recordGateIn(
              String(req.params.number),
              RecordInventoryGateInRequestSchema.parse(req.body),
              actor(req),
            ),
          },
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    '/:number/cancel',
    requirePermission('GATE_PASS_CANCEL'),
    requireTrustedOrigin,
    requireCsrf,
    async (req, res, next) => {
      try {
        const input = z
          .object({ reason: z.string().trim().min(5).max(500) })
          .strict()
          .parse(req.body);
        res.json({
          data: {
            gatePass: await cancelGatePass(String(req.params.number), input.reason, actor(req)),
          },
        });
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}
