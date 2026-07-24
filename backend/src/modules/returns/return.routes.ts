import { Router, type Request } from 'express';
import { z } from 'zod';

import { CreateReturnRequestSchema, IssueIdSchema, IssuePeriodSchema } from '@assetdesk/contracts';

import { AppError } from '../../middleware/error-handler.js';
import {
  requireAuth,
  requireCsrf,
  requireFullAccess,
  requirePermission,
  requireRole,
  requireTrustedOrigin,
} from '../auth/auth.middleware.js';
import {
  fingerprintRequest,
  hashIdempotencyKey,
  idempotencyKeyFromRequest,
} from '../issues/idempotency.js';
import { getReturnEvent, listReturnEvents, recordReturn } from './return.service.js';

const ReturnEventIdSchema = z.string().uuid();

const OptionalQueryTextSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().trim().min(1).max(120).optional(),
);

const ReturnEventListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: OptionalQueryTextSchema,
    period: z.preprocess(
      (value) => (value === '' ? undefined : value),
      IssuePeriodSchema.optional(),
    ),
  })
  .strict();

function authenticated(request: Request): NonNullable<Request['auth']> {
  if (!request.auth) throw new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
  return request.auth;
}

function issueId(request: Request): string {
  return IssueIdSchema.parse(request.params.issueId);
}

function secureReturnRouter(): Router {
  const router = Router();
  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    next();
  });
  router.use(requireAuth, requireFullAccess, requireRole('ADMIN', 'WORKER'));
  return router;
}

export function createIssueReturnsRouter(): Router {
  const router = Router();
  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    next();
  });

  router.post(
    '/:issueId/returns',
    requireAuth,
    requireFullAccess,
    requireRole('ADMIN', 'WORKER'),
    requirePermission('RETURNS_RECORD'),
    requireTrustedOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const actor = authenticated(request);
        const id = issueId(request);
        const input = CreateReturnRequestSchema.parse(request.body);
        const key = idempotencyKeyFromRequest(request);
        const result = await recordReturn(
          id,
          input,
          {
            userId: actor.userId,
            workerId: actor.workerId,
            role: actor.role,
            requestId: request.requestId,
          },
          {
            keyHash: hashIdempotencyKey(key),
            requestFingerprint: fingerprintRequest({
              operation: 'RETURN_CREATE_V1',
              issueId: id,
              actorUserId: actor.userId,
              payload: input,
            }),
          },
        );
        response.status(result.idempotentReplay ? 200 : 201).json({
          data: { issue: result.issue, returnEvent: result.returnEvent },
          meta: { idempotentReplay: result.idempotentReplay },
        });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}

export function createReturnsRouter(): Router {
  const router = secureReturnRouter();

  router.get('/', requirePermission('RETURNS_VIEW'), async (request, response, next) => {
    try {
      const actor = authenticated(request);
      const query = ReturnEventListQuerySchema.parse(request.query);
      const result = await listReturnEvents({
        page: query.page,
        pageSize: query.pageSize,
        role: actor.role,
        actorUserId: actor.userId,
        ...(query.search ? { search: query.search } : {}),
        ...(query.period ? { period: query.period } : {}),
      });
      response.json({
        data: result.events,
        meta: {
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
          totalPages: result.totalPages,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:returnEventId', requirePermission('RETURNS_VIEW'), async (request, response, next) => {
    try {
      const actor = authenticated(request);
      const returnEventId = ReturnEventIdSchema.parse(request.params.returnEventId);
      const returnEvent = await getReturnEvent(returnEventId, actor.role, actor.userId);
      response.json({ data: { returnEvent } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
