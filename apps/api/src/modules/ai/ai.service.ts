import type { AiScore, LeadSource, LeadStatus } from '@leados/shared';
import { recordActivity } from '../../lib/activity.js';
import { emit, on } from '../../lib/events.js';
import { notFound } from '../../lib/errors.js';
import { fullName } from '../../lib/labels.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { debounce } from '../../lib/queue.js';
import { asTags, toAiScore } from '../../lib/serializers.js';
import { notify } from '../notifications/index.js';
import { getSettings } from '../settings/index.js';
import { scoreWithLlm } from './ai.llm.js';
import { resolveProvider } from './ai.provider.js';
import { scoreWithRules } from './ai.rules.js';
import type { LeadContext, ScoreResult } from './ai.types.js';

export const AUTO_SCORE_DEBOUNCE_MS = 10_000;
export const HOT_SCORE = 70;

async function buildContext(leadId: string): Promise<LeadContext> {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, deletedAt: null } });
  if (!lead) throw notFound('lead');
  const [deals, activities] = await Promise.all([
    prisma.deal.findMany({
      where: { leadId, deletedAt: null, status: 'OPEN' },
      include: { stage: { select: { name: true } } },
      take: 10,
    }),
    prisma.activity.findMany({
      where: { relatedLeadId: leadId, type: { not: 'LEAD_SCORED' } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);
  return {
    lead: {
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone: lead.phone,
      company: lead.company,
      source: lead.source as LeadSource,
      status: lead.status as LeadStatus,
      tags: asTags(lead.tags),
      createdAt: lead.createdAt,
      lastActivityAt: lead.lastActivityAt,
    },
    openDeals: deals.map((d) => ({
      title: d.title,
      value: d.value,
      currency: d.currency,
      stageName: d.stage.name,
    })),
    activities: activities.map((a) => ({
      type: a.type,
      description: a.description,
      createdAt: a.createdAt,
    })),
    now: new Date(),
  };
}

/** The configured AI provider, otherwise (or on any failure/timeout) the deterministic rules scorer. */
async function computeScore(ctx: LeadContext): Promise<ScoreResult> {
  if (resolveProvider().provider !== 'rules') {
    try {
      return await scoreWithLlm(ctx);
    } catch (err) {
      logger.warn({ err }, 'AI scoring failed; using the rules scorer');
    }
  }
  return scoreWithRules(ctx);
}

export async function scoreLead(
  leadId: string,
  triggeredBy: AiScore['triggeredBy'],
  depth = 0,
): Promise<AiScore> {
  const ctx = await buildContext(leadId);
  const result = await computeScore(ctx);

  const { saved, previousScore, firstTimeHot, assignedToId, name } = await prisma.$transaction(
    async (tx) => {
      const lead = await tx.lead.findUniqueOrThrow({ where: { id: leadId } });
      const priorHot = await tx.aiScore.count({ where: { leadId, score: { gte: HOT_SCORE } } });
      const saved = await tx.aiScore.create({
        data: {
          leadId,
          score: result.score,
          factors: result.factors as unknown as object[],
          recommendation: result.recommendation,
          modelVersion: result.modelVersion,
          triggeredBy,
        },
      });
      await tx.lead.update({
        where: { id: leadId },
        data: { aiScore: result.score, aiScoreUpdatedAt: saved.createdAt },
      });
      await recordActivity(tx, {
        type: 'LEAD_SCORED',
        description:
          lead.aiScore === null
            ? `AI score set to ${result.score}`
            : `AI score changed from ${lead.aiScore} to ${result.score}`,
        metadata: {
          score: result.score,
          previous: lead.aiScore,
          modelVersion: result.modelVersion,
          triggeredBy,
        },
        performedById: null,
        leadId,
        touch: false, // scoring isn't engagement
      });
      return {
        saved,
        previousScore: lead.aiScore,
        firstTimeHot: result.score >= HOT_SCORE && priorHot === 0,
        assignedToId: lead.assignedToId,
        name: fullName(lead),
      };
    },
  );

  if (firstTimeHot && assignedToId) {
    await notify({
      userId: assignedToId,
      type: 'LEAD_SCORED',
      title: `${name} is a hot lead (${result.score})`,
      body: result.recommendation,
      entityType: 'lead',
      entityId: leadId,
    });
  }
  emit({ type: 'lead.scored', leadId, score: result.score, previousScore, depth });
  return toAiScore(saved);
}

export async function listScores(leadId: string): Promise<AiScore[]> {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, deletedAt: null },
    select: { id: true },
  });
  if (!lead) throw notFound('lead');
  const rows = await prisma.aiScore.findMany({
    where: { leadId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return rows.map(toAiScore);
}

function scheduleAutoScore(leadId: string, depth: number): Promise<void> {
  return getSettings().then((s) => {
    if (!s.aiScoringAuto) return;
    debounce(`ai-score:${leadId}`, AUTO_SCORE_DEBOUNCE_MS, 'ai.auto-score', async () => {
      const exists = await prisma.lead.count({ where: { id: leadId, deletedAt: null } });
      if (exists) await scoreLead(leadId, 'auto', depth);
    });
  });
}

/** Rescores leads (debounced per lead) after create, status change and new notes. */
export function registerAiSubscribers(): void {
  on('lead.created', 'ai-auto-score', async (e) => {
    if (!e.imported) await scheduleAutoScore(e.leadId, e.depth);
  });
  on('lead.status_changed', 'ai-auto-score', (e) => scheduleAutoScore(e.leadId, e.depth));
  on('note.created', 'ai-auto-score', async (e) => {
    if (e.leadId) await scheduleAutoScore(e.leadId, e.depth);
  });
}
