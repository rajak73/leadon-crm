import crypto from 'node:crypto';
import type { User as UserRow } from '@prisma/client';
import {
  ErrorCode,
  type AuthSession,
  type AuthStatus,
  type ChangePasswordInput,
  type LoginInput,
  type SetupInput,
  type UpdateProfileInput,
  type User,
  type UserRole,
} from '@leados/shared';
import { ACCESS_TOKEN_TTL_SECONDS, signAccessToken } from '../../lib/auth.js';
import { AppError, conflict, fieldError, notFound, unauthorized } from '../../lib/errors.js';
import { getDummyHash, hashPassword, verifyPassword } from '../../lib/password.js';
import { lockTx, prisma } from '../../lib/prisma.js';
import { toUser } from '../../lib/serializers.js';
import { createDefaultPipeline } from '../pipelines/index.js';
import { SETTINGS_ID } from '../settings/index.js';

export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const REFRESH_GRACE_MS = 30 * 1000;
export const MAX_FAILED_LOGINS = 5;
export const LOCK_DURATION_MS = 15 * 60 * 1000;

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');

/** A session to return to the client. `refreshToken` is null when the cookie must not change. */
export interface IssuedSession {
  session: AuthSession;
  refreshToken: string | null;
}

function accessSession(user: UserRow, family: string): AuthSession {
  return {
    accessToken: signAccessToken({ sub: user.id, role: user.role as UserRole, sid: family }),
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    user: toUser(user),
  };
}

async function startSession(
  user: UserRow,
  family: string = crypto.randomUUID(),
): Promise<IssuedSession> {
  const refreshToken = newToken();
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      family,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });
  return { session: accessSession(user, family), refreshToken };
}

export async function getAuthStatus(): Promise<AuthStatus> {
  const [users, settings] = await Promise.all([
    prisma.user.count(),
    prisma.appSettings.findUnique({ where: { id: SETTINGS_ID } }),
  ]);
  return { needsSetup: users === 0, companyName: settings?.companyName ?? null };
}

export async function setup(input: SetupInput): Promise<IssuedSession> {
  const passwordHash = await hashPassword(input.password);
  const user = await prisma.$transaction(async (tx) => {
    await lockTx(tx, 'setup'); // two simultaneous first-run requests must not both succeed
    if ((await tx.user.count()) > 0) throw conflict('LeadOS is already set up. Sign in instead.');
    await tx.appSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, companyName: input.companyName },
      update: { companyName: input.companyName },
    });
    if ((await tx.pipeline.count()) === 0) await createDefaultPipeline(tx);
    return tx.user.create({
      data: {
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        role: 'ADMIN',
        passwordHash,
        lastLoginAt: new Date(),
      },
    });
  });
  return startSession(user);
}

const INVALID_LOGIN = 'Incorrect email or password.';

export async function login(input: LoginInput): Promise<IssuedSession> {
  const now = new Date();
  let user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    await verifyPassword(input.password, await getDummyHash()); // same work as a real check
    throw unauthorized(INVALID_LOGIN);
  }

  if (user.lockedUntil && user.lockedUntil > now) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60_000);
    throw new AppError(
      ErrorCode.RATE_LIMITED,
      `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    );
  }
  if (user.lockedUntil) {
    // The lock has expired: start counting failures afresh.
    user = await prisma.user.update({
      where: { id: user.id },
      data: { lockedUntil: null, failedLoginCount: 0 },
    });
  }

  if (!(await verifyPassword(input.password, user.passwordHash))) {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    if (updated.failedLoginCount >= MAX_FAILED_LOGINS) {
      await prisma.user.update({
        where: { id: user.id },
        data: { lockedUntil: new Date(now.getTime() + LOCK_DURATION_MS), failedLoginCount: 0 },
      });
    }
    throw unauthorized(INVALID_LOGIN);
  }

  if (user.status !== 'ACTIVE') {
    throw unauthorized('Your account has been disabled. Ask an admin to re-enable it.');
  }

  const fresh = await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
  });
  return startSession(fresh);
}

const SESSION_EXPIRED = 'Your session has expired. Please sign in again.';

/**
 * Rotates a refresh token. The token is claimed atomically (`usedAt` null → now), so two
 * concurrent refreshes can't both rotate it. The loser — or any reuse within the 30 s grace
 * window — gets a fresh access token for the same session and leaves the cookie alone (the
 * winner already set it; tabs share cookies). Reuse after the window revokes the family.
 */
export async function refresh(rawToken: string | undefined): Promise<IssuedSession> {
  if (!rawToken) throw unauthorized(SESSION_EXPIRED);
  const now = new Date();
  const token = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: true },
  });
  if (!token || token.revokedAt || token.expiresAt <= now) throw unauthorized(SESSION_EXPIRED);
  if (token.user.status !== 'ACTIVE') {
    await revokeFamily(token.family);
    throw unauthorized(SESSION_EXPIRED);
  }

  const claimed = await prisma.refreshToken.updateMany({
    where: { id: token.id, usedAt: null },
    data: { usedAt: now },
  });
  if (claimed.count === 1) return startSession(token.user, token.family);

  const usedAt = (
    await prisma.refreshToken.findUnique({ where: { id: token.id }, select: { usedAt: true } })
  )?.usedAt;
  if (usedAt && now.getTime() - usedAt.getTime() <= REFRESH_GRACE_MS) {
    const familyAlive = await prisma.refreshToken.count({
      where: { family: token.family, revokedAt: null, usedAt: null, expiresAt: { gt: now } },
    });
    if (familyAlive > 0)
      return { session: accessSession(token.user, token.family), refreshToken: null };
  }

  // Reuse of an old token: assume it was stolen and end every session in this family.
  await revokeFamily(token.family);
  throw unauthorized(SESSION_EXPIRED);
}

async function revokeFamily(family: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { family, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  const token = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    select: { family: true },
  });
  if (token) await revokeFamily(token.family);
}

// ─── Profile ─────────────────────────────────────────────────────────────────

export async function getMe(userId: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound('account');
  return toUser(user);
}

export async function updateMe(userId: string, input: UpdateProfileInput): Promise<User> {
  if (input.email) {
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing && existing.id !== userId) {
      throw conflict('Someone on your team already uses that email address.', {
        email: ['This email is already in use'],
      });
    }
  }
  return toUser(await prisma.user.update({ where: { id: userId }, data: input }));
}

export async function changePassword(
  userId: string,
  currentFamily: string | null,
  input: ChangePasswordInput,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound('account');
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw fieldError('currentPassword', 'Your current password is incorrect');
  }
  const passwordHash = await hashPassword(input.newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(currentFamily ? { family: { not: currentFamily } } : {}),
      },
      data: { revokedAt: new Date() },
    }),
  ]);
}

/** Housekeeping: drop refresh tokens that expired more than a day ago. */
export async function purgeExpiredRefreshTokens(): Promise<void> {
  await prisma.refreshToken.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
}
