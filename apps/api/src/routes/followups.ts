import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth, requireOrg, type AuthedRequest } from '../middleware/auth.js';
import { NotFound } from '../lib/errors.js';
import { OrgRole } from '@leados/shared';

/** Follow-up sequence rules ("no reply in Xh → send template") + execution log. */
const router = Router();
router.use(requireAuth, requireOrg());

/** GET /api/v1/follow-ups — list this org's rules. */
router.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const rules = await prisma.followUpRule.findMany({
      where: { organizationId: req.org!.organizationId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(rules);
  })
);

const ruleSchema = z.object({
  name: z.string().min(1).max(80),
  delayHours: z.number().int().min(1).max(720),
  template: z.string().min(1).max(1000),
  isActive: z.boolean().default(true),
});

/** POST /api/v1/follow-ups — create a rule (owner/admin). */
router.post(
  '/',
  requireOrg(OrgRole.OWNER, OrgRole.ADMIN),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = ruleSchema.parse(req.body);
    const rule = await prisma.followUpRule.create({
      data: { ...data, organizationId: req.org!.organizationId },
    });
    res.status(201).json(rule);
  })
);

/** PATCH /api/v1/follow-ups/:id — update/enable/disable a rule (owner/admin). */
router.patch(
  '/:id',
  requireOrg(OrgRole.OWNER, OrgRole.ADMIN),
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await prisma.followUpRule.findFirst({
      where: { id: req.params.id, organizationId: req.org!.organizationId },
    });
    if (!existing) throw NotFound('Follow-up rule not found');
    const data = ruleSchema.partial().parse(req.body);
    const rule = await prisma.followUpRule.update({ where: { id: existing.id }, data });
    res.json(rule);
  })
);

/** DELETE /api/v1/follow-ups/:id (owner/admin). */
router.delete(
  '/:id',
  requireOrg(OrgRole.OWNER, OrgRole.ADMIN),
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await prisma.followUpRule.findFirst({
      where: { id: req.params.id, organizationId: req.org!.organizationId },
    });
    if (!existing) throw NotFound('Follow-up rule not found');
    await prisma.followUpRule.delete({ where: { id: existing.id } });
    res.status(204).send();
  })
);

/** GET /api/v1/follow-ups/:id/executions — execution log for a rule. */
router.get(
  '/:id/executions',
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await prisma.followUpRule.findFirst({
      where: { id: req.params.id, organizationId: req.org!.organizationId },
    });
    if (!existing) throw NotFound('Follow-up rule not found');
    const executions = await prisma.followUpExecution.findMany({
      where: { ruleId: existing.id, organizationId: req.org!.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { conversation: { select: { customerName: true, externalId: true } } },
    });
    res.json(executions);
  })
);

export default router;
