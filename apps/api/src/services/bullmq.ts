/**
 * BullMQ queue support (BRD Phase 14, §14.5, §19.3). Activates only when
 * REDIS_URL is configured (e.g. Upstash). When enabled, webhook events are
 * enqueued to a real Redis-backed queue and processed by a dedicated worker
 * with lower latency than the 5-minute cron. When REDIS_URL is empty, the app
 * transparently falls back to the cron/direct-drain free mode.
 */
import { config } from '../config.js';

let _enabled: boolean | null = null;
let queueMod: any = null;
let connection: any = null;
let webhookQueue: any = null;

export function isQueueEnabled(): boolean {
  if (_enabled === null) _enabled = Boolean(config.redisUrl);
  return _enabled;
}

async function ensureLoaded() {
  if (!isQueueEnabled()) return null;
  if (!queueMod) {
    const { Queue } = await import('bullmq');
    const IORedis = (await import('ioredis')).default;
    connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
    webhookQueue = new Queue('webhook-processing', { connection: connection as any });
    queueMod = { Queue };
  }
  return webhookQueue;
}

/** Enqueue a webhook event id for background processing. */
export async function enqueueWebhookEvent(eventId: string): Promise<boolean> {
  const q = await ensureLoaded();
  if (!q) return false;
  await q.add('process', { eventId }, { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 1000, removeOnFail: 5000 });
  return true;
}

/** Start the background worker (called from the worker entrypoint). */
export async function startWorker(): Promise<void> {
  if (!isQueueEnabled()) {
    console.log('[worker] REDIS_URL not set — worker disabled (free cron mode active).');
    return;
  }
  const { Worker } = await import('bullmq');
  const IORedis = (await import('ioredis')).default;
  const conn = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
  const { drainQueues } = await import('./queue.js');

  const worker = new Worker(
    'webhook-processing',
    async (job: any) => {
      // Reuse the same processing logic as the cron drain (single source of truth).
      const result = await drainQueues({ onlyEventId: job.data.eventId });
      return result;
    },
    { connection: conn as any, concurrency: 5 }
  );

  worker.on('completed', (job: any) => console.log(`[worker] job ${job.id} done`));
  worker.on('failed', (job: any, err: Error) => console.error(`[worker] job ${job?.id} failed:`, err.message));
  console.log('[worker] BullMQ worker started on queue "webhook-processing".');
}
