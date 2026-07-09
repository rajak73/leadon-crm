import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/jwt.js';
import { Unauthorized, Forbidden } from '../lib/errors.js';
import { prisma } from '../prisma.js';

/**
 * Express request augmented with the authenticated user and (optionally) the
 * resolved organization context used for tenant scoping (BRD §17, §20).
 */
export interface AuthedRequest extends Request {
  auth?: {
    userId: string;
    email: string;
    isSuperAdmin: boolean;
  };
  org?: {
    organizationId: string;
    role: string;
  };
}

/** Requires a valid JWT. Populates req.auth. */
export function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(Unauthorized('Missing bearer token'));
  }
  try {
    const payload = verifyToken(header.slice(7));
    req.auth = { userId: payload.sub, email: payload.email, isSuperAdmin: payload.isSuperAdmin };
    return next();
  } catch {
    return next(Unauthorized('Invalid or expired token'));
  }
}

/** Requires the authenticated user to be a Super Admin (BRD §9.1, §20). */
export function requireSuperAdmin(req: AuthedRequest, _res: Response, next: NextFunction) {
  if (!req.auth) return next(Unauthorized());
  if (!req.auth.isSuperAdmin) return next(Forbidden('Super Admin only'));
  return next();
}

/**
 * Tenant isolation middleware (BRD §20). Resolves the caller's membership in
 * the organization identified by the `X-Org-Id` header (or `?orgId=`), and
 * rejects the request if the user is not a member. This is the ONLY sanctioned
 * way normal routes obtain an organizationId — routes then scope every query
 * by req.org.organizationId so Organization A can never read Organization B.
 */
export function requireOrg(...allowedRoles: string[]) {
  return async (req: AuthedRequest, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(Unauthorized());

    const orgId =
      (req.headers['x-org-id'] as string | undefined) ||
      (req.query.orgId as string | undefined) ||
      (req.body && (req.body.organizationId as string | undefined));

    if (!orgId) return next(Forbidden('Missing organization context (X-Org-Id header)'));

    const membership = await prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId: req.auth.userId, organizationId: orgId } },
    });

    // Super Admins are NOT auto-members (BRD: no impersonation in current version).
    if (!membership) return next(Forbidden('You are not a member of this organization'));

    if (allowedRoles.length > 0 && !allowedRoles.includes(membership.role)) {
      return next(Forbidden(`Requires role: ${allowedRoles.join(' or ')}`));
    }

    req.org = { organizationId: orgId, role: membership.role };
    return next();
  };
}
