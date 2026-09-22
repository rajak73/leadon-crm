import crypto from 'node:crypto';
import type { IgAccount } from '@prisma/client';
import { ErrorCode, type ConnectInstagramInput, type InstagramStatus } from '@leados/shared';
import { env } from '../../config/env.js';
import { decryptSecret, encryptSecret } from '../../lib/crypto.js';
import { AppError, conflict } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { toInstagramStatus } from '../../lib/serializers.js';
import { notifyAdmins } from '../notifications/index.js';
import { GraphError, TOKEN_EXPIRED_MESSAGE, getAdapter } from './instagram.adapter.js';

export const ACCOUNT_ID = 1;
const DAY = 24 * 60 * 60 * 1000;
/** Long-lived Instagram tokens last 60 days; Meta doesn't say how old a pasted token is. */
const ASSUMED_TOKEN_LIFETIME_MS = 60 * DAY;
const REFRESH_WHEN_WITHIN_MS = 10 * DAY;

export const getAccount = () => prisma.igAccount.findUnique({ where: { id: ACCOUNT_ID } });

/** Random-looking but stable when META_WEBHOOK_VERIFY_TOKEN isn't set. */
export function webhookVerifyToken(): string {
  return (
    env.META_WEBHOOK_VERIFY_TOKEN ??
    crypto
      .createHmac('sha256', env.JWT_SECRET)
      .update('instagram-webhook-verify')
      .digest('base64url')
      .slice(0, 32)
  );
}

export function publicOrigin(): string {
  return (env.PUBLIC_URL ?? env.APP_ORIGIN).replace(/\/+$/, '');
}

/** Meta can only reach https URLs on public hosts. */
export function isPublicUrl(origin: string): boolean {
  try {
    const url = new URL(origin);
    const host = url.hostname;
    if (url.protocol !== 'https:') return false;
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local'))
      return false;
    if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(host)) return false;
    if (host === '[::1]') return false;
    return true;
  } catch {
    return false;
  }
}

export async function getInstagramStatus(): Promise<InstagramStatus> {
  const account = await getAccount();
  const origin = publicOrigin();
  return toInstagramStatus(account, {
    callbackUrl: `${origin}/api/webhooks/instagram`,
    verifyToken: webhookVerifyToken(),
    isPublicUrl: isPublicUrl(origin),
    appSecretConfigured: Boolean(env.META_APP_SECRET),
    testMode: env.INSTAGRAM_TEST_MODE,
    managedByServer: Boolean(env.INSTAGRAM_ACCESS_TOKEN),
  });
}

export async function connectInstagram(input: ConnectInstagramInput): Promise<InstagramStatus> {
  const adapter = getAdapter();
  const token = input.accessToken.trim();
  let me;
  try {
    me = await adapter.getMe(token);
    await adapter.subscribeApp(token);
  } catch (err) {
    logger.warn({ err }, 'Instagram connect failed');
    const message =
      err instanceof GraphError && err.kind === 'auth'
        ? 'Instagram didn’t accept this token. Generate a new one in the Meta dashboard (Instagram → API setup → Generate token) and paste the whole value.'
        : err instanceof GraphError
          ? `Couldn’t connect: ${err.message}`
          : 'Couldn’t connect to Instagram. Check the token and try again.';
    throw new AppError(ErrorCode.VALIDATION_ERROR, message, { accessToken: [message] });
  }
  const now = new Date();
  const data = {
    igUserId: me.userId,
    username: me.username,
    name: me.name,
    profilePictureUrl: me.profilePictureUrl,
    accessTokenEnc: encryptSecret(token),
    tokenExpiresAt: new Date(now.getTime() + ASSUMED_TOKEN_LIFETIME_MS),
    status: 'ACTIVE',
    statusMessage: null,
    connectedAt: now,
  };
  await prisma.$transaction([
    prisma.igAccount.deleteMany({}), // replaces any previous account
    prisma.igAccount.create({ data: { id: ACCOUNT_ID, ...data } }),
  ]);
  return getInstagramStatus();
}

export async function disconnectInstagram(): Promise<InstagramStatus> {
  const account = await getAccount();
  if (account) {
    const token = readToken(account);
    if (token) {
      try {
        await getAdapter().unsubscribeApp(token);
      } catch (err) {
        logger.warn({ err }, 'Instagram unsubscribe failed (ignored)');
      }
    }
    await prisma.igAccount.deleteMany({});
  }
  return getInstagramStatus();
}

function readToken(account: IgAccount): string | null {
  try {
    return decryptSecret(account.accessTokenEnc);
  } catch {
    return null;
  }
}

