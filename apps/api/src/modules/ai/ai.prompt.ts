import type { LeadContext } from './ai.types.js';

export const SYSTEM_PROMPT =
  'You are an experienced B2B/B2C sales assistant for a small business CRM. You score leads so ' +
  'sales reps know whom to follow up with first. Be concise, concrete and base every factor on the data given. ' +
  'Always answer with a single JSON object and nothing else.';

/** The user message: lead fields, tags, open deals and the last 20 activities. */
export function buildScoringPrompt(ctx: LeadContext): string {
  const { lead } = ctx;
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ');
  const deals = ctx.openDeals.length
    ? ctx.openDeals
        .map((d) => `- ${d.title} — ${d.value ?? 'no value'} ${d.currency}, stage: ${d.stageName}`)
        .join('\n')
    : 'None';
  const activities = ctx.activities.length
    ? ctx.activities
        .map((a) => `- [${a.createdAt.toISOString()}] (${a.type}) ${a.description}`)
        .join('\n')
    : 'No activity recorded yet.';

  return `Score this lead from 0 to 100 for how likely it is to convert soon (higher = more likely).

LEAD
- Name: ${name}
- Company: ${lead.company ?? 'Not provided'}
- Email: ${lead.email ? 'Provided' : 'Not provided'}
- Phone: ${lead.phone ? 'Provided' : 'Not provided'}
- Source: ${lead.source}
- Status: ${lead.status}
- Tags: ${lead.tags.length ? lead.tags.join(', ') : 'None'}
- Created: ${lead.createdAt.toISOString()}
- Last activity: ${lead.lastActivityAt?.toISOString() ?? 'Never'}
- Current date: ${ctx.now.toISOString()}

OPEN DEALS
${deals}

RECENT ACTIVITY (newest first)
${activities}

INSTRUCTIONS
1. Give an integer score from 0 to 100.
2. List 2–6 factors. Each factor is POSITIVE or NEGATIVE with a short description a sales rep would understand, e.g. "Referred by an existing customer" or "No reply in 10 days".
3. Give one short, actionable recommendation, e.g. "Call today — they asked for pricing yesterday."

Respond with JSON exactly in this shape:
{"score": 0-100, "factors": [{"type": "POSITIVE" | "NEGATIVE", "description": "..."}], "recommendation": "..."}`;
}
