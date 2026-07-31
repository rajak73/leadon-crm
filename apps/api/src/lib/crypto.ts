/**
 * AES-256-GCM encryption for secrets stored at rest (e.g.
 * IntegrationAccount.accessToken). The configured TOKEN_ENCRYPTION_KEY is
 * normalized via SHA-256 to a 32-byte key, so any non-empty string works.
 */
import crypto from 'node:crypto';
import { config } from '../config.js';

const ALGO = 'aes-256-gcm';

function deriveKey(): Buffer {
  return crypto.createHash('sha256').update(config.tokenEncryptionKey).digest();
}

/** Encrypt plaintext, returning `iv:authTag:ciphertext` (all base64url). */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, deriveKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString('base64url')).join(':');
}

/**
 * Decrypt a value produced by encryptSecret. Values not in our `iv:tag:ct`
 * format are assumed to be legacy plaintext (pre-encryption dev data or the
 * manual-paste fallback) and returned as-is.
 */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const parts = stored.split(':');
  if (parts.length !== 3) return stored;
  try {
    const [iv, authTag, ciphertext] = parts.map((p) => Buffer.from(p, 'base64url'));
    const decipher = crypto.createDecipheriv(ALGO, deriveKey(), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
