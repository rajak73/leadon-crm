/**
 * Meta "signed_request" parser (BRD §16 App Review). Meta sends data-deletion
 * and deauthorize callbacks as a POST form field `signed_request` in the format
 * `<base64url_signature>.<base64url_payload>`, signed with HMAC-SHA256 using the
 * app secret. This verifies the signature and returns the decoded payload.
 *
 * Ref: developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
 */
import crypto from 'crypto';
import { config } from '../../config.js';

export interface SignedRequestPayload {
  user_id?: string;
  algorithm?: string;
  issued_at?: number;
  [key: string]: unknown;
}

function base64UrlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

/** Returns the decoded payload if the signature is valid, else null. */
export function parseSignedRequest(signedRequest: string | undefined): SignedRequestPayload | null {
  if (!signedRequest || !config.meta.appSecret) return null;
  const parts = signedRequest.split('.');
  if (parts.length !== 2) return null;

  const [encodedSig, encodedPayload] = parts;
  const expected = crypto
    .createHmac('sha256', config.meta.appSecret)
    .update(encodedPayload)
    .digest();

  const provided = base64UrlDecode(encodedSig);
  if (provided.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(provided, expected)) return null;

  try {
    return JSON.parse(base64UrlDecode(encodedPayload).toString('utf8')) as SignedRequestPayload;
  } catch {
    return null;
  }
}
