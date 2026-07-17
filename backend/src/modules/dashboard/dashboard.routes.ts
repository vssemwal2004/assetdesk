import { Router } from 'express';

import { requireAuth, requireFullAccess, requireRole } from '../auth/auth.middleware.js';
import { getAdminDashboard } from './dashboard.service.js';

export function createDashboardRouter(): Router {
  const router = Router();
  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    next();
  });
  router.use(requireAuth, requireFullAccess, requireRole('ADMIN'));

  router.get('/admin', async (_request, response, next) => {
    try {
      response.json({ data: await getAdminDashboard() });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
