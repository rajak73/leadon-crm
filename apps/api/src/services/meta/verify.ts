/**
 * Meta webhook verification (BRD §16). Two mechanisms:
 *
 *  1. GET verification handshake — Meta sends hub.mode/hub.verify_token/
 *     hub.challenge when you subscribe a callback URL. We echo the challenge
 *     only if the verify token matches META_WEBHOOK_VERIFY_TOKEN.
 *
 *  2. POST signature validation — every event POST carries an
 *     X-Hub-Signature-256: sha256=<hmac> header. We recompute HMAC-SHA256 of
 *     the RAW request body using META_APP_SECRET and compare in constant time.
 *     If it doesn't match, the request is rejected (never processed).
 */
import crypto from 'crypto';
import { config } from '../../config.js';

/** GET handshake: returns the challenge string if the token is valid, else null. */
export function verifyHandshake(query: Record<string, unknown>): string | null {
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];
  if (
    mode === 'subscribe' &&
    typeof token === 'string' &&
    config.meta.webhookVerifyToken &&
    token === config.meta.webhookVerifyToken &&
    typeof challenge === 'string'
  ) {
    return challenge;
  }
  return null;
}

/**
 * Validate the X-Hub-Signature-256 header against the raw body.
 * Requires META_APP_SECRET. Returns false if secret missing or mismatch.
 */
export function verifySignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  const appSecret = config.meta.appSecret;
  if (!appSecret) return false; // no secret → cannot trust → reject (BRD §11.3)
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;

  const provided = signatureHeader.slice('sha256='.length);
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');

  // Constant-time comparison (guard against length mismatch).
  const a = Buffer.from(provided, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
