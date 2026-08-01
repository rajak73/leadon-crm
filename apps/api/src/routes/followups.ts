import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth, requireOrg, type AuthedRequest } from '../middleware/auth.js';
import { NotFound, BadRequest } from '../lib/errors.js';
import { OrgRole } from '@leados/shared';

/**
 * Follow-up sequences: an ordered list of steps ("no reply in Xh -> send
 * template", then "still no reply Yh after that -> send this other
 * template", ...) plus the execution log. See services/followup.ts for the
 * engine that actually advances a sequence.
 */
const router = Router();
router.use(requireAuth, requireOrg());

/** GET /api/v1/follow-ups — list this org's sequences with their steps. */
router.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const rules = await prisma.followUpRule.findMany({
      where: { organizationId: req.org!.organizationId },
      orderBy: { createdAt: 'desc' },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    res.json(rules);
  })
);

const stepSchema = z.object({
  delayHours: z.number().int().min(1).max(720),
  template: z.string().min(1).max(1000),
});
const ruleSchema = z.object({
  name: z.string().min(1).max(80),
  isActive: z.boolean().default(true),
  steps: z.array(stepSchema).min(1).max(5),
});

/** POST /api/v1/follow-ups — create a sequence (owner/admin). */
router.post(
  '/',
  requireOrg(OrgRole.OWNER, OrgRole.ADMIN),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { steps, ...ruleData } = ruleSchema.parse(req.body);
    const rule = await prisma.followUpRule.create({
      data: {
        ...ruleData,
        organizationId: req.org!.organizationId,
        // Legacy columns kept in sync with step 1 so old code paths reading
        // them directly (none left, but cheap insurance) see something sane.
        delayHours: steps[0].delayHours,
        template: steps[0].template,
        steps: { create: steps.map((s, i) => ({ stepOrder: i + 1, ...s })) },
      },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    res.status(201).json(rule);
  })
);

const updateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  isActive: z.boolean().optional(),
  steps: z.array(stepSchema).min(1).max(5).optional(),
});

/** PATCH /api/v1/follow-ups/:id — update a sequence (owner/admin). Sending
 * `steps` replaces the entire step list (simplest correct semantics for a
 * builder UI that always submits the full sequence). */
router.patch(
  '/:id',
  requireOrg(OrgRole.OWNER, OrgRole.ADMIN),
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await prisma.followUpRule.findFirst({
      where: { id: req.params.id, organizationId: req.org!.organizationId },
    });
    if (!existing) throw NotFound('Follow-up sequence not found');
    const { steps, ...ruleData } = updateSchema.parse(req.body);
    if (steps && steps.length === 0) throw BadRequest('A sequence needs at least one step');

    const rule = await prisma.$transaction(async (tx) => {
      if (steps) {
        await tx.followUpStep.deleteMany({ where: { ruleId: existing.id } });
        await tx.followUpStep.createMany({
          data: steps.map((s, i) => ({ ruleId: existing.id, stepOrder: i + 1, ...s })),
        });
      }
      return tx.followUpRule.update({
        where: { id: existing.id },
        data: {
          ...ruleData,
          ...(steps ? { delayHours: steps[0].delayHours, template: steps[0].template } : {}),
        },
        include: { steps: { orderBy: { stepOrder: 'asc' } } },
      });
    });
    res.json(rule);
  })
);

/** DELETE /api/v1/follow-ups/:id (owner/admin). Steps and execution log cascade. */
router.delete(
  '/:id',
  requireOrg(OrgRole.OWNER, OrgRole.ADMIN),
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await prisma.followUpRule.findFirst({
      where: { id: req.params.id, organizationId: req.org!.organizationId },
    });
    if (!existing) throw NotFound('Follow-up sequence not found');
    await prisma.followUpRule.delete({ where: { id: existing.id } });
    res.status(204).send();
  })
);

/** GET /api/v1/follow-ups/:id/executions — execution log for a sequence. */
router.get(
  '/:id/executions',
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await prisma.followUpRule.findFirst({
      where: { id: req.params.id, organizationId: req.org!.organizationId },
    });
    if (!existing) throw NotFound('Follow-up sequence not found');
    const executions = await prisma.followUpExecution.findMany({
      where: { ruleId: existing.id, organizationId: req.org!.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        conversation: { select: { customerName: true, externalId: true } },
        step: { select: { stepOrder: true } },
      },
    });
    res.json(executions);
  })
);

export default router;
