import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth, requireOrg, type AuthedRequest } from '../middleware/auth.js';
import { NotFound, BadRequest } from '../lib/errors.js';
import { OrgRole } from '@leados/shared';

/** Auto-reply keyword rules (Instagram MVP Step 7): contains/starts/ends/exact match → reply or assign human. */
const router = Router();
router.use(requireAuth, requireOrg());

/** GET /api/v1/auto-reply-rules */
router.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const rules = await prisma.autoReplyRule.findMany({
      where: { organizationId: req.org!.organizationId },
      orderBy: { priority: 'asc' },
    });
    res.json(rules);
  })
);

const ruleSchema = z
  .object({
    name: z.string().min(1).max(80),
    keyword: z.string().min(1).max(200),
    matchType: z.enum(['CONTAINS', 'STARTS_WITH', 'ENDS_WITH', 'EXACT']).default('CONTAINS'),
    caseInsensitive: z.boolean().default(true),
    action: z.enum(['REPLY', 'ASSIGN_HUMAN']).default('REPLY'),
    replyTemplate: z.string().max(1000).optional(),
    priority: z.number().int().min(0).max(1000).default(0),
    isActive: z.boolean().default(true),
  })
  .refine((d) => d.action !== 'REPLY' || Boolean(d.replyTemplate?.trim()), {
    message: 'replyTemplate is required when action is REPLY',
    path: ['replyTemplate'],
  });

/** POST /api/v1/auto-reply-rules — create a rule (owner/admin). */
router.post(
  '/',
  requireOrg(OrgRole.OWNER, OrgRole.ADMIN),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = ruleSchema.parse(req.body);
    const rule = await prisma.autoReplyRule.create({
      data: { ...data, replyTemplate: data.replyTemplate ?? null, organizationId: req.org!.organizationId },
    });
    res.status(201).json(rule);
  })
);

const updateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  keyword: z.string().min(1).max(200).optional(),
  matchType: z.enum(['CONTAINS', 'STARTS_WITH', 'ENDS_WITH', 'EXACT']).optional(),
  caseInsensitive: z.boolean().optional(),
  action: z.enum(['REPLY', 'ASSIGN_HUMAN']).optional(),
  replyTemplate: z.string().max(1000).optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  isActive: z.boolean().optional(),
});

/** PATCH /api/v1/auto-reply-rules/:id — update/enable/disable a rule (owner/admin). */
router.patch(
  '/:id',
  requireOrg(OrgRole.OWNER, OrgRole.ADMIN),
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await prisma.autoReplyRule.findFirst({
      where: { id: req.params.id, organizationId: req.org!.organizationId },
    });
    if (!existing) throw NotFound('Auto-reply rule not found');
    const data = updateSchema.parse(req.body);
    const nextAction = data.action ?? existing.action;
    const nextTemplate = data.replyTemplate ?? existing.replyTemplate;
    if (nextAction === 'REPLY' && !nextTemplate?.trim()) {
      throw BadRequest('replyTemplate is required when action is REPLY');
    }
    const rule = await prisma.autoReplyRule.update({ where: { id: existing.id }, data });
    res.json(rule);
  })
);

/** DELETE /api/v1/auto-reply-rules/:id (owner/admin). */
router.delete(
  '/:id',
  requireOrg(OrgRole.OWNER, OrgRole.ADMIN),
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await prisma.autoReplyRule.findFirst({
      where: { id: req.params.id, organizationId: req.org!.organizationId },
    });
    if (!existing) throw NotFound('Auto-reply rule not found');
    await prisma.autoReplyRule.delete({ where: { id: existing.id } });
    res.status(204).send();
  })
);

export default router;
