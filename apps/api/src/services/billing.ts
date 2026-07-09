/**
 * Billing service (BRD §15.2). Stripe-ready but runs in a safe MOCK mode when
 * STRIPE_SECRET_KEY is not configured — plan changes are recorded locally so
 * the product works end-to-end without a live Stripe account. Usage limits
 * (BRD §19.3) are enforced per plan.
 */
import { prisma } from '../prisma.js';
import { config } from '../config.js';
import { PLANS, planLimit, type Plan } from '@leados/shared';
import { HttpError } from '../lib/errors.js';

export function isStripeLive(): boolean {
  return Boolean(config.billing.stripeSecretKey);
}

/** Current subscription for an org (creates a TRIAL if missing). */
export async function getSubscription(organizationId: string) {
  let sub = await prisma.subscription.findUnique({ where: { organizationId } });
  if (!sub) {
    sub = await prisma.subscription.create({ data: { organizationId, plan: 'TRIAL' } });
  }
  return sub;
}

/** Change plan. In mock mode, applies immediately. */
export async function changePlan(organizationId: string, plan: Plan) {
  if (!PLANS[plan]) throw new HttpError(400, 'Unknown plan');
  await getSubscription(organizationId);

  // Live Stripe would create/update a Checkout Session / Subscription here and
  // apply the plan on webhook confirmation. Mock mode applies directly.
  const updated = await prisma.subscription.update({
    where: { organizationId },
    data: { plan, status: 'ACTIVE' },
  });
  return { subscription: updated, mode: isStripeLive() ? 'stripe' : 'mock' };
}

/** Current usage counts for an org. */
export async function getUsage(organizationId: string) {
  const [leads, members, deals] = await Promise.all([
    prisma.lead.count({ where: { organizationId } }),
    prisma.organizationMember.count({ where: { organizationId } }),
    prisma.deal.count({ where: { organizationId } }),
  ]);
  return { leads, members, deals };
}

/**
 * Throws 402 if creating one more of `resource` would exceed the plan limit
 * (BRD §19.3). -1 limit = unlimited. Disabled if ENFORCE_PLAN_LIMITS=false.
 */
export async function assertWithinLimit(
  organizationId: string,
  resource: 'leads' | 'members' | 'deals'
) {
  if (!config.billing.enforceLimits) return;
  const sub = await getSubscription(organizationId);
  const limit = planLimit(sub.plan, resource);
  if (limit < 0) return; // unlimited

  const usage = await getUsage(organizationId);
  if (usage[resource] >= limit) {
    throw new HttpError(
      402,
      `Plan limit reached for ${resource} (${limit}). Upgrade your plan to add more.`,
      { resource, limit, current: usage[resource], plan: sub.plan }
    );
  }
}
