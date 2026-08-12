import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  CartridgeQcRequestSchema,
  CartridgeStatusSchema,
  CreateCartridgesRequestSchema,
  CreateGatePassRequestSchema,
  GateInRequestSchema,
  IssueCartridgeRequestSchema,
  ReturnCartridgeRequestSchema,
} from '@assetdesk/contracts';
import { AppError } from '../../middleware/error-handler.js';
import {
  requireAuth,
  requireCsrf,
  requireFullAccess,
  requirePermission,
  requireTrustedOrigin,
} from '../auth/auth.middleware.js';
import {
  cancelGatePass,
  cartridgeDashboard,
  createCartridges,
  createGatePass,
  gateIn,
  gateOut,
  getCartridge,
  getGatePass,
  issueCartridge,
  listCartridgeActivity,
  listCartridges,
  listGatePasses,
  recordQc,
  returnCartridge,
  verifyGatePass,
} from './cartridge.service.js';

const ListQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  status: CartridgeStatusSchema.optional(),
});
const ActivityQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().max(120).optional(),
  type: z.string().trim().max(40).optional(),
});
function actor(request: Request) {
  if (!request.auth) throw new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
  return {
    userId: request.auth.userId,
    workerId: request.auth.workerId,
    dataScope: request.auth.dataAccess.cartridges,
  };
}
export function createCartridgeRouter(): Router {
  const router = Router();
  router.use(
    (_q, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    },
    requireAuth,
    requireFullAccess,
  );
  router.get('/dashboard', requirePermission('CARTRIDGES_VIEW'), async (req, res, next) => {
    try {
      res.json({ data: await cartridgeDashboard(actor(req)) });
    } catch (e) {
      next(e);
    }
  });
  router.get('/', requirePermission('CARTRIDGES_VIEW'), async (req, res, next) => {
    try {
      const query = ListQuery.parse(req.query);
      res.json(await listCartridges(query, actor(req)));
    } catch (e) {
      next(e);
    }
  });
  router.get('/activity', requirePermission('CARTRIDGES_VIEW'), async (req, res, next) => {
    try {
      res.json(await listCartridgeActivity(ActivityQuery.parse(req.query), actor(req)));
    } catch (e) {
      next(e);
    }
  });
  router.post(
    '/',
    requirePermission('CARTRIDGES_ADD'),
    requireTrustedOrigin,
    requireCsrf,
    async (req, res, next) => {
      try {
        res.status(201).json({
          data: await createCartridges(CreateCartridgesRequestSchema.parse(req.body), actor(req)),
        });
      } catch (e) {
        next(e);
      }
    },
  );
  router.post(
    '/issues',
    requirePermission('CARTRIDGES_ISSUE'),
    requireTrustedOrigin,
    requireCsrf,
    async (req, res, next) => {
      try {
        res.status(201).json({
          data: await issueCartridge(IssueCartridgeRequestSchema.parse(req.body), actor(req)),
        });
      } catch (e) {
        next(e);
      }
    },
  );
  router.post(
    '/returns',
    requirePermission('CARTRIDGES_RETURN'),
    requireTrustedOrigin,
    requireCsrf,
    async (req, res, next) => {
      try {
        res.status(201).json({
          data: await returnCartridge(ReturnCartridgeRequestSchema.parse(req.body), actor(req)),
        });
      } catch (e) {
        next(e);
      }
    },
  );
  router.get(
    '/gate-passes',
    requirePermission('CARTRIDGE_GATE_PASSES_VIEW'),
    async (req, res, next) => {
      try {
        res.json({ data: await listGatePasses(actor(req)) });
      } catch (e) {
        next(e);
      }
    },
  );
  router.post(
    '/gate-passes',
    requirePermission('CARTRIDGE_GATE_PASSES_CREATE'),
    requireTrustedOrigin,
    requireCsrf,
    async (req, res, next) => {
      try {
        res.status(201).json({
          data: await createGatePass(CreateGatePassRequestSchema.parse(req.body), actor(req)),
        });
      } catch (e) {
        next(e);
      }
    },
  );
  router.get(
    '/gate-passes/:id',
    requirePermission('CARTRIDGE_GATE_PASSES_VIEW'),
    async (req, res, next) => {
      try {
        res.json({ data: await getGatePass(String(req.params.id), actor(req)) });
      } catch (e) {
        next(e);
      }
    },
  );
  router.post(
    '/gate-passes/:id/verify',
    requirePermission('CARTRIDGE_GATE_PASSES_VERIFY'),
    requireTrustedOrigin,
    requireCsrf,
    async (req, res, next) => {
      try {
        res.json({ data: await verifyGatePass(String(req.params.id), actor(req)) });
      } catch (e) {
        next(e);
      }
    },
  );
  router.post(
    '/gate-passes/:id/gate-out',
    requirePermission('CARTRIDGE_GATE_OUT'),
    requireTrustedOrigin,
    requireCsrf,
    async (req, res, next) => {
      try {
        res.json({ data: await gateOut(String(req.params.id), actor(req)) });
      } catch (e) {
        next(e);
      }
    },
  );
  router.post(
    '/gate-passes/:id/cancel',
    requirePermission('CARTRIDGE_GATE_PASSES_CREATE'),
    requireTrustedOrigin,
    requireCsrf,
    async (req, res, next) => {
      try {
        res.json({ data: await cancelGatePass(String(req.params.id), actor(req)) });
      } catch (e) {
        next(e);
      }
    },
  );
  router.post(
    '/gate-passes/:id/gate-in',
    requirePermission('CARTRIDGE_GATE_IN'),
    requireTrustedOrigin,
    requireCsrf,
    async (req, res, next) => {
      try {
        const input = GateInRequestSchema.parse(req.body);
        res.json({
          data: await gateIn(
            String(req.params.id),
            input.cartridgeSerialNumbers,
            input.remarks,
            actor(req),
          ),
        });
      } catch (e) {
        next(e);
      }
    },
  );
  router.post(
    '/qc',
    requirePermission('CARTRIDGE_QC'),
    requireTrustedOrigin,
    requireCsrf,
    async (req, res, next) => {
      try {
        res.json({ data: await recordQc(CartridgeQcRequestSchema.parse(req.body), actor(req)) });
      } catch (e) {
        next(e);
      }
    },
  );
  router.get('/:serialNumber', requirePermission('CARTRIDGES_VIEW'), async (req, res, next) => {
    try {
      res.json({ data: await getCartridge(String(req.params.serialNumber), actor(req)) });
    } catch (e) {
      next(e);
    }
  });
  return router;
}
