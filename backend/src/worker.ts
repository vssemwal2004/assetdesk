import { logger } from './config/logger.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './db/mongoose.js';
import { assertSmtpConfiguration } from './modules/notifications/smtp.provider.js';
import { processNextEmailJob } from './modules/notifications/email-worker.service.js';

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function start(): Promise<void> {
  assertSmtpConfiguration();
  await connectDatabase();

  logger.info('AssetDesk notification worker initialized');

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Background worker shutdown started');
    await disconnectDatabase();
    process.exit(0);
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  while (!shuttingDown) {
    const processed = await processNextEmailJob();
    if (!processed) await pause(env.EMAIL_WORKER_POLL_MS);
  }
}

start().catch((error: unknown) => {
  logger.fatal({ error }, 'AssetDesk background worker failed to start');
  process.exit(1);
});
