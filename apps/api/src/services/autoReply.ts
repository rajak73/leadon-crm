/**
 * Auto-reply rules engine (Instagram MVP Step 7). Admin-defined keyword rules
 * evaluated against an inbound message/comment's text, in priority order.
 * Reuses the existing outbound send pipeline (messaging.ts sendOutbound) —
 * the caller decides what to do with a REPLY/ASSIGN_HUMAN match.
 */
import { prisma } from '../prisma.js';

export interface AutoReplyRuleLike {
  id: string;
  keyword: string;
  matchType: string;
  caseInsensitive: boolean;
  action: string;
  replyTemplate: string | null;
}

function matches(rule: AutoReplyRuleLike, text: string): boolean {
  const haystack = rule.caseInsensitive ? text.toLowerCase() : text;
  const needle = rule.caseInsensitive ? rule.keyword.toLowerCase() : rule.keyword;
  if (!needle) return false;
  switch (rule.matchType) {
    case 'STARTS_WITH':
      return haystack.startsWith(needle);
    case 'ENDS_WITH':
      return haystack.endsWith(needle);
    case 'EXACT':
      return haystack.trim() === needle.trim();
    case 'CONTAINS':
    default:
      return haystack.includes(needle);
  }
}

/** Find the highest-priority active rule matching this text, or null. */
export async function matchAutoReplyRule(organizationId: string, text: string): Promise<AutoReplyRuleLike | null> {
  const rules = await prisma.autoReplyRule.findMany({
    where: { organizationId, isActive: true },
    orderBy: { priority: 'asc' },
  });
  return rules.find((r) => matches(r, text)) ?? null;
}
