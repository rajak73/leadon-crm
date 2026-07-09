import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth, requireOrg, type AuthedRequest } from '../middleware/auth.js';
import { getSubscription, getUsage, changePlan, isStripeLive } from '../services/billing.js';
import { PLANS, Plan, planLimit } from '@leados/shared';
import { OrgRole } from '@leados/shared';

/** Billing & subscriptions (BRD §15.2). */
const router = Router();

/** GET /api/v1/billing/plans — public plan catalog. */
router.get(
  '/plans',
  asyncHandler(async (_req, res) => {
    res.json({ plans: Object.values(PLANS), stripeLive: isStripeLive() });
  })
);

router.use(requireAuth, requireOrg());

/** GET /api/v1/billing/subscription — current plan + usage vs limits. */
router.get(
  '/subscription',
  asyncHandler(async (req: AuthedRequest, res) => {
    const orgId = req.org!.organizationId;
    const sub = await getSubscription(orgId);
    const usage = await getUsage(orgId);
    const def = PLANS[(sub.plan as Plan)] ?? PLANS.TRIAL;
    res.json({
      plan: sub.plan,
      status: sub.status,
      planDef: def,
      usage,
      limits: {
        leads: planLimit(sub.plan, 'leads'),
        members: planLimit(sub.plan, 'members'),
        deals: planLimit(sub.plan, 'deals'),
      },
      mode: isStripeLive() ? 'stripe' : 'mock',
    });
  })
);

const changeSchema = z.object({ plan: z.enum(Object.values(Plan) as [string, ...string[]]) });

/** POST /api/v1/billing/change-plan — owner/admin only. */
router.post(
  '/change-plan',
  requireOrg(OrgRole.OWNER, OrgRole.ADMIN),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { plan } = changeSchema.parse(req.body);
    const result = await changePlan(req.org!.organizationId, plan as Plan);
    res.json(result);
  })
);

export default router;
