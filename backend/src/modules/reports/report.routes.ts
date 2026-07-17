import { Router, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import { ExportIssueReportRequestSchema, IssueReportFiltersSchema } from '@assetdesk/contracts';

import { AppError } from '../../middleware/error-handler.js';
import { appendAuditEvent } from '../audit/audit.service.js';
import {
  requireAuth,
  requireCsrf,
  requireFullAccess,
  requireRole,
  requireTrustedOrigin,
} from '../auth/auth.middleware.js';
import { exportIssueReport, previewIssueReport } from './report.service.js';

const PreviewSchema = IssueReportFiltersSchema.extend({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

function authenticated(request: Request): NonNullable<Request['auth']> {
  if (!request.auth) throw new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
  return request.auth;
}

export function createReportRouter(): Router {
  const router = Router();
  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    next();
  });
  router.use(requireAuth, requireFullAccess, requireRole('ADMIN'));

  router.get('/issue-register', async (request, response, next) => {
    try {
      const input = PreviewSchema.parse(request.query);
      const result = await previewIssueReport(input, input.page, input.pageSize);
      response.json({
        data: result.rows,
        meta: {
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
          totalPages: result.totalPages,
          generatedAt: result.generatedAt,
          timezone: 'Asia/Kolkata',
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    '/issue-register/export',
    rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false }),
    requireTrustedOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const actor = authenticated(request);
        const input = ExportIssueReportRequestSchema.parse(request.body);
        const result = await exportIssueReport(input.filters);
        await appendAuditEvent({
          requestId: request.requestId,
          actorUserId: actor.userId,
          actorWorkerId: actor.workerId,
          actorRole: actor.role,
          action: 'REPORT_ISSUE_REGISTER_EXPORTED',
          targetType: 'REPORT',
          targetId: 'ISSUE_REGISTER',
          result: 'SUCCESS',
          metadata: {
            format: input.format,
            rowCount: result.rowCount,
            issuedFrom: input.filters.issuedFrom,
            issuedThrough: input.filters.issuedThrough,
            status: input.filters.status ?? null,
            returnState: input.filters.returnState ?? null,
            hasSearch: Boolean(input.filters.search),
          },
        });
        response
          .status(200)
          .type('text/csv; charset=utf-8')
          .setHeader(
            'Content-Disposition',
            `attachment; filename="assetdesk-issue-register-${input.filters.issuedThrough}.csv"`,
          )
          .send(result.csv);
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}
