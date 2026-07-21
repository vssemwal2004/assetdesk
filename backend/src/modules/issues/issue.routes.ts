import { Router, type Request } from 'express';
import { z } from 'zod';

import {
  CreateIssueRequestSchema,
  IssueIdSchema,
  IssuePeriodSchema,
  IssueReturnStateSchema,
  IssueStatusSchema,
  UpdateIssueRequestSchema,
} from '@assetdesk/contracts';

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
} from './idempotency.js';
import {
  createIssue,
  deleteIssue,
  getIssueDetail,
  listIssues,
  searchReturnableIssues,
  updateIssue,
} from './issue.service.js';

const OptionalQueryTextSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().trim().min(1).max(120).optional(),
);

const IssueListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: OptionalQueryTextSchema,
    status: z.preprocess(
      (value) => (value === '' ? undefined : value),
      IssueStatusSchema.optional(),
    ),
    period: z.preprocess(
      (value) => (value === '' ? undefined : value),
      IssuePeriodSchema.optional(),
    ),
    returnState: z.preprocess(
      (value) => (value === '' ? undefined : value),
      IssueReturnStateSchema.optional(),
    ),
  })
  .strict();

const ReturnSearchQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    search: z.string().trim().min(2).max(120),
  })
  .strict();

function authenticated(request: Request): NonNullable<Request['auth']> {
  if (!request.auth) throw new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
  return request.auth;
}

function issueId(request: Request): string {
  return IssueIdSchema.parse(request.params.issueId);
}

function pageMeta(result: { page: number; pageSize: number; total: number; totalPages: number }) {
  return {
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    totalPages: result.totalPages,
  };
}

export function createIssuesRouter(): Router {
  const router = Router();
  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    next();
  });

  router.get(
    '/',
    requireAuth,
    requireFullAccess,
    requireRole('ADMIN', 'WORKER'),
    requirePermission('ISSUES_VIEW'),
    async (request, response, next) => {
      try {
        const actor = authenticated(request);
        const input = IssueListQuerySchema.parse(request.query);
        const result = await listIssues({
          page: input.page,
          pageSize: input.pageSize,
          actorUserId: actor.userId,
          actorRole: actor.role,
          ...(input.search ? { search: input.search } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(input.period ? { period: input.period } : {}),
          ...(input.returnState ? { returnState: input.returnState } : {}),
        });
        response.json({ data: result.issues, meta: pageMeta(result) });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/',
    requireAuth,
    requireFullAccess,
    requireRole('ADMIN', 'WORKER'),
    requirePermission('ASSIGNMENTS_CREATE'),
    requireTrustedOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const actor = authenticated(request);
        const input = CreateIssueRequestSchema.parse(request.body);
        const key = idempotencyKeyFromRequest(request);
        const result = await createIssue(
          input,
          {
            userId: actor.userId,
            workerId: actor.workerId,
            role: actor.role,
            requestId: request.requestId,
          },
          hashIdempotencyKey(key),
          fingerprintRequest(input),
        );
        response.status(result.idempotentReplay ? 200 : 201).json({
          data: { issue: result.issue },
          meta: { idempotentReplay: result.idempotentReplay },
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    '/return-search',
    requireAuth,
    requireFullAccess,
    requireRole('ADMIN', 'WORKER'),
    requirePermission('RETURNS_RECORD'),
    async (request, response, next) => {
      try {
        const actor = authenticated(request);
        const input = ReturnSearchQuerySchema.parse(request.query);
        const result = await searchReturnableIssues({ ...input, actorRole: actor.role });
        response.json({ data: result.issues, meta: pageMeta(result) });
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    '/:issueId',
    requireAuth,
    requireFullAccess,
    requireRole('ADMIN', 'WORKER'),
    requirePermission('ASSIGNMENTS_CREATE'),
    requireTrustedOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const actor = authenticated(request);
        const input = UpdateIssueRequestSchema.parse(request.body);
        const issue = await updateIssue(issueId(request), input, {
          userId: actor.userId,
          workerId: actor.workerId,
          role: actor.role,
          requestId: request.requestId,
        });
        response.json({ data: { issue } });
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete(
    '/:issueId',
    requireAuth,
    requireFullAccess,
    requireRole('ADMIN'),
    requirePermission('ASSIGNMENTS_CREATE'),
    requireTrustedOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const actor = authenticated(request);
        await deleteIssue(issueId(request), {
          userId: actor.userId,
          workerId: actor.workerId,
          role: actor.role,
          requestId: request.requestId,
        });
        response.status(204).send();
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    '/:issueId',
    requireAuth,
    requireFullAccess,
    requireRole('ADMIN', 'WORKER'),
    requirePermission('ISSUES_VIEW'),
    async (request, response, next) => {
      try {
        const actor = authenticated(request);
        const result = await getIssueDetail(issueId(request), actor.userId, actor.role);
        response.json({ accessScope: result.accessScope, data: { issue: result.issue } });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
