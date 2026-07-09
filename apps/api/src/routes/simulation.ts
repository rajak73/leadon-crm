import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth, requireOrg, type AuthedRequest } from '../middleware/auth.js';

/**
 * Social simulation webhook (BRD §11.1, §21.4). Auth + org-scoped so only a
 * member can inject fake events for their own organization (no real Meta creds
 * involved). Saves a WebhookEvent to the queue; the cron drain processes it.
 */
const router = Router();
router.use(requireAuth, requireOrg());

const simSchema = z.object({
  channel: z.enum(['INSTAGRAM', 'WHATSAPP', 'FACEBOOK']),
  senderId: z.string().min(1),
  senderName: z.string().optional(),
  text: z.string().min(1),
  messageId: z.string().optional(),
  drainNow: z.boolean().default(false), // convenience for demos/tests
});

/**
 * POST /api/v1/simulation/webhook
 * Enqueue a fake inbound message. Mirrors §11.1: payload → webhook event saved
 * → (cron drains queue) → lead/conversation/message created.
 */
router.post(
  '/webhook',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = simSchema.parse(req.body);
    const organizationId = req.org!.organizationId;

    const event = await prisma.webhookEvent.create({
      data: {
        organizationId,
        channel: data.channel,
        externalId: data.messageId ?? null,
        isSimulation: true,
        status: 'PENDING',
        payload: JSON.stringify({
          organizationId,
          channel: data.channel,
          senderId: data.senderId,
          senderName: data.senderName,
          text: data.text,
          messageId: data.messageId,
        }),
      },
    });

    // Optional immediate drain (so demos don't wait for the 5-min cron).
    if (data.drainNow) {
      const { drainQueues } = await import('../services/queue.js');
      const result = await drainQueues({ onlyEventId: event.id });
      return res.status(201).json({ eventId: event.id, drained: result });
    }

    // Phase 14: if a real Redis-backed worker is configured, enqueue for
    // low-latency background processing; otherwise the free cron drains it.
    const { enqueueWebhookEvent, isQueueEnabled } = await import('../services/bullmq.js');
    const enqueued = await enqueueWebhookEvent(event.id).catch(() => false);

    res.status(201).json({
      eventId: event.id,
      status: 'PENDING',
      mode: isQueueEnabled() ? 'worker' : 'cron',
      note: enqueued
        ? 'Enqueued to background worker for processing.'
        : 'Queued. It will be processed by the next cron drain (or pass drainNow:true).',
    });
  })
);

export default router;
