import { Router } from 'express';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { asyncHandler } from '../middleware/error.js';
import {
  exchangeCodeForUserToken,
  getLongLivedToken,
  listPagesWithInstagram,
  connectInstagramAccount,
  exchangeCodeForInstagramLoginToken,
  getInstagramLoginLongLivedToken,
  getInstagramLoginProfile,
  type EligiblePage,
} from '../services/meta/oauth.js';

/**
 * Public leg of the Instagram OAuth flow. Meta redirects the browser here
 * directly (no Authorization header available), so identity/authorization is
 * carried entirely by the signed `state` JWT minted in
 * routes/integrations.ts's /instagram/connect. Mounted BEFORE the
 * requireAuth/requireOrg middleware that guards the rest of /integrations.
 */
const router = Router();

interface ConnectState {
  organizationId: string;
  userId: string;
  typ: 'ig-connect';
}

interface PickState {
  organizationId: string;
  pages: EligiblePage[];
  longLivedToken: string;
  expiresInSeconds?: number;
  typ: 'ig-pick';
}

function webRedirect(path: string): string {
  const web = config.webOrigin === '*' ? 'http://localhost:5173' : config.webOrigin.split(',')[0];
  return `${web}${path}`;
}

/** GET /api/v1/integrations/instagram/callback */
router.get(
  '/instagram/callback',
  asyncHandler(async (req: Request, res: Response) => {
    const code = String(req.query.code ?? '');
    const state = String(req.query.state ?? '');
    if (!code || !state) return res.redirect(webRedirect('/app/integrations?error=missing_code'));

    let decoded: ConnectState;
    try {
      decoded = jwt.verify(state, config.jwtSecret) as ConnectState;
      if (decoded.typ !== 'ig-connect') throw new Error('bad state');
    } catch {
      return res.redirect(webRedirect('/app/integrations?error=invalid_state'));
    }

    try {
      // instagram_login mode: no Page picker — one authorize = one account.
      if (config.meta.apiMode === 'instagram_login') {
        const { accessToken: shortToken, userId } = await exchangeCodeForInstagramLoginToken(code);
        const { accessToken: longToken, expiresInSeconds } = await getInstagramLoginLongLivedToken(shortToken);
        const { username } = await getInstagramLoginProfile(userId, longToken);
        const page: EligiblePage = {
          pageId: userId, // no real Page in this mode — subscribed_apps calls target the IG user id directly
          pageName: username ?? userId,
          pageAccessToken: longToken,
          igUserId: userId,
          igUsername: username,
        };
        await connectInstagramAccount(decoded.organizationId, page, longToken, expiresInSeconds);
        return res.redirect(webRedirect('/app/integrations?connected=1'));
      }

      const { accessToken: shortToken } = await exchangeCodeForUserToken(code);
      const { accessToken: longToken, expiresInSeconds } = await getLongLivedToken(shortToken);
      const pages = await listPagesWithInstagram(longToken);

      if (pages.length === 0) {
        return res.redirect(webRedirect('/app/integrations?error=no_instagram_account'));
      }

      if (pages.length === 1) {
        await connectInstagramAccount(decoded.organizationId, pages[0], longToken, expiresInSeconds);
        return res.redirect(webRedirect('/app/integrations?connected=1'));
      }

      // Multiple eligible pages — let the org pick in the UI. Carry the page
      // list + long-lived token in a short-lived signed token (never handled
      // by the browser beyond an opaque string).
      const pickToken = jwt.sign(
        {
          organizationId: decoded.organizationId,
          pages,
          longLivedToken: longToken,
          expiresInSeconds,
          typ: 'ig-pick',
        } as PickState,
        config.jwtSecret,
        { expiresIn: '10m' }
      );
      return res.redirect(`${webRedirect('/app/integrations')}?pick=${encodeURIComponent(pickToken)}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'oauth_failed';
      return res.redirect(`${webRedirect('/app/integrations')}?error=${encodeURIComponent(reason.slice(0, 120))}`);
    }
  })
);

export default router;
export type { PickState };
