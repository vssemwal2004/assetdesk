import { createServer } from 'node:http';

import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDatabase, disconnectDatabase } from './db/mongoose.js';
import { startEmailWorkerLoop } from './modules/notifications/email-worker.service.js';
import { syncAllInventoryModels } from './modules/inventory/inventory-model.service.js';

function databaseRequiredOnStart(): boolean {
  return (
    env.DATABASE_REQUIRED_ON_START ??
    (env.NODE_ENV === 'production' || env.APP_ORIGIN.startsWith('https://'))
  );
}

function startupError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { name: 'UnknownError', message: 'Unknown startup error' };
}

async function start(): Promise<void> {
  let stopEmailWorker: (() => void) | undefined;
  try {
    await connectDatabase();
    const modelSync = await syncAllInventoryModels();
    logger.info(modelSync, 'Inventory Model Master synchronized from existing inventory');
    stopEmailWorker = startEmailWorkerLoop();
  } catch (error) {
    if (databaseRequiredOnStart()) {
      throw error;
    }
    logger.error(
      {
        error: startupError(error),
        readyEndpoint: '/api/v1/health/ready',
      },
      'MongoDB is unavailable; starting API in degraded development mode',
    );
  }

  const app = createApp();
  const server = createServer(app);

  server.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'AssetDesk API listening');
  });

  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Graceful shutdown started');
    stopEmailWorker?.();

    server.close(async (closeError) => {
      if (closeError) {
        logger.error({ error: closeError }, 'HTTP server close failed');
      }

      try {
        await disconnectDatabase();
      } finally {
        process.exit(closeError ? 1 : 0);
      }
    });

    setTimeout(() => {
      logger.error('Graceful shutdown timed out');
      process.exit(1);
    }, 10_000).unref();
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

start().catch((error: unknown) => {
  logger.fatal({ error }, 'AssetDesk API failed to start');
  process.exit(1);
});
