import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth, requireOrg, type AuthedRequest } from '../middleware/auth.js';
import { OrgRole } from '@leados/shared';
import {
  CALENDAR_PROVIDER,
  isCalendarConfigured,
  getGoogleAuthUrl,
  exchangeCodeForTokens,
} from '../services/calendar.js';
import { config } from '../config.js';
import { signToken, verifyToken } from '../lib/jwt.js';

/**
 * Calendar (Google) integration routes (BRD §15.2). Connect flow via OAuth 2.0.
 * The OAuth callback is public (Google redirects the browser there) and uses a
 * short-lived signed `state` token to carry the org id securely.
 */
const router = Router();

/** GET /api/v1/calendar/status — connection + config state (authed). */
router.get(
  '/status',
  requireAuth,
  requireOrg(),
  asyncHandler(async (req: AuthedRequest, res) => {
    const account = await prisma.integrationAccount.findFirst({
      where: { organizationId: req.org!.organizationId, provider: CALENDAR_PROVIDER },
    });
    res.json({
      configured: isCalendarConfigured(),
      connected: Boolean(account?.isConnected),
      mode: isCalendarConfigured() ? 'google' : 'mock',
    });
  })
);

/**
 * GET /api/v1/calendar/connect — begin OAuth (owner/admin). Returns the Google
 * consent URL (or a mock connect in free mode).
 */
router.get(
  '/connect',
  requireAuth,
  requireOrg(OrgRole.OWNER, OrgRole.ADMIN),
  asyncHandler(async (req: AuthedRequest, res) => {
    const orgId = req.org!.organizationId;

    if (!isCalendarConfigured()) {
      // Mock connect: mark a placeholder account connected so task→event flow
      // reports 'mock' cleanly without external Google setup.
      await prisma.integrationAccount.upsert({
        where: { id: (await ensureMockId(orgId)) },
        update: { isConnected: true },
        create: { organizationId: orgId, provider: CALENDAR_PROVIDER, displayName: 'Mock Calendar', isConnected: true },
      });
      return res.json({ mode: 'mock', connected: true, note: 'Connected in mock mode (no Google creds configured).' });
    }

    // Real: sign a state token (5 min) carrying the org id.
    const state = signToken({ sub: orgId, email: 'calendar-oauth', isSuperAdmin: false });
    const url = getGoogleAuthUrl(state);
    res.json({ mode: 'google', authUrl: url });
  })
);

/**
 * GET /api/v1/calendar/callback — Google OAuth redirect target (public).
 * Exchanges the code for a refresh token and stores it on the org's account.
 */
router.get(
  '/callback',
  asyncHandler(async (req: Request, res: Response) => {
    const code = String(req.query.code ?? '');
    const state = String(req.query.state ?? '');
    if (!code || !state) return res.status(400).send('Missing code/state');

    let orgId: string;
    try {
      orgId = verifyToken(state).sub;
    } catch {
      return res.status(400).send('Invalid state');
    }

    const { refreshToken } = await exchangeCodeForTokens(code);
    const existing = await prisma.integrationAccount.findFirst({
      where: { organizationId: orgId, provider: CALENDAR_PROVIDER },
    });
    if (existing) {
      await prisma.integrationAccount.update({
        where: { id: existing.id },
        data: { accessToken: refreshToken, isConnected: true, displayName: 'Google Calendar' },
      });
    } else {
      await prisma.integrationAccount.create({
        data: { organizationId: orgId, provider: CALENDAR_PROVIDER, accessToken: refreshToken, isConnected: true, displayName: 'Google Calendar' },
      });
    }
    // Redirect the browser back to the app.
    res.redirect(`${config.webOrigin}/app/integrations?calendar=connected`);
  })
);

/** POST /api/v1/calendar/disconnect (owner/admin). */
router.post(
  '/disconnect',
  requireAuth,
  requireOrg(OrgRole.OWNER, OrgRole.ADMIN),
  asyncHandler(async (req: AuthedRequest, res) => {
    await prisma.integrationAccount.updateMany({
      where: { organizationId: req.org!.organizationId, provider: CALENDAR_PROVIDER },
      data: { isConnected: false },
    });
    res.json({ ok: true });
  })
);

/** Helper: find-or-create a stable mock account id for upsert. */
async function ensureMockId(orgId: string): Promise<string> {
  const existing = await prisma.integrationAccount.findFirst({
    where: { organizationId: orgId, provider: CALENDAR_PROVIDER },
  });
  if (existing) return existing.id;
  const created = await prisma.integrationAccount.create({
    data: { organizationId: orgId, provider: CALENDAR_PROVIDER, displayName: 'Mock Calendar', isConnected: false },
  });
  return created.id;
}

export default router;
