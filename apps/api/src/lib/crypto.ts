import crypto from 'node:crypto';
import { env } from '../config/env.js';

/**
 * AES-256-GCM for secrets stored in the database (the Instagram access token).
 * The key comes from ENCRYPTION_KEY, or is derived from JWT_SECRET with HKDF, so changing
 * either makes stored secrets unreadable (the admin then reconnects).
 * Format: `v1.<iv>.<tag>.<ciphertext>` (base64url parts).
 */
const VERSION = 'v1';

function key(): Buffer {
  const secret = env.ENCRYPTION_KEY ?? env.JWT_SECRET;
  return Buffer.from(
    crypto.hkdfSync('sha256', secret, 'leados-secrets', 'aes-256-gcm token encryption', 32),
  );
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ciphertext]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.');
}

/** Throws if the value was tampered with or encrypted with a different key. */
export function decryptSecret(value: string): string {
  const [version, iv, tag, ciphertext] = value.split('.');
  if (version !== VERSION || !iv || !tag || ciphertext === undefined)
    throw new Error('Unrecognised encrypted value');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
