/**
 * Two-factor authentication (TOTP). Compatible with Google Authenticator/Authy.
 * Secrets and backup codes are stored on the User (encrypt at rest in prod).
 */
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

// Allow a small time window for clock drift.
authenticator.options = { window: 1 };

const ISSUER = 'LeadOS';

export function generateSecret(): string {
  return authenticator.generateSecret();
}

/** otpauth:// URI + QR data URL for enrollment. */
export async function buildEnrollment(email: string, secret: string): Promise<{ otpauthUrl: string; qrDataUrl: string }> {
  const otpauthUrl = authenticator.keyuri(email, ISSUER, secret);
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
  return { otpauthUrl, qrDataUrl };
}

export function verifyToken(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token: token.replace(/\s/g, ''), secret });
  } catch {
    return false;
  }
}

/** Generate N plaintext backup codes + their bcrypt hashes (store the hashes). */
export async function generateBackupCodes(n = 8): Promise<{ codes: string[]; hashes: string[] }> {
  const codes: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < n; i++) {
    const code = crypto.randomBytes(4).toString('hex'); // 8 hex chars
    codes.push(code);
    hashes.push(await bcrypt.hash(code, 10));
  }
  return { codes, hashes };
}

/** Check a backup code against stored hashes; returns the remaining hashes if matched (single-use). */
export async function consumeBackupCode(code: string, hashesJson: string | null): Promise<string[] | null> {
  if (!hashesJson) return null;
  let hashes: string[];
  try {
    hashes = JSON.parse(hashesJson);
  } catch {
    return null;
  }
  for (let i = 0; i < hashes.length; i++) {
    if (await bcrypt.compare(code.replace(/\s/g, ''), hashes[i])) {
      hashes.splice(i, 1); // consume it
      return hashes;
    }
  }
  return null;
}
