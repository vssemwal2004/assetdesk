import cors from 'cors';
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';

import { env } from './config/env.js';
import { isAllowedOrigin } from './config/origins.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFoundHandler } from './middleware/not-found.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createAuditRouter } from './modules/audit/audit.routes.js';
import { createDashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { createInventoryRouter } from './modules/inventory/inventory.routes.js';
import { createIssuesRouter } from './modules/issues/issue.routes.js';
import { createNotificationRouter } from './modules/notifications/notification.routes.js';
import { createReceiversRouter } from './modules/receivers/receiver.routes.js';
import { createReportRouter } from './modules/reports/report.routes.js';
import { createIssueReturnsRouter, createReturnsRouter } from './modules/returns/return.routes.js';
import { createWorkerImportsRouter, createWorkersRouter } from './modules/workers/worker.routes.js';
import { createHealthRouter } from './routes/health.routes.js';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY ? 1 : false);

  app.use(requestIdMiddleware);
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || isAllowedOrigin(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Request-ID', 'Idempotency-Key'],
      exposedHeaders: ['X-Request-ID'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '256kb', strict: true }));
  app.use(cookieParser());

  app.use('/api/v1/health', createHealthRouter());
  app.use('/api/v1/auth', createAuthRouter());
  app.use('/api/v1/audit-events', createAuditRouter());
  app.use('/api/v1/dashboard', createDashboardRouter());
  app.use('/api/v1/inventory', createInventoryRouter());
  app.use('/api/v1/receivers', createReceiversRouter());
  app.use('/api/v1/reports', createReportRouter());
  app.use('/api/v1/issues', createIssueReturnsRouter());
  app.use('/api/v1/issues', createIssuesRouter());
  app.use('/api/v1', createNotificationRouter());
  app.use('/api/v1/returns', createReturnsRouter());
  app.use('/api/v1/workers', createWorkersRouter());
  app.use('/api/v1/worker-imports', createWorkerImportsRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
