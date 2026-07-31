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

export interface SignatureCheck {
  valid: boolean;
  reason?: string;
  // First 10 hex chars only — enough to compare across log lines without
  // ever exposing the full signature or the secret itself.
  providedPrefix?: string;
  expectedPrefix?: string;
}

/**
 * Validate the X-Hub-Signature-256 header against the raw body.
 * Requires META_APP_SECRET. Returns false if secret missing or mismatch.
 */
export function verifySignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  return checkSignature(rawBody, signatureHeader).valid;
}

/** Same check as verifySignature, but with diagnostic detail for logging. */
export function checkSignature(rawBody: Buffer, signatureHeader: string | undefined): SignatureCheck {
  const appSecret = config.meta.appSecret;
  if (!appSecret) return { valid: false, reason: 'no_app_secret_configured' };
  if (!signatureHeader) return { valid: false, reason: 'no_signature_header' };
  if (!signatureHeader.startsWith('sha256=')) return { valid: false, reason: 'unexpected_signature_prefix' };

  const provided = signatureHeader.slice('sha256='.length);
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');

  const a = Buffer.from(provided, 'hex');
  const b = Buffer.from(expected, 'hex');
  const providedPrefix = provided.slice(0, 10);
  const expectedPrefix = expected.slice(0, 10);
  if (a.length !== b.length) {
    return { valid: false, reason: 'length_mismatch', providedPrefix, expectedPrefix };
  }
  const valid = crypto.timingSafeEqual(a, b);
  return { valid, reason: valid ? undefined : 'hmac_mismatch', providedPrefix, expectedPrefix };
}
