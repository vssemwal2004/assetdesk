import { Router, type Request } from 'express';
import { z } from 'zod';

import { IssueIdSchema } from '@assetdesk/contracts';

import { AppError } from '../../middleware/error-handler.js';
import {
  requireAuth,
  requireCsrf,
  requireFullAccess,
  requireRole,
  requireTrustedOrigin,
} from '../auth/auth.middleware.js';
import {
  fingerprintRequest,
  hashIdempotencyKey,
  idempotencyKeyFromRequest,
} from '../issues/idempotency.js';
import { getIssueDetail } from '../issues/issue.service.js';
import { createReminder, listIssueReminders, listOverdueIssues } from './reminder.service.js';

const ListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().trim().min(1).max(120).optional(),
    ),
  })
  .strict();

function authenticated(request: Request): NonNullable<Request['auth']> {
  if (!request.auth) throw new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
  return request.auth;
}

export function createReminderRouter(): Router {
  const router = Router();
  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    next();
  });

  router.get(
    '/overdue',
    requireAuth,
    requireFullAccess,
    requireRole('ADMIN'),
    async (request, response, next) => {
      try {
        const input = ListQuerySchema.parse(request.query);
        const result = await listOverdueIssues({
          page: input.page,
          pageSize: input.pageSize,
          ...(input.search ? { search: input.search } : {}),
        });
        response.json({
          data: result.issues,
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
    },
  );

  router.get(
    '/issues/:issueId/reminders',
    requireAuth,
    requireFullAccess,
    requireRole('ADMIN', 'WORKER'),
    async (request, response, next) => {
      try {
        const actor = authenticated(request);
        const issueId = IssueIdSchema.parse(request.params.issueId);
        await getIssueDetail(issueId, actor.userId, actor.role);
        response.json({ data: { reminders: await listIssueReminders(issueId) } });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/issues/:issueId/reminders',
    requireAuth,
    requireFullAccess,
    requireRole('ADMIN'),
    requireTrustedOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const actor = authenticated(request);
        const issueId = IssueIdSchema.parse(request.params.issueId);
        const key = idempotencyKeyFromRequest(request);
        const result = await createReminder(
          issueId,
          {
            userId: actor.userId,
            workerId: actor.workerId,
            role: actor.role,
            requestId: request.requestId,
          },
          hashIdempotencyKey(key),
          fingerprintRequest({
            operation: 'RETURN_REMINDER_V1',
            issueId,
            actorUserId: actor.userId,
          }),
        );
        response.status(result.idempotentReplay ? 200 : 201).json({
          data: { reminder: result.reminder },
          meta: { idempotentReplay: result.idempotentReplay },
        });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
