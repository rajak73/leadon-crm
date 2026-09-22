import type { LeadSource, LeadStatus, ScoringFactor } from '@leados/shared';
import { type LeadContext, type ScoreResult, clampScore } from './ai.types.js';

export const RULES_MODEL_VERSION = 'rules-v1';

const DAY = 24 * 60 * 60 * 1000;
const BASE_SCORE = 20;

const STATUS_POINTS: Partial<Record<LeadStatus, number>> = {
  CONTACTED: 5,
  QUALIFIED: 15,
  PROPOSAL: 20,
  NEGOTIATION: 25,
};
const SOURCE_POINTS: Partial<Record<LeadSource, number>> = {
  REFERRAL: 10,
  WEBSITE: 5,
  EVENT: 5,
  PHONE: 5,
  WHATSAPP: 3,
  INSTAGRAM: 3,
  FACEBOOK: 3,
  EMAIL: 3,
};
const HOT_TAGS = ['hot', 'vip', 'priority', 'interested', 'urgent', 'decision maker'];
const COLD_TAGS = ['cold', 'unresponsive', 'not interested', 'spam', 'junk'];

/** Deterministic, explainable scorer used when OpenAI isn't configured or fails. */
export function scoreWithRules(ctx: LeadContext): ScoreResult {
  const { lead, now } = ctx;
  const factors: ScoringFactor[] = [];
  let score = BASE_SCORE;
  const add = (points: number, description: string) => {
    score += points;
    factors.push({
      type: points >= 0 ? 'POSITIVE' : 'NEGATIVE',
      description: `${description} (${points >= 0 ? '+' : ''}${points})`,
    });
  };

  if (lead.status === 'WON') {
    return {
      score: 100,
      factors: [{ type: 'POSITIVE', description: 'Already converted to a customer' }],
      recommendation: 'Converted — focus on onboarding and account growth.',
      modelVersion: RULES_MODEL_VERSION,
    };
  }

  if (lead.email) add(15, 'Has an email address');
  else add(-5, 'No email address');
  if (lead.phone) add(10, 'Has a phone number');
  else add(-5, 'No phone number');
  if (lead.company) add(10, `Works at ${lead.company}`);

  const statusPoints = STATUS_POINTS[lead.status];
  if (statusPoints)
    add(statusPoints, `Status is ${lead.status.charAt(0)}${lead.status.slice(1).toLowerCase()}`);
  if (lead.status === 'LOST') add(-30, 'Marked as lost');

  const sourcePoints = SOURCE_POINTS[lead.source];
  if (sourcePoints)
    add(sourcePoints, `Came from ${lead.source.charAt(0)}${lead.source.slice(1).toLowerCase()}`);

  const last = lead.lastActivityAt;
  if (last && now.getTime() - last.getTime() <= 3 * DAY) add(10, 'Active in the last 3 days');
  else if (
    (!last || now.getTime() - last.getTime() > 30 * DAY) &&
    now.getTime() - lead.createdAt.getTime() > 14 * DAY
  ) {
    add(-10, 'No activity in over 30 days');
  }

  const engagements = ctx.activities.filter((a) =>
    ['NOTE_ADDED', 'TASK_COMPLETED', 'LEAD_STATUS_CHANGED'].includes(a.type),
  ).length;
  if (engagements >= 5) add(5, 'Frequent recent engagement');

  if (ctx.openDeals.length > 0) {
    add(15, `Has ${ctx.openDeals.length} open deal${ctx.openDeals.length === 1 ? '' : 's'}`);
    if (ctx.openDeals.some((d) => (d.value ?? 0) > 0)) add(5, 'Open deal has a value');
  }

  const tags = lead.tags.map((t) => t.toLowerCase());
  const hot = tags.find((t) => HOT_TAGS.includes(t));
  const cold = tags.find((t) => COLD_TAGS.includes(t));
  if (hot) add(10, `Tagged "${hot}"`);
  if (cold) add(-15, `Tagged "${cold}"`);

  const final = clampScore(score);
  return {
    score: final,
    factors,
    recommendation: recommendationFor(final, lead.status),
    modelVersion: RULES_MODEL_VERSION,
  };
}

export function recommendationFor(score: number, status: LeadStatus): string {
  if (status === 'LOST') return 'Marked as lost — revisit only if their situation changes.';
  if (score >= 70) return 'Hot lead — follow up within 4 hours.';
  if (score >= 40) return 'Warm lead — follow up within 24 hours.';
  return 'Cold lead — add to a nurture sequence and check back next week.';
}
