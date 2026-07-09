/**
 * Background worker entrypoint (BRD Phase 14). Run as a separate process:
 *   pnpm --filter @leados/api worker
 *
 * Requires REDIS_URL. In free mode (no Redis) it exits cleanly and the
 * cron-job.org drain handles processing instead.
 */
import { startWorker } from './services/bullmq.js';

startWorker().catch((e) => {
  console.error('[worker] fatal:', e instanceof Error ? e.message : e);
  process.exit(1);
});
