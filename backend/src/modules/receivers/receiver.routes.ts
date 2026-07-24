import { Router, type Request } from 'express';
import { z } from 'zod';

import {
  CreateReceiverRequestSchema,
  ReceiverCodeSchema,
  ReceiverStatusSchema,
  ReceiverTypeSchema,
  UpdateReceiverRequestSchema,
  UpdateReceiverStatusRequestSchema,
} from '@assetdesk/contracts';

import { AppError } from '../../middleware/error-handler.js';
import { appendAuditEvent } from '../audit/audit.service.js';
import {
  requireAuth,
  requireCsrf,
  requireFullAccess,
  requirePermission,
  requireRole,
  requireTrustedOrigin,
} from '../auth/auth.middleware.js';
import {
  createReceiver,
  deleteReceiver,
  getReceiver,
  listReceivers,
  updateReceiver,
  updateReceiverStatus,
} from './receiver.service.js';

const OptionalQueryTextSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().trim().min(1).max(120).optional(),
);

const ReceiverListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: OptionalQueryTextSchema,
    status: z.preprocess(
      (value) => (value === '' ? undefined : value),
      ReceiverStatusSchema.optional(),
    ),
    type: z.preprocess(
      (value) => (value === '' ? undefined : value),
      ReceiverTypeSchema.optional(),
    ),
    department: OptionalQueryTextSchema,
  })
  .strict();

function receiverCode(request: Request): string {
  return ReceiverCodeSchema.parse(request.params.receiverCode);
}

function authenticatedUser(request: Request) {
  if (!request.auth) throw new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
  return request.auth;
}

async function audit(
  request: Request,
  action: string,
  targetId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const actor = authenticatedUser(request);
  await appendAuditEvent({
    requestId: request.requestId,
    actorUserId: actor.userId,
    actorWorkerId: actor.workerId,
    actorRole: actor.role,
    action,
    targetType: 'RECEIVER',
    targetId,
    result: 'SUCCESS',
    ...(metadata ? { metadata } : {}),
  });
}

export function createReceiversRouter(): Router {
  const router = Router();

  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.use(requireAuth, requireFullAccess, requireRole('ADMIN', 'WORKER'));

  router.get('/', async (request, response, next) => {
    try {
      const actor = authenticatedUser(request);
      const input = ReceiverListQuerySchema.parse(request.query);
      const result = await listReceivers({
        page: input.page,
        pageSize: input.pageSize,
        activeOnly: actor.role === 'WORKER',
        ...(input.search ? { search: input.search } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.type ? { type: input.type } : {}),
        ...(input.department ? { department: input.department } : {}),
      });
      response.json({
        data: result.receivers,
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

  router.post(
    '/',
    requireRole('ADMIN', 'WORKER'),
    requirePermission('RECEIVERS_ADD'),
    requireTrustedOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const input = CreateReceiverRequestSchema.parse(request.body);
        const receiver = await createReceiver(input, authenticatedUser(request).userId);
        await audit(request, 'RECEIVER_CREATED', receiver.receiverCode);
        response.status(201).json({ data: { receiver } });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get('/:receiverCode', async (request, response, next) => {
    try {
      const actor = authenticatedUser(request);
      const receiver = await getReceiver(receiverCode(request), actor.role === 'WORKER');
      response.json({ data: { receiver } });
    } catch (error) {
      next(error);
    }
  });

  router.patch(
    '/:receiverCode',
    requireRole('ADMIN', 'WORKER'),
    requirePermission('RECEIVERS_EDIT'),
    requireTrustedOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const code = receiverCode(request);
        const input = UpdateReceiverRequestSchema.parse(request.body);
        const receiver = await updateReceiver(code, input, authenticatedUser(request).userId);
        await audit(request, 'RECEIVER_UPDATED', code, { fields: Object.keys(input) });
        response.json({ data: { receiver } });
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    '/:receiverCode/status',
    requireRole('ADMIN', 'WORKER'),
    requirePermission('RECEIVERS_EDIT'),
    requireTrustedOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const code = receiverCode(request);
        const input = UpdateReceiverStatusRequestSchema.parse(request.body);
        const result = await updateReceiverStatus(
          code,
          input.status,
          authenticatedUser(request).userId,
        );
        await audit(request, 'RECEIVER_STATUS_CHANGED', code, {
          previousStatus: result.previousStatus,
          status: result.receiver.status,
        });
        response.json({ data: { receiver: result.receiver } });
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete(
    '/:receiverCode',
    requireRole('ADMIN', 'WORKER'),
    requirePermission('RECEIVERS_DELETE'),
    requireTrustedOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const code = receiverCode(request);
        const receiver = await deleteReceiver(code);
        await audit(request, 'RECEIVER_DELETED', code, { fullName: receiver.fullName });
        response.status(204).send();
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
