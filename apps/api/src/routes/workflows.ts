import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth, requireOrg, type AuthedRequest } from '../middleware/auth.js';
import { NotFound } from '../lib/errors.js';
import { OrgRole } from '@leados/shared';

/**
 * Workflows / automation (BRD §8.1, §17). Simple trigger → action rules, e.g.
 * "when a lead reaches status QUALIFIED, create a follow-up task". Execution is
 * evaluated by runWorkflows() (see services/workflow-engine) on lead changes.
 *
 * In free mode workflows run inline on the triggering request (no paid worker
 * needed); when REDIS_URL is set they could be offloaded to the worker.
 */
const router = Router();
router.use(requireAuth, requireOrg());

const definitionSchema = z.object({
  trigger: z.object({
    event: z.enum(['LEAD_STATUS_CHANGED', 'LEAD_CREATED']),
    status: z.string().optional(), // for LEAD_STATUS_CHANGED
  }),
  action: z.object({
    type: z.enum(['CREATE_TASK', 'SET_LEAD_SCORE']),
    taskTitle: z.string().optional(),
    taskPriority: z.string().optional(),
    score: z.number().int().min(0).max(100).optional(),
  }),
});

const createSchema = z.object({
  name: z.string().min(1),
  isActive: z.boolean().default(true),
  definition: definitionSchema,
});

/** GET /api/v1/workflows */
router.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const workflows = await prisma.workflow.findMany({
      where: { organizationId: req.org!.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(
      workflows.map((w) => ({
        id: w.id,
        name: w.name,
        isActive: w.isActive,
        definition: w.definition ? JSON.parse(w.definition) : null,
        createdAt: w.createdAt,
      }))
    );
  })
);

/** POST /api/v1/workflows (owner/admin) */
router.post(
  '/',
  requireOrg(OrgRole.OWNER, OrgRole.ADMIN),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = createSchema.parse(req.body);
    const workflow = await prisma.workflow.create({
      data: {
        organizationId: req.org!.organizationId,
        name: data.name,
        isActive: data.isActive,
        definition: JSON.stringify(data.definition),
      },
    });
    res.status(201).json({ ...workflow, definition: data.definition });
  })
);

/** PATCH /api/v1/workflows/:id (toggle active / rename) */
router.patch(
  '/:id',
  requireOrg(OrgRole.OWNER, OrgRole.ADMIN),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = z.object({ name: z.string().optional(), isActive: z.boolean().optional() }).parse(req.body);
    const existing = await prisma.workflow.findFirst({
      where: { id: req.params.id, organizationId: req.org!.organizationId },
    });
    if (!existing) throw NotFound('Workflow not found');
    const updated = await prisma.workflow.update({
      where: { id: existing.id },
      data: { ...(body.name !== undefined ? { name: body.name } : {}), ...(body.isActive !== undefined ? { isActive: body.isActive } : {}) },
    });
    res.json(updated);
  })
);

/** DELETE /api/v1/workflows/:id */
router.delete(
  '/:id',
  requireOrg(OrgRole.OWNER, OrgRole.ADMIN),
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await prisma.workflow.findFirst({
      where: { id: req.params.id, organizationId: req.org!.organizationId },
    });
    if (!existing) throw NotFound('Workflow not found');
    await prisma.workflow.delete({ where: { id: existing.id } });
    res.status(204).send();
  })
);

export default router;