/** The usable token of the connected, active account, or a friendly 409. */
export async function requireActiveAccount(): Promise<{ account: IgAccount; token: string }> {
  const account = await getAccount();
  if (!account) throw conflict('Connect your Instagram account first (Settings → Instagram).');
  if (account.status !== 'ACTIVE')
    throw conflict(account.statusMessage ?? 'Reconnect your Instagram account in Settings.');
  const token = readToken(account);
  if (!token) {
    await markAccountProblem(
      'ERROR',
      'The saved token can’t be read (the server’s secret key changed). Reconnect your account.',
    );
    throw conflict('Reconnect your Instagram account in Settings.');
  }
  return { account, token };
}

/** Non-throwing variant for background jobs. */
export async function activeAccount(): Promise<{ account: IgAccount; token: string } | null> {
  try {
    return await requireActiveAccount();
  } catch {
    return null;
  }
}

/** Sets EXPIRED/ERROR and notifies admins once (only on the transition from ACTIVE). */
export async function markAccountProblem(
  status: 'EXPIRED' | 'ERROR',
  statusMessage: string,
): Promise<void> {
  const changed = await prisma.igAccount.updateMany({
    where: { id: ACCOUNT_ID, status: 'ACTIVE' },
    data: { status, statusMessage },
  });
  if (changed.count === 0) return;
  await notifyAdmins({
    type: 'INSTAGRAM_CONNECTION',
    title:
      status === 'EXPIRED' ? 'Instagram needs to be reconnected' : 'Instagram connection problem',
    body: statusMessage,
    entityType: 'instagram',
    entityId: null,
  });
}

/** Call after any Graph failure: token errors flip the account to EXPIRED. */
export async function handleGraphFailure(err: unknown): Promise<void> {
  if (err instanceof GraphError && err.kind === 'auth')
    await markAccountProblem('EXPIRED', TOKEN_EXPIRED_MESSAGE);
}

/** Refreshes the long-lived token when it expires within 10 days. Returns true if refreshed. */
export async function refreshTokenIfNeeded(now = new Date()): Promise<boolean> {
  const account = await getAccount();
  if (!account || account.status !== 'ACTIVE') return false;
  if (account.tokenExpiresAt && account.tokenExpiresAt <= now) {
    await markAccountProblem('EXPIRED', TOKEN_EXPIRED_MESSAGE);
    return false;
  }
  if (
    account.tokenExpiresAt &&
    account.tokenExpiresAt.getTime() - now.getTime() > REFRESH_WHEN_WITHIN_MS
  )
    return false;
  const token = readToken(account);
  if (!token) return false;
  try {
    const fresh = await getAdapter().refreshToken(token);
    await prisma.igAccount.update({
      where: { id: ACCOUNT_ID },
      data: {
        accessTokenEnc: encryptSecret(fresh.accessToken),
        tokenExpiresAt: new Date(
          now.getTime() +
            (fresh.expiresInSeconds ? fresh.expiresInSeconds * 1000 : ASSUMED_TOKEN_LIFETIME_MS),
        ),
      },
    });
    return true;
  } catch (err) {
    logger.warn({ err }, 'Instagram token refresh failed');
    await handleGraphFailure(err);
    return false;
  }
}

/**
 * Connects the account from INSTAGRAM_ACCESS_TOKEN when none is connected or the stored one has
 * stopped working, so a fresh deployment is live without visiting Settings. A healthy account
 * is left alone (its token may have been refreshed since the env value was set).
 */
export async function connectFromEnv(): Promise<'connected' | 'skipped' | 'failed'> {
  const token = env.INSTAGRAM_ACCESS_TOKEN;
  if (!token || env.INSTAGRAM_TEST_MODE) return 'skipped';
  const account = await getAccount();
  if (account?.status === 'ACTIVE') return 'skipped';
  try {
    const status = await connectInstagram({ accessToken: token });
    logger.info(
      { username: status.account?.username },
      'Instagram connected from INSTAGRAM_ACCESS_TOKEN',
    );
    return 'connected';
  } catch (err) {
    logger.error(
      { err },
      'Could not connect Instagram from INSTAGRAM_ACCESS_TOKEN — check the token on the server',
    );
    return 'failed';
  }
}

/** Daily token refresh (started by server.ts, never in tests). */
export function startInstagramJobs(): () => void {
  const run = () =>
    refreshTokenIfNeeded().catch((err: unknown) =>
      logger.error({ err }, 'Instagram token refresh job failed'),
    );
  void connectFromEnv().catch((err: unknown) =>
    logger.error({ err }, 'Instagram auto-connect failed'),
  );
  const first = setTimeout(run, 60_000);
  const timer = setInterval(run, DAY);
  first.unref();
  timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
