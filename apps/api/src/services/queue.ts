/**
 * Queue drain (BRD §14). In free mode there is no paid background worker; a
 * protected cron endpoint drains pending WebhookEvents in small batches
 * (BRD §14.2, §19.2). Processes the "webhook-processing" queue (and, by
 * extension, the simulated instagram-send / whatsapp-send replies via the
 * messaging service). AI scoring / workflow / email / notifications are
 * intentionally skipped in free mode (BRD §14.4).
 *
 * When REDIS_URL/BullMQ is configured later this can be swapped for a real
 * worker; the processing logic (processInbound) stays identical.
 */
import { prisma } from '../prisma.js';
import { processInbound, type InboundPayload } from './webhook-processor.js';
import type { WebhookEvent } from '@prisma/client';

const BATCH_SIZE = 20; // small batch (BRD §19.2 cron batch size controlled)

export interface DrainOptions {
  onlyEventId?: string;
  batchSize?: number;
}

export interface DrainSummary {
  processed: number;
  failed: number;
  skipped: number;
  results: Array<{ eventId: string; status: string; detail?: string }>;
}

export interface EventOutcome {
  status: 'PROCESSED' | 'SKIPPED_DUPLICATE' | 'FAILED';
  detail?: string;
}

/**
 * Process a single WebhookEvent and mark it PROCESSED/FAILED. Shared by the
 * synchronous webhook handler (immediate processing, no delay) and the cron
 * drain (retry safety-net for anything that failed synchronously, or a
 * backlog left over from before this event was added).
 */
export async function processOneEvent(event: WebhookEvent): Promise<EventOutcome> {
  try {
    const payload = JSON.parse(event.payload) as InboundPayload;
    const result = await processInbound(payload, event.isSimulation);

    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { status: 'PROCESSED', processedAt: new Date() },
    });

    if (result.replyStatus === 'SKIPPED_DUPLICATE') {
      return { status: 'SKIPPED_DUPLICATE' };
    }
    return {
      status: 'PROCESSED',
      detail: `lead=${result.leadId} reply=${result.replyStatus} captureState=${result.captureState}`,
    };
  } catch (err) {
    // Failed jobs must not silently disappear (BRD §19.4).
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { status: 'FAILED', processedAt: new Date() },
    });
    return { status: 'FAILED', detail: err instanceof Error ? err.message : String(err) };
  }
}

export async function drainQueues(opts: DrainOptions = {}): Promise<DrainSummary> {
  const take = opts.batchSize ?? BATCH_SIZE;

  const events = opts.onlyEventId
    ? await prisma.webhookEvent.findMany({ where: { id: opts.onlyEventId, status: 'PENDING' } })
    : await prisma.webhookEvent.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        take,
      });

  const summary: DrainSummary = { processed: 0, failed: 0, skipped: 0, results: [] };

  // Time budget so a large backlog can't exceed free-host request timeouts
  // (BRD §19.2). Remaining events are picked up by the next cron tick.
  const startedAt = Date.now();
  const TIME_BUDGET_MS = 25_000;

  for (const event of events) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break;
    const outcome = await processOneEvent(event);
    if (outcome.status === 'SKIPPED_DUPLICATE') summary.skipped++;
    else if (outcome.status === 'PROCESSED') summary.processed++;
    else summary.failed++;
    summary.results.push({ eventId: event.id, status: outcome.status, detail: outcome.detail });
  }

  return summary;
}
