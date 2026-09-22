import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { connectDatabase, prisma } from './lib/prisma.js';
import { shutdownQueue } from './lib/queue.js';
import { getDummyHash } from './lib/password.js';
import { describeProvider } from './modules/ai/index.js';
import { purgeExpiredRefreshTokens } from './modules/auth/index.js';
import { startInstagramJobs } from './modules/instagram/index.js';
import { startTaskReminders } from './modules/tasks/index.js';

async function main(): Promise<void> {
  await connectDatabase();
  await getDummyHash(); // precompute so the first unknown-email login isn't faster
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`LeadOS API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
    logger.info(describeProvider());
  });

  const stopReminders = startTaskReminders();
  const stopInstagramJobs = startInstagramJobs();
  const housekeeping = setInterval(
    () => {
      purgeExpiredRefreshTokens().catch((err: unknown) =>
        logger.error({ err }, 'Token cleanup failed'),
      );
    },
    6 * 60 * 60 * 1000,
  );
  housekeeping.unref();

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received, shutting down`);
    stopReminders();
    stopInstagramJobs();
    clearInterval(housekeeping);
    const force = setTimeout(() => process.exit(1), 15_000);
    force.unref();
    server.close(async () => {
      await shutdownQueue();
      await prisma.$disconnect();
      process.exit(0);
    });
    server.closeIdleConnections();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'Failed to start');
  process.exit(1);
});
