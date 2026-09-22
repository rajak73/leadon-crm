import { Router, type RequestHandler, type Response } from 'express';
import {
  changePasswordSchema,
  loginSchema,
  setupSchema,
  updateProfileSchema,
} from '@leados/shared';
import { isProduction } from '../../config/env.js';
import { authenticate, requireFetchHeader } from '../../lib/auth.js';
import { body, created, ok } from '../../lib/http.js';
import {
  REFRESH_TTL_MS,
  changePassword,
  getAuthStatus,
  getMe,
  login,
  logout,
  refresh,
  setup,
  updateMe,
  type IssuedSession,
} from './auth.service.js';

export const REFRESH_COOKIE = 'leados_rt';
const COOKIE_PATH = '/api/auth';

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: isProduction,
  path: COOKIE_PATH,
});

function sendSession(res: Response, issued: IssuedSession, status = 200): void {
  if (issued.refreshToken) {
    res.cookie(REFRESH_COOKIE, issued.refreshToken, { ...cookieOptions(), maxAge: REFRESH_TTL_MS });
  }
  res.setHeader('Cache-Control', 'no-store');
  if (status === 201) created(res, issued.session);
  else ok(res, issued.session);
}

const readCookie = (cookies: unknown): string | undefined => {
  const v = (cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
};

/** /api/auth — public endpoints. `credentialLimiter` throttles login and setup per IP. */
export function authRouter(credentialLimiter: RequestHandler): Router {
  const router = Router();

  router.get('/status', async (_req, res) => ok(res, await getAuthStatus()));

  router.post('/setup', credentialLimiter, async (req, res) =>
    sendSession(res, await setup(body(setupSchema, req)), 201),
  );

  router.post('/login', credentialLimiter, async (req, res) =>
    sendSession(res, await login(body(loginSchema, req))),
  );

  router.post('/refresh', requireFetchHeader, async (req, res) => {
    try {
      sendSession(res, await refresh(readCookie(req.cookies)));
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE, cookieOptions());
      throw err;
    }
  });

  router.post('/logout', requireFetchHeader, async (req, res) => {
    await logout(readCookie(req.cookies));
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
    ok(res, null);
  });

  return router;
}

/** /api/me — the signed-in user's own profile. */
export const meRouter = Router();
meRouter.use(authenticate);

meRouter.get('/', async (req, res) => ok(res, await getMe(req.user!.id)));

meRouter.patch('/', async (req, res) =>
  ok(res, await updateMe(req.user!.id, body(updateProfileSchema, req))),
);

meRouter.post('/password', async (req, res) => {
  await changePassword(req.user!.id, req.user!.sessionFamily, body(changePasswordSchema, req));
  ok(res, null);
});
