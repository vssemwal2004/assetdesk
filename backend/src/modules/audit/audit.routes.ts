import { Router } from 'express';
import { z } from 'zod';

import { AuditResultSchema, UserRoleSchema } from '@assetdesk/contracts';

import { requireAuth, requireFullAccess, requireRole } from '../auth/auth.middleware.js';
import { getAuditEvent, listAuditEvents } from './audit-read.service.js';

const DateSchema = z.string().date();
const DAY_MILLISECONDS = 86_400_000;
const MAX_AUDIT_DAYS = 366;

const QuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    from: DateSchema,
    to: DateSchema,
    search: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().trim().min(1).max(120).optional(),
    ),
    action: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().trim().min(1).max(120).optional(),
    ),
    result: z.preprocess(
      (value) => (value === '' ? undefined : value),
      AuditResultSchema.optional(),
    ),
    actorRole: z.preprocess(
      (value) => (value === '' ? undefined : value),
      UserRoleSchema.optional(),
    ),
    actorWorkerId: z.preprocess((value) => (value === '' ? undefined : value), z.string().trim().min(1).max(32).optional()),
  })
  .strict();

function dateRange(from: string, to: string): { from: Date; to: Date } {
  const start = new Date(`${from}T00:00:00+05:30`);
  const through = new Date(`${to}T00:00:00+05:30`);
  const end = new Date(through.getTime() + DAY_MILLISECONDS);
  if (end <= start || end.getTime() - start.getTime() > MAX_AUDIT_DAYS * DAY_MILLISECONDS) {
    throw new z.ZodError([
      {
        code: 'custom',
        path: ['to'],
        message: 'Choose an inclusive date range of at most 366 days.',
      },
    ]);
  }
  return { from: start, to: end };
}

export function createAuditRouter(): Router {
  const router = Router();
  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    next();
  });
  router.use(requireAuth, requireFullAccess, requireRole('ADMIN'));

  router.get('/', async (request, response, next) => {
    try {
      const input = QuerySchema.parse(request.query);
      const range = dateRange(input.from, input.to);
      const result = await listAuditEvents({
        page: input.page,
        pageSize: input.pageSize,
        ...range,
        ...(input.search ? { search: input.search } : {}),
        ...(input.action ? { action: input.action } : {}),
        ...(input.result ? { result: input.result } : {}),
        ...(input.actorRole ? { actorRole: input.actorRole } : {}),
        ...(input.actorWorkerId ? { actorWorkerId: input.actorWorkerId } : {}),
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

  router.get('/:auditEventId', async (request, response, next) => {
    try {
      response.json({
        data: { auditEvent: await getAuditEvent(request.params.auditEventId ?? '') },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
