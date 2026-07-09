import { Router } from 'express';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth, requireOrg, type AuthedRequest } from '../middleware/auth.js';

/** Organization Admin dashboard (BRD §10.5). Scoped to the org in context. */
const router = Router();
router.use(requireAuth, requireOrg());

/** GET /api/v1/dashboard */
router.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const orgId = req.org!.organizationId;

    const [leadCount, dealCount, openTasks, contactCount, deals, recentActivities, wonDeals] =
      await Promise.all([
        prisma.lead.count({ where: { organizationId: orgId } }),
        prisma.deal.count({ where: { organizationId: orgId } }),
        prisma.task.count({ where: { organizationId: orgId, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
        prisma.contact.count({ where: { organizationId: orgId } }),
        prisma.deal.findMany({ where: { organizationId: orgId, status: 'OPEN' }, select: { value: true } }),
        prisma.activity.findMany({
          where: { organizationId: orgId },
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { actor: { select: { firstName: true, lastName: true } } },
        }),
        prisma.deal.findMany({ where: { organizationId: orgId, status: 'WON' }, select: { value: true } }),
      ]);

    const pipelineValue = deals.reduce((s, d) => s + (d.value ?? 0), 0);
    const wonValue = wonDeals.reduce((s, d) => s + (d.value ?? 0), 0);

    res.json({
      counts: {
        leads: leadCount,
        deals: dealCount,
        openTasks,
        contacts: contactCount,
      },
      pipelineValue,
      wonValue,
      recentActivities,
    });
  })
);

export default router;
