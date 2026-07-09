import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { signToken } from '../lib/jwt.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { BadRequest, Conflict, Unauthorized } from '../lib/errors.js';
import {
  validatePassword,
  slugify,
  OrgRole,
  DEFAULT_PIPELINE_STAGES,
} from '@leados/shared';

const router = Router();

const signupSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  password: z.string(),
  workspaceName: z.string().min(2),
});

/**
 * POST /api/v1/auth/signup
 * BRD §10.2 + §21.1: create user + organization, make user OWNER, return token.
 */
router.post(
  '/signup',
  asyncHandler(async (req, res) => {
    const data = signupSchema.parse(req.body);

    const pw = validatePassword(data.password);
    if (!pw.valid) throw BadRequest('Weak password', pw.errors);

    const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (existing) throw Conflict('An account with this email already exists');

    // Unique slug for the workspace.
    let base = slugify(data.workspaceName) || 'workspace';
    let slug = base;
    let n = 1;
    while (await prisma.organization.findUnique({ where: { slug } })) {
      slug = `${base}-${n++}`;
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email.toLowerCase(),
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
        },
      });

      const org = await tx.organization.create({
        data: { name: data.workspaceName, slug },
      });

      await tx.organizationMember.create({
        data: { userId: user.id, organizationId: org.id, role: OrgRole.OWNER },
      });

      // Default pipeline + stages (BRD §10.8)
      const pipeline = await tx.pipeline.create({
        data: { organizationId: org.id, name: 'Sales Pipeline', isDefault: true },
      });
      await tx.pipelineStage.createMany({
        data: DEFAULT_PIPELINE_STAGES.map((s) => ({
          pipelineId: pipeline.id,
          key: s.key,
          name: s.name,
          order: s.order,
          probability: s.probability,
        })),
      });

      // Trial subscription placeholder (BRD §15.2 future billing)
      await tx.subscription.create({ data: { organizationId: org.id, plan: 'TRIAL' } });

      return { user, org };
    });

    const token = signToken({
      sub: result.user.id,
      email: result.user.email,
      isSuperAdmin: result.user.isSuperAdmin,
    });

    res.status(201).json({
      token,
      user: publicUser(result.user),
      organizations: [
        {
          organizationId: result.org.id,
          organizationName: result.org.name,
          organizationSlug: result.org.slug,
          role: OrgRole.OWNER,
        },
      ],
    });
  })
);

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** POST /api/v1/auth/login */
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (!user) throw Unauthorized('Invalid email or password');

    const ok = await bcrypt.compare(data.password, user.passwordHash);
    if (!ok) throw Unauthorized('Invalid email or password');

    // If the account has 2FA enabled, return a short-lived challenge instead of
    // a full session token. The client completes login via /2fa/login-verify.
    if (user.twoFactorEnabled) {
      const jwt = (await import('jsonwebtoken')).default;
      const { config } = await import('../config.js');
      const challenge = jwt.sign({ sub: user.id, typ: '2fa' }, config.jwtSecret, { expiresIn: '5m' });
      return res.json({ twoFactorRequired: true, challenge });
    }

    const memberships = await prisma.organizationMember.findMany({
      where: { userId: user.id },
      include: { organization: true },
    });

    const token = signToken({ sub: user.id, email: user.email, isSuperAdmin: user.isSuperAdmin });

    res.json({
      token,
      user: publicUser(user),
      organizations: memberships.map((m) => ({
        organizationId: m.organizationId,
        organizationName: m.organization.name,
        organizationSlug: m.organization.slug,
        role: m.role,
      })),
    });
  })
);

/** GET /api/v1/auth/me — current user + memberships (for post-login redirect, BRD §10.2). */
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
    if (!user) throw Unauthorized();
    const memberships = await prisma.organizationMember.findMany({
      where: { userId: user.id },
      include: { organization: true },
    });
    res.json({
      user: publicUser(user),
      organizations: memberships.map((m) => ({
        organizationId: m.organizationId,
        organizationName: m.organization.name,
        organizationSlug: m.organization.slug,
        role: m.role,
      })),
    });
  })
);

function publicUser(u: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isSuperAdmin: boolean;
}) {
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    isSuperAdmin: u.isSuperAdmin,
  };
}

export default router;
