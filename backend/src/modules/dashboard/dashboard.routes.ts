import { Router } from 'express';

import { DashboardRangeSchema } from '@assetdesk/contracts';

import { requireAuth, requireFullAccess, requireRole } from '../auth/auth.middleware.js';
import { getAdminDashboard, getWorkerDashboard } from './dashboard.service.js';

export function createDashboardRouter(): Router {
  const router = Router();
  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    next();
  });
  router.use(requireAuth, requireFullAccess);

  router.get('/admin', requireRole('ADMIN'), async (request, response, next) => {
    try {
      const range = DashboardRangeSchema.parse(request.query.range ?? '30D');
      response.json({ data: await getAdminDashboard(new Date(), range) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/worker', requireRole('WORKER'), async (request, response, next) => {
    try {
      if (!request.auth) return;
      const range = DashboardRangeSchema.parse(request.query.range ?? '30D');
      response.json({
        data: await getWorkerDashboard(
          {
            userId: request.auth.userId,
            permissions: request.auth.permissions,
            dataAccess: request.auth.dataAccess,
          },
          range,
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
