import { afterEach, describe, expect, it } from 'vitest';
import { env } from '../config/env.js';
import { decryptSecret, encryptSecret } from './crypto.js';

describe('secret encryption (AES-256-GCM)', () => {
  const original = env.ENCRYPTION_KEY;
  afterEach(() => {
    env.ENCRYPTION_KEY = original;
  });

  it('round-trips and never stores the plain text', () => {
    const token = 'IGAAT-long-lived-token-0123456789';
    const enc = encryptSecret(token);
    expect(enc).not.toContain(token);
    expect(enc.startsWith('v1.')).toBe(true);
    expect(decryptSecret(enc)).toBe(token);
  });

  it('uses a fresh IV every time', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });

  it('rejects tampered values and values encrypted with another key', () => {
    const enc = encryptSecret('secret-value');
    const parts = enc.split('.');
    const flipped = Buffer.from(parts[3]!, 'base64url');
    flipped[0] = flipped[0]! ^ 0xff;
    parts[3] = flipped.toString('base64url');
    expect(() => decryptSecret(parts.join('.'))).toThrow();
    expect(() => decryptSecret('garbage')).toThrow();

    env.ENCRYPTION_KEY = 'a-completely-different-encryption-key-123';
    expect(() => decryptSecret(enc)).toThrow();
    expect(decryptSecret(encryptSecret('x'))).toBe('x');
  });
});
