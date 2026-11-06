import { Router, type Request } from 'express';

import { GlobalSearchQuerySchema } from '@assetdesk/contracts';

import { AppError } from '../../middleware/error-handler.js';
import { requireAuth, requireFullAccess } from '../auth/auth.middleware.js';
import { globalSearch } from './search.service.js';

function authenticated(request: Request): NonNullable<Request['auth']> {
  if (!request.auth) throw new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
  return request.auth;
}

export function createSearchRouter(): Router {
  const router = Router();
  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    next();
  });
  router.use(requireAuth, requireFullAccess);

  router.get('/', async (request, response, next) => {
    try {
      const query = GlobalSearchQuerySchema.parse(request.query);
      response.json({ data: await globalSearch(authenticated(request), query) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
