/**
 * Follow-up sequence automation. Reuses the existing outbound send pipeline
 * (services/messaging.ts sendOutbound) and the existing cron trigger
 * (routes/cron.ts) — no new scheduler, just a periodic scan.
 *
 * Rule: "if a DM conversation's latest message is inbound and has sat
 * unanswered for >= rule.delayHours, send the rule's template." One
 * execution per (rule, conversation, triggering inbound message) — re-runs
 * are safe because a conversation only qualifies while its LATEST message is
 * still that same unanswered inbound one.
 */
import { prisma } from '../prisma.js';
import { sendOutbound } from './messaging.js';

export interface FollowUpRunSummary {
  evaluated: number;
  sent: number;
  failed: number;
}

export async function runDueFollowUps(): Promise<FollowUpRunSummary> {
  const summary: FollowUpRunSummary = { evaluated: 0, sent: 0, failed: 0 };

  const rules = await prisma.followUpRule.findMany({ where: { isActive: true } });
  if (rules.length === 0) return summary;

  // Group rules by org so we only fetch each org's connection status once.
  const rulesByOrg = new Map<string, typeof rules>();
  for (const rule of rules) {
    const list = rulesByOrg.get(rule.organizationId) ?? [];
    list.push(rule);
    rulesByOrg.set(rule.organizationId, list);
  }

  for (const [organizationId, orgRules] of rulesByOrg) {
    const instagramConnected = await prisma.integrationAccount.findFirst({
      where: { organizationId, provider: 'INSTAGRAM', isConnected: true },
    });

    for (const rule of orgRules) {
      const cutoff = new Date(Date.now() - rule.delayHours * 60 * 60 * 1000);

      // DM conversations in this org whose latest message is inbound and old enough.
      const candidates = await prisma.conversation.findMany({
        where: { organizationId, type: 'DM' },
        include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
      });

      for (const conv of candidates) {
        const last = conv.messages[0];
        if (!last || last.direction !== 'INBOUND' || last.createdAt > cutoff) continue;

        summary.evaluated++;

        // Already followed up for this exact inbound message on this rule?
        const already = await prisma.followUpExecution.findFirst({
          where: { ruleId: rule.id, conversationId: conv.id, createdAt: { gte: last.createdAt } },
        });
        if (already) continue;

        const result = await sendOutbound({
          organizationId,
          conversationId: conv.id,
          channel: conv.channel as any,
          body: rule.template,
          isSimulation: !instagramConnected,
        });

        await prisma.followUpExecution.create({
          data: {
            organizationId,
            ruleId: rule.id,
            conversationId: conv.id,
            leadId: conv.leadId,
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
