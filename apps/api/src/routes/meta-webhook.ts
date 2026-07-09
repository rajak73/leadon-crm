import { Router, raw, urlencoded } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/error.js';
import { verifyHandshake, verifySignature } from '../services/meta/verify.js';
import { parseMetaPayload } from '../services/meta/parser.js';
import { resolveOrgByRecipient } from '../services/meta/resolve.js';
import { enqueueWebhookEvent, isQueueEnabled } from '../services/bullmq.js';
import { parseSignedRequest } from '../services/meta/signed-request.js';
import { handleDataDeletion, getDeletionStatus } from '../services/meta/data-deletion.js';
import { config, hasRealMetaCreds } from '../config.js';

/**
 * Real Meta webhook endpoint (BRD §16). Handles both the GET verification
 * handshake and POST event delivery with HMAC signature validation.
 *
 * Flow (BRD §11.2): real message → Meta POSTs here → verify signature → map
 * account to org → save WebhookEvent (isSimulation=false) → enqueue for
 * processing (worker or cron). Processing then creates the lead/conversation
 * and, if org has credentials, sends a real reply.
 */
const router = Router();

/**
 * GET /api/v1/webhooks/meta/readiness — App Review readiness checklist.
 * Reports (safe booleans only) whether the config Meta requires is present.
 */
router.get('/meta/readiness', (req: Request, res: Response) => {
  const base = `${req.protocol}://${req.get('host')}`;
  const checks = {
    appSecretConfigured: Boolean(config.meta.appSecret),
    webhookVerifyTokenConfigured: Boolean(config.meta.webhookVerifyToken),
    whatsappCredsConfigured: hasRealMetaCreds('WHATSAPP'),
    instagramCredsConfigured: hasRealMetaCreds('INSTAGRAM'),
  };
  const ready = checks.appSecretConfigured && checks.webhookVerifyTokenConfigured;
  return res.json({
    ready,
    checks,
    urls: {
      webhookCallback: `${base}/api/v1/webhooks/meta`,
      dataDeletionCallback: `${base}/api/v1/webhooks/meta/data-deletion`,
      deauthorizeCallback: `${base}/api/v1/webhooks/meta/deauthorize`,
      privacyPolicy: `${config.webOrigin}/privacy`,
      dataDeletionInstructions: `${config.webOrigin}/data-deletion`,
    },
  });
});

/** GET /api/v1/webhooks/meta — subscription verification handshake. */
router.get('/meta', (req: Request, res: Response) => {
  const challenge = verifyHandshake(req.query as Record<string, unknown>);
  if (challenge) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

/**
 * POST /api/v1/webhooks/meta — event delivery.
 * Uses a raw body parser (needed for exact-bytes HMAC verification).
 */
router.post(
  '/meta',
  raw({ type: '*/*', limit: '2mb' }),
  asyncHandler(async (req: Request, res: Response) => {
    const rawBody: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    const signature = req.header('x-hub-signature-256');

    // Reject anything we can't cryptographically trust (BRD §16, §11.3).
    if (!verifySignature(rawBody, signature)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    const messages = parseMetaPayload(payload);
    let accepted = 0;

    for (const msg of messages) {
      const organizationId = await resolveOrgByRecipient(msg.channel, msg.recipientExternalId);
      if (!organizationId) continue; // no mapped org → ignore (not our account)

      const event = await prisma.webhookEvent.create({
        data: {
          organizationId,
          channel: msg.channel,
          externalId: msg.messageId ?? null,
          isSimulation: false, // REAL event
          status: 'PENDING',
          payload: JSON.stringify({
            organizationId,
            channel: msg.channel,
            senderId: msg.senderId,
            senderName: msg.senderName,
            text: msg.text,
            messageId: msg.messageId,
          }),
        },
      });
      await enqueueWebhookEvent(event.id).catch(() => false);
      accepted++;
    }

    // Always 200 quickly so Meta doesn't retry unnecessarily (BRD §19.4).
    return res.status(200).json({ received: messages.length, accepted, mode: isQueueEnabled() ? 'worker' : 'cron' });
  })
);

/**
 * POST /api/v1/webhooks/meta/data-deletion — Meta data-deletion callback
 * (required for App Review, BRD §16). Verifies the signed_request, deletes the
 * user's data, and returns { url, confirmation_code } as Meta expects.
 */
router.post(
  '/meta/data-deletion',
  urlencoded({ extended: false }),
  asyncHandler(async (req: Request, res: Response) => {
    const payload = parseSignedRequest(req.body?.signed_request);
    if (!payload || !payload.user_id) {
      return res.status(400).json({ error: 'Invalid signed_request' });
    }
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const outcome = await handleDataDeletion(String(payload.user_id), baseUrl);
    // Meta expects snake_case keys.
    return res.status(200).json({ url: outcome.url, confirmation_code: outcome.confirmationCode });
  })
);

/** GET /api/v1/webhooks/meta/deletion-status?code=... — public status page. */
router.get(
  '/meta/deletion-status',
  asyncHandler(async (req: Request, res: Response) => {
    const code = String(req.query.code ?? '');
    const status = await getDeletionStatus(code);
    if (!status) return res.status(404).send('Deletion request not found.');
    res.status(200).send(
      `<!doctype html><meta charset="utf-8"><title>Data deletion status</title>` +
        `<div style="font-family:system-ui;max-width:560px;margin:60px auto;padding:24px;border:1px solid #e6e8eb;border-radius:12px">` +
        `<h2>LeadOS — Data Deletion Status</h2>` +
        `<p>Confirmation code: <code>${status.confirmationCode}</code></p>` +
        `<p>Status: <strong>${status.status}</strong></p>` +
        `<p>Completed: ${status.completedAt ? new Date(status.completedAt).toUTCString() : 'n/a'}</p>` +
        `<p>Conversations deleted: ${status.conversationsDeleted} · Leads anonymized: ${status.leadsAnonymized}</p>` +
        `</div>`
    );
  })
);

/**
 * POST /api/v1/webhooks/meta/deauthorize — Meta deauthorize callback
 * (fired when a user removes the app). Verifies signed_request; best-effort.
 */
router.post(
  '/meta/deauthorize',
  urlencoded({ extended: false }),
  asyncHandler(async (req: Request, res: Response) => {
    const payload = parseSignedRequest(req.body?.signed_request);
    if (!payload) return res.status(400).json({ error: 'Invalid signed_request' });
    // We keep no per-user OAuth tokens for social senders, so nothing to revoke;
    // acknowledge so Meta marks the callback healthy.
    return res.status(200).json({ ok: true });
  })
);

export default router;
