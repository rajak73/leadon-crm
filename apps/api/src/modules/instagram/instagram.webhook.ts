import crypto from 'node:crypto';
import express, { Router } from 'express';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { webhookVerifyToken } from './instagram.account.js';
import { type WebhookPayload, processWebhookPayload } from './instagram.pipeline.js';

/** Constant-time check of `X-Hub-Signature-256: sha256=<hex>` over the raw body. */
export function isValidSignature(raw: Buffer, header: string | undefined, secret: string): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const given = Buffer.from(header.slice(7), 'hex');
  const expected = crypto.createHmac('sha256', secret).update(raw).digest();
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/**
 * Public Meta webhook endpoints. Mounted before express.json() because the signature must be
 * computed over the exact bytes Meta sent.
 */
export const instagramWebhookRouter = Router();

instagramWebhookRouter.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && typeof token === 'string' && typeof challenge === 'string') {
    const expected = Buffer.from(webhookVerifyToken());
    const given = Buffer.from(token);
    if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) {
      res.status(200).type('text/plain').send(challenge);
      return;
    }
  }
  res.status(403).type('text/plain').send('Verification failed');
});

instagramWebhookRouter.post('/', express.raw({ type: () => true, limit: '2mb' }), (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const secret = env.META_APP_SECRET;
  if (secret) {
    if (!isValidSignature(raw, req.get('x-hub-signature-256'), secret)) {
      logger.warn('Instagram webhook with an invalid signature rejected');
      res.status(401).type('text/plain').send('Invalid signature');
      return;
    }
  } else if (!env.INSTAGRAM_TEST_MODE) {
    logger.warn('Instagram webhook rejected: META_APP_SECRET is not set');
    res.status(401).type('text/plain').send('Webhook signature cannot be verified');
    return;
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(raw.toString('utf8')) as WebhookPayload;
  } catch {
    res.status(400).type('text/plain').send('Invalid JSON');
    return;
  }
  // Acknowledge immediately; Meta retries slow or failed deliveries.
  res.status(200).type('text/plain').send('EVENT_RECEIVED');
  processWebhookPayload(payload);
});
