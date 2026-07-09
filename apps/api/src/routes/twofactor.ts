import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma.js';
import { config } from '../config.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { signToken } from '../lib/jwt.js';
import { BadRequest, Unauthorized, NotFound } from '../lib/errors.js';
import {
  generateSecret,
  buildEnrollment,
  verifyToken,
  generateBackupCodes,
  consumeBackupCode,
} from '../services/twofactor.js';
import { recordAudit } from '../services/audit.js';

/**
 * Two-factor authentication (TOTP) routes.
 *
 * Enrollment (authed): /setup → returns QR + secret; /enable → verifies a code,
 * turns 2FA on, returns one-time backup codes. /disable turns it off.
 *
 * Login completion (unauthed but requires a short-lived 2FA challenge token
 * issued by /auth/login when the account has 2FA): /login-verify.
 */
const router = Router();

// ---- Enrollment (requires an authenticated session) ----

/** POST /api/v1/2fa/setup — generate a secret + QR (not yet enabled). */
router.post(
  '/setup',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
    if (!user) throw Unauthorized();
    const secret = generateSecret();
    // Stash the pending secret (not enabled until verified).
    await prisma.user.update({ where: { id: user.id }, data: { twoFactorSecret: secret } });
    const { otpauthUrl, qrDataUrl } = await buildEnrollment(user.email, secret);
    res.json({ secret, otpauthUrl, qrDataUrl });
  })
);

const enableSchema = z.object({ token: z.string().min(6) });

/** POST /api/v1/2fa/enable — verify a code and turn on 2FA; returns backup codes. */
router.post(
  '/enable',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { token } = enableSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
    if (!user || !user.twoFactorSecret) throw BadRequest('Run /2fa/setup first');
    if (!verifyToken(token, user.twoFactorSecret)) throw BadRequest('Invalid code');

    const { codes, hashes } = await generateBackupCodes();
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true, twoFactorBackupCodes: JSON.stringify(hashes) },
    });
    res.json({ enabled: true, backupCodes: codes });
  })
);

const disableSchema = z.object({ password: z.string().min(1) });

/** POST /api/v1/2fa/disable — requires the account password. */
router.post(
  '/disable',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { password } = disableSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
    if (!user) throw Unauthorized();
    if (!(await bcrypt.compare(password, user.passwordHash))) throw Unauthorized('Invalid password');
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodes: null },
    });
    res.json({ enabled: false });
  })
);

/** GET /api/v1/2fa/status */
router.get(
  '/status',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
    res.json({ enabled: Boolean(user?.twoFactorEnabled) });
  })
);

// ---- Login completion (2FA challenge) ----

const verifySchema = z.object({
  challenge: z.string().min(1),
  token: z.string().optional(),
  backupCode: z.string().optional(),
});

/**
 * POST /api/v1/2fa/login-verify — complete login for a 2FA account.
 * `challenge` is the short-lived token from /auth/login; provide a TOTP `token`
 * or a `backupCode`.
 */
router.post(
  '/login-verify',
  asyncHandler(async (req, res) => {
    const { challenge, token, backupCode } = verifySchema.parse(req.body);

    let payload: any;
    try {
      payload = jwt.verify(challenge, config.jwtSecret);
    } catch {
      throw Unauthorized('Invalid or expired challenge');
    }
    if (payload.typ !== '2fa') throw Unauthorized('Invalid challenge');

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) throw Unauthorized();

    let verified = false;
    if (token && verifyToken(token, user.twoFactorSecret)) {
      verified = true;
    } else if (backupCode) {
      const remaining = await consumeBackupCode(backupCode, user.twoFactorBackupCodes);
      if (remaining) {
        await prisma.user.update({ where: { id: user.id }, data: { twoFactorBackupCodes: JSON.stringify(remaining) } });
        verified = true;
      }
    }
    if (!verified) throw Unauthorized('Invalid 2FA code');

    const memberships = await prisma.organizationMember.findMany({
      where: { userId: user.id },
      include: { organization: true },
    });
    const authToken = signToken({ sub: user.id, email: user.email, isSuperAdmin: user.isSuperAdmin });

    // Audit the 2FA login for the user's first org (best-effort).
    if (memberships[0]) {
      await recordAudit({
        organizationId: memberships[0].organizationId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: '2FA_LOGIN',
        ip: req.ip,
      });
    }

    res.json({
      token: authToken,
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, isSuperAdmin: user.isSuperAdmin },
      organizations: memberships.map((m) => ({
        organizationId: m.organizationId,
        organizationName: m.organization.name,
        organizationSlug: m.organization.slug,
        role: m.role,
      })),
    });
  })
);

export default router;
