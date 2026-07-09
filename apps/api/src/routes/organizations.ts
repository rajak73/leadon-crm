import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth, requireOrg, type AuthedRequest } from '../middleware/auth.js';
import { BadRequest, Conflict, NotFound } from '../lib/errors.js';
import { assertWithinLimit } from '../services/billing.js';
import { auditFromReq } from '../services/audit.js';
import { ORG_ROLES, OrgRole, validatePassword } from '@leados/shared';

const router = Router();
router.use(requireAuth);

/** GET /api/v1/organizations — organizations the current user belongs to. */
router.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const memberships = await prisma.organizationMember.findMany({
      where: { userId: req.auth!.userId },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json(
      memberships.map((m) => ({
        organizationId: m.organizationId,
        organizationName: m.organization.name,
        organizationSlug: m.organization.slug,
        status: m.organization.status,
        role: m.role,
      }))
    );
  })
);

/** GET /api/v1/organizations/current — details of the org in context (any member). */
router.get(
  '/current',
  requireOrg(),
  asyncHandler(async (req: AuthedRequest, res) => {
    const org = await prisma.organization.findUnique({
      where: { id: req.org!.organizationId },
    });
    if (!org) throw NotFound('Organization not found');
    res.json({ ...org, myRole: req.org!.role });
  })
);

/** GET /api/v1/organizations/members — list team members (any member). */
router.get(
  '/members',
  requireOrg(),
  asyncHandler(async (req: AuthedRequest, res) => {
    const members = await prisma.organizationMember.findMany({
      where: { organizationId: req.org!.organizationId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json(
      members.map((m) => ({
        id: m.id,
        userId: m.userId,
        firstName: m.user.firstName,
        lastName: m.user.lastName,
        email: m.user.email,
        role: m.role,
        joinedAt: m.createdAt,
      }))
    );
  })
);

const addMemberSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  password: z.string(),
  role: z.enum(ORG_ROLES as [string, ...string[]]),
});

/**
 * POST /api/v1/organizations/members — add a team member (BRD §9.2 owner/admin).
 * Creates the user if new, then attaches membership with the given role.
 */
router.post(
  '/members',
  requireOrg(OrgRole.OWNER, OrgRole.ADMIN),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = addMemberSchema.parse(req.body);
    const orgId = req.org!.organizationId;
    await assertWithinLimit(orgId, 'members'); // BRD §19.3

    let user = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (!user) {
      const pw = validatePassword(data.password);
      if (!pw.valid) throw BadRequest('Weak password', pw.errors);
      user = await prisma.user.create({
        data: {
          email: data.email.toLowerCase(),
          passwordHash: await bcrypt.hash(data.password, 10),
          firstName: data.firstName,
          lastName: data.lastName,
        },
      });
    }

    const existing = await prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId: orgId } },
    });
    if (existing) throw Conflict('User is already a member of this organization');

    const member = await prisma.organizationMember.create({
      data: { userId: user.id, organizationId: orgId, role: data.role },
      include: { user: true },
    });
    await auditFromReq(req, 'MEMBER_ADDED', { entityType: 'Member', entityId: member.id, metadata: { email: member.user.email, role: member.role } });

    res.status(201).json({
      id: member.id,
      userId: member.userId,
      firstName: member.user.firstName,
      lastName: member.user.lastName,
      email: member.user.email,
      role: member.role,
    });
  })
);

const updateRoleSchema = z.object({ role: z.enum(ORG_ROLES as [string, ...string[]]) });

/** PATCH /api/v1/organizations/members/:memberId — change a member's role. */
router.patch(
  '/members/:memberId',
  requireOrg(OrgRole.OWNER, OrgRole.ADMIN),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { role } = updateRoleSchema.parse(req.body);
    const member = await prisma.organizationMember.findFirst({
      where: { id: req.params.memberId, organizationId: req.org!.organizationId },
    });
    if (!member) throw NotFound('Member not found');
    const updated = await prisma.organizationMember.update({
      where: { id: member.id },
      data: { role },
    });
    await auditFromReq(req, 'MEMBER_ROLE_CHANGED', {
      entityType: 'Member', entityId: member.id, metadata: { from: member.role, to: role, userId: member.userId },
    });
    res.json(updated);
  })
);

export default router;
