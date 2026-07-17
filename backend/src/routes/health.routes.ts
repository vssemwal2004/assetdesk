import { Router } from 'express';

import { isDatabaseReady } from '../db/mongoose.js';

const APP_VERSION = '0.1.0';

function timestamp(): string {
  return new Date().toISOString();
}

export function createHealthRouter(): Router {
  const router = Router();

  router.get('/live', (_request, response) => {
    response.json({
      data: {
        status: 'ok',
        service: 'assetdesk-api',
        version: APP_VERSION,
        timestamp: timestamp(),
      },
    });
  });

  router.get('/ready', (request, response) => {
    const databaseReady = isDatabaseReady();

    response.status(databaseReady ? 200 : 503).json({
      data: {
        status: databaseReady ? 'ok' : 'degraded',
        service: 'assetdesk-api',
        version: APP_VERSION,
        timestamp: timestamp(),
        dependencies: {
          database: {
            status: databaseReady ? 'up' : 'down',
          },
        },
      },
      ...(!databaseReady ? { requestId: request.requestId } : {}),
    });
  });

  return router;
}
