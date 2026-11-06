import { Router, type Request } from 'express';

import { MarkAlertsReadRequestSchema } from '@assetdesk/contracts';

import { AppError } from '../../middleware/error-handler.js';
import {
  requireAuth,
  requireCsrf,
  requireFullAccess,
  requireTrustedOrigin,
} from '../auth/auth.middleware.js';
import { getAlerts, markAlertsRead } from './alert.service.js';

function authenticated(request: Request): NonNullable<Request['auth']> {
  if (!request.auth) throw new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
  return request.auth;
}

export function createAlertRouter(): Router {
  const router = Router();
  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    next();
  });
  router.use(requireAuth, requireFullAccess);

  router.get('/', async (request, response, next) => {
    try {
      response.json({ data: await getAlerts(authenticated(request)) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/read', requireTrustedOrigin, requireCsrf, async (request, response, next) => {
    try {
      const input = MarkAlertsReadRequestSchema.parse(request.body);
      const marked = await markAlertsRead(authenticated(request), input);
      response.json({ data: { marked } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
