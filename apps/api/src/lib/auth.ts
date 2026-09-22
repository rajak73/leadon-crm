import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { UserRole } from '@leados/shared';
import { env } from '../config/env.js';
import { forbidden, unauthorized } from './errors.js';
import { prisma } from './prisma.js';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

interface AccessClaims {
  sub: string;
  role: UserRole;
  sid: string | null; // refresh-token family, so /me/password can keep the current session
}

export function signAccessToken(claims: AccessClaims): string {
  return jwt.sign({ role: claims.role, sid: claims.sid }, env.JWT_SECRET, {
    subject: claims.sub,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    issuer: 'leados',
    algorithm: 'HS256',
  });
}

/** Verifies the bearer token and re-checks the user in the database (disabled users are cut off immediately). */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthorized();
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(header.slice(7), env.JWT_SECRET, {
      issuer: 'leados',
      algorithms: ['HS256'],
    }) as jwt.JwtPayload;
  } catch {
    throw unauthorized('Your session has expired. Please sign in again.');
  }
  const user = await prisma.user.findUnique({
    where: { id: String(payload.sub) },
    select: { id: true, role: true, email: true, status: true },
  });
  if (!user || user.status !== 'ACTIVE')
    throw unauthorized('Your session has expired. Please sign in again.');
  req.user = {
    id: user.id,
    role: user.role as UserRole,
    email: user.email,
    sessionFamily: typeof payload.sid === 'string' ? payload.sid : null,
  };
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.role !== 'ADMIN') throw forbidden('Only admins can do that.');
  next();
}

/** Simple CSRF guard for cookie-authenticated endpoints: browsers can't add this header cross-site without CORS. */
export function requireFetchHeader(req: Request, _res: Response, next: NextFunction): void {
  if (req.get('x-requested-with') !== 'fetch')
    throw forbidden(
      'This request was blocked for security reasons. Refresh the page and try again.',
    );
  next();
}

export interface Actor {
  userId: string | null; // null = automation
  role: UserRole | null;
  depth: number;
}

export function actor(req: Request): Actor {
  if (!req.user) throw unauthorized();
  return { userId: req.user.id, role: req.user.role, depth: 0 };
}

export const isAdmin = (a: Actor) => a.role === 'ADMIN';
