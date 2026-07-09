import { createApp } from './app.js';
import { config } from './config.js';
import { disconnectPrisma } from './prisma.js';
import { assertEnv } from './lib/validateEnv.js';
import { logger } from './lib/logger.js';

// Validate configuration before accepting traffic (fails fast in production).
assertEnv();

const app = createApp();

const server = app.listen(config.port, () => {
  logger.info('LeadOS API started', {
    url: `http://localhost:${config.port}`,
    env: config.nodeEnv,
    aiScoring: config.flags.aiScoringEnabled,
  });
});

// Graceful shutdown (BRD §19.4 reliability). On Render/PaaS restarts we stop
// accepting connections and release the DB pool so free-tier connections are
// not leaked.
async function shutdown(signal: string) {
  logger.info('shutdown_started', { signal });
  server.close(async () => {
    await disconnectPrisma();
    logger.info('shutdown_complete');
    process.exit(0);
  });
  // Force-exit if close hangs.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
