import { Router } from 'express';
import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma.js';
import { config } from '../config.js';
import { asyncHandler } from '../middleware/error.js';
import { signToken } from '../lib/jwt.js';
import { isSsoConfigured, getGoogleLoginUrl, exchangeCodeForProfile } from '../services/sso.js';
import { slugify, OrgRole, DEFAULT_PIPELINE_STAGES } from '@leados/shared';
import { recordAudit } from '../services/audit.js';

/**
 * Google SSO login. /status reports availability; /google starts the flow;
 * /google/callback completes it — linking or creating a user, creating a
 * workspace for brand-new users, and redirecting back to the web app with a
 * one-time token in the URL fragment.
 */
const router = Router();

/** GET /api/v1/sso/status */
router.get('/status', (_req, res) => {
  res.json({ google: isSsoConfigured() });
});

/** GET /api/v1/sso/google — redirect to Google's consent screen. */
router.get(
  '/google',
  asyncHandler(async (_req: Request, res: Response) => {
    if (!isSsoConfigured()) return res.status(400).json({ error: 'SSO not configured' });
    const state = jwt.sign({ n: crypto.randomBytes(8).toString('hex'), typ: 'sso' }, config.jwtSecret, { expiresIn: '10m' });
    return res.redirect(getGoogleLoginUrl(state)!);
  })
);

/** GET /api/v1/sso/google/callback */
router.get(
  '/google/callback',
  asyncHandler(async (req: Request, res: Response) => {
    const code = String(req.query.code ?? '');
    const state = String(req.query.state ?? '');
    if (!code || !state) return res.status(400).send('Missing code/state');
    try {
      const decoded = jwt.verify(state, config.jwtSecret) as any;
      if (decoded.typ !== 'sso') throw new Error('bad state');
    } catch {
      return res.status(400).send('Invalid state');
    }

    const profile = await exchangeCodeForProfile(code);

    // Find by googleId, else by email (link existing account), else create.
    let user = await prisma.user.findFirst({ where: { googleId: profile.googleId } });
    if (!user) {
      const byEmail = await prisma.user.findUnique({ where: { email: profile.email } });
      if (byEmail) {
        user = await prisma.user.update({
          where: { id: byEmail.id },
          data: { googleId: profile.googleId, avatarUrl: profile.avatarUrl ?? byEmail.avatarUrl },
        });
      } else {
        // Brand-new SSO user → create user + a starter workspace.
        const randomHash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
        const wsName = `${profile.firstName}'s Workspace`;
        let base = slugify(wsName) || 'workspace';
        let slug = base;
        let n = 1;
        while (await prisma.organization.findUnique({ where: { slug } })) slug = `${base}-${n++}`;

        user = await prisma.$transaction(async (tx) => {
          const u = await tx.user.create({
            data: {
              email: profile.email,
              passwordHash: randomHash,
              firstName: profile.firstName,
              lastName: profile.lastName || '-',
              googleId: profile.googleId,
              avatarUrl: profile.avatarUrl,
            },
          });
          const org = await tx.organization.create({ data: { name: wsName, slug } });
          await tx.organizationMember.create({ data: { userId: u.id, organizationId: org.id, role: OrgRole.OWNER } });
          const pipeline = await tx.pipeline.create({ data: { organizationId: org.id, name: 'Sales Pipeline', isDefault: true } });
          await tx.pipelineStage.createMany({
            data: DEFAULT_PIPELINE_STAGES.map((s) => ({ pipelineId: pipeline.id, key: s.key, name: s.name, order: s.order, probability: s.probability })),
          });
          await tx.subscription.create({ data: { organizationId: org.id, plan: 'TRIAL' } });
          return u;
        });
      }
    }

    const token = signToken({ sub: user.id, email: user.email, isSuperAdmin: user.isSuperAdmin });

    const firstMembership = await prisma.organizationMember.findFirst({ where: { userId: user.id } });
    if (firstMembership) {
      await recordAudit({ organizationId: firstMembership.organizationId, actorUserId: user.id, actorEmail: user.email, action: 'SSO_LOGIN', ip: req.ip });
    }

    // Redirect back to the web app with the token in the fragment (not logged).
    const web = config.webOrigin === '*' ? 'http://localhost:5173' : config.webOrigin.split(',')[0];
    return res.redirect(`${web}/sso-callback#token=${encodeURIComponent(token)}`);
  })
);

export default router;
