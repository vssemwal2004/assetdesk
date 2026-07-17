import { Router, type Request } from 'express';

import { IssueIdSchema } from '@assetdesk/contracts';

import { AppError } from '../../middleware/error-handler.js';
import { appendAuditEvent } from '../audit/audit.service.js';
import {
  requireAuth,
  requireCsrf,
  requireFullAccess,
  requireRole,
  requireTrustedOrigin,
} from '../auth/auth.middleware.js';
import { getIssueDetail } from '../issues/issue.service.js';
import { listIssueNotifications, retryNotification } from './notification.service.js';

function authenticated(request: Request): NonNullable<Request['auth']> {
  if (!request.auth) throw new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
  return request.auth;
}

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export function createNotificationRouter(): Router {
  const router = Router();
  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    next();
  });

  router.get(
    '/issues/:issueId/notifications',
    requireAuth,
    requireFullAccess,
    requireRole('ADMIN', 'WORKER'),
    async (request, response, next) => {
      try {
        const actor = authenticated(request);
        const issueId = IssueIdSchema.parse(request.params.issueId);
        await getIssueDetail(issueId, actor.userId, actor.role);
        response.json({ data: { notifications: await listIssueNotifications(issueId) } });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/notifications/:notificationId/retry',
    requireAuth,
    requireFullAccess,
    requireRole('ADMIN'),
    requireTrustedOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const actor = authenticated(request);
        const notification = await retryNotification(routeParam(request.params.notificationId));
        await appendAuditEvent({
          requestId: request.requestId,
          actorUserId: actor.userId,
          actorWorkerId: actor.workerId,
          actorRole: actor.role,
          action: 'NOTIFICATION_RETRY_REQUESTED',
          targetType: 'EMAIL_NOTIFICATION',
          targetId: notification.notificationId,
          result: 'SUCCESS',
          metadata: {
            eventType: notification.eventType,
            recipientRole: notification.recipientRole,
          },
        });
        response.status(201).json({ data: { notification } });
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}
