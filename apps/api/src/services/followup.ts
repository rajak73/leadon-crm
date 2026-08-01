/**
 * Follow-up sequence automation. Reuses the existing outbound send pipeline
 * (services/messaging.ts sendOutbound) and the existing cron trigger
 * (routes/cron.ts) — no new scheduler, just a periodic scan.
 *
 * A rule is a sequence of ordered FollowUpSteps. Step 1 fires `delayHours`
 * after the customer's last inbound message; step 2 fires `delayHours`
 * after step 1 actually fired; and so on — each step waits on the previous
 * one, not on the original message. A sequence advances to its next step
 * only while the customer hasn't been genuinely replied to: if a real reply
 * (agent, keyword auto-reply, or AI auto-reply — anything that isn't one of
 * this sequence's own follow-up messages) went out after their last inbound
 * message, or if they've sent a newer message we haven't looked at yet, the
 * sequence stops advancing until that changes.
 */
import { prisma } from '../prisma.js';
import { sendOutbound } from './messaging.js';
import { logger } from '../lib/logger.js';

export interface FollowUpRunSummary {
  evaluated: number;
  sent: number;
  failed: number;
}

/**
 * One-time, idempotent catch-up for rules created before multi-step
 * sequences existed: any FollowUpRule with zero steps gets a single step
 * built from its own (now-deprecated) delayHours/template columns, so
 * existing follow-up rules keep working unchanged after this upgrade.
 * Safe to call on every boot — a rule with steps already is left alone.
 */
export async function migrateLegacyFollowUpRules(): Promise<void> {
  const orphans = await prisma.followUpRule.findMany({
    where: { steps: { none: {} } },
  });
  for (const rule of orphans) {
    await prisma.followUpStep.create({
      data: { ruleId: rule.id, stepOrder: 1, delayHours: rule.delayHours, template: rule.template },
    });
  }
  if (orphans.length > 0) {
    logger.info('followup_legacy_rules_migrated', { count: orphans.length });
  }
}

export async function runDueFollowUps(): Promise<FollowUpRunSummary> {
  const summary: FollowUpRunSummary = { evaluated: 0, sent: 0, failed: 0 };

  const rules = await prisma.followUpRule.findMany({
    where: { isActive: true },
    include: { steps: { orderBy: { stepOrder: 'asc' } } },
  });
  const activeRules = rules.filter((r) => r.steps.length > 0);
  if (activeRules.length === 0) return summary;

  // Group rules by org so we only fetch each org's connection status once.
  const rulesByOrg = new Map<string, typeof activeRules>();
  for (const rule of activeRules) {
    const list = rulesByOrg.get(rule.organizationId) ?? [];
    list.push(rule);
    rulesByOrg.set(rule.organizationId, list);
  }

  for (const [organizationId, orgRules] of rulesByOrg) {
    const instagramConnected = await prisma.integrationAccount.findFirst({
      where: { organizationId, provider: 'INSTAGRAM', isConnected: true },
    });

    // DM conversations in this org whose latest message is inbound — a
    // genuine outbound reply (anything not from a follow-up execution)
    // always means "answered," so only these are even candidates.
    const conversations = await prisma.conversation.findMany({
      where: { organizationId, type: 'DM' },
      // The customer's most recent inbound message specifically — NOT just
      // "the latest message, if it happens to be inbound". Once step 1
      // sends its own outbound follow-up, that becomes the conversation's
      // newest message overall, which would wrongly hide the customer's
      // last inbound message from every later step if we queried "latest
      // message" instead.
      include: { messages: { where: { direction: 'INBOUND' }, orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    for (const rule of orgRules) {
      for (const conv of conversations) {
        const lastInbound = conv.messages[0];
        if (!lastInbound) continue;

        summary.evaluated++;

        // Every execution this rule has already fired for this conversation
        // since the triggering inbound message — tells us which step is
        // next, and anchors that step's delay to when the previous one fired.
        const priorExecutions = await prisma.followUpExecution.findMany({
          where: { ruleId: rule.id, conversationId: conv.id, createdAt: { gte: lastInbound.createdAt } },
          orderBy: { createdAt: 'asc' },
        });
        if (priorExecutions.length >= rule.steps.length) continue; // sequence complete for this inbound cycle

        // If a genuine reply (not one of our own follow-up messages) went
        // out after the last inbound message, the customer's been helped —
        // don't advance the sequence.
        const ownMessageIds = priorExecutions.map((e) => e.messageId).filter((id): id is string => !!id);
        const genuineReply = await prisma.message.findFirst({
          where: {
            conversationId: conv.id,
            direction: 'OUTBOUND',
            createdAt: { gt: lastInbound.createdAt },
            ...(ownMessageIds.length > 0 ? { id: { notIn: ownMessageIds } } : {}),
          },
        });
        if (genuineReply) continue;

        const step = rule.steps[priorExecutions.length];
        const anchor = priorExecutions.length === 0 ? lastInbound.createdAt : priorExecutions[priorExecutions.length - 1].createdAt;
        const dueAt = new Date(anchor.getTime() + step.delayHours * 60 * 60 * 1000);
        if (dueAt > new Date()) continue;

        const result = await sendOutbound({
          organizationId,
          conversationId: conv.id,
          channel: conv.channel as any,
          body: step.template,
          isSimulation: !instagramConnected,
        });

        await prisma.followUpExecution.create({
          data: {
            organizationId,
            ruleId: rule.id,
            stepId: step.id,
            conversationId: conv.id,
            leadId: conv.leadId,
            messageId: result.messageId,
            status: result.status === 'SENT' ? 'SENT' : 'FAILED',
            detail: result.reason ?? null,
          },
        });

        if (result.status === 'SENT') summary.sent++;
        else summary.failed++;
      }
    }
  }

  return summary;
}
