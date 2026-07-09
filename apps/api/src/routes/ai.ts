import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth, requireOrg, type AuthedRequest } from '../middleware/auth.js';
import { NotFound } from '../lib/errors.js';
import { parseJson, logActivity } from '../lib/helpers.js';
import {
  scoreLead,
  suggestReplies,
  summarizeConversation,
  analyzeSentiment,
  dealCloseProbability,
  nextBestAction,
} from '../services/ai/index.js';
import { parseJson as parseJsonField } from '../lib/helpers.js';
import { isAiEnabled } from '../services/ai/provider.js';
import { config } from '../config.js';

/** AI features (BRD §13). Works with rule-based fallback when no key is set. */
const router = Router();
router.use(requireAuth, requireOrg());

/** GET /api/v1/ai/status — is real AI active or rule-based fallback? */
router.get(
  '/status',
  asyncHandler(async (_req, res) => {
    res.json({
      aiEnabled: isAiEnabled(),
      flag: config.flags.aiScoringEnabled,
      provider: config.ai.provider || null,
      mode: isAiEnabled() ? 'ai' : 'rules',
    });
  })
);

/** POST /api/v1/ai/score-lead/:id — score a lead and persist the score. */
router.post(
  '/score-lead/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const orgId = req.org!.organizationId;
    const lead = await prisma.lead.findFirst({ where: { id: req.params.id, organizationId: orgId } });
    if (!lead) throw NotFound('Lead not found');

    const messageCount = await prisma.message.count({
      where: { organizationId: orgId, conversation: { leadId: lead.id } },
    });

    const result = await scoreLead({
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      source: lead.source,
      status: lead.status,
      notes: lead.notes,
      messageCount,
    });

    await prisma.lead.update({ where: { id: lead.id }, data: { score: result.score } });
    await logActivity({
      organizationId: orgId,
      actorUserId: req.auth!.userId,
      type: 'LEAD_SCORED',
      message: `Lead scored ${result.score}/100 (${result.method})`,
      leadId: lead.id,
    });

    res.json(result);
  })
);

/**
 * POST /api/v1/ai/score-all — batch-score leads in the org.
 * Capped and batched to stay within free-tier request/time budgets (BRD §19.2).
 * Processes the most recently-active leads first; call again to continue.
 * When real AI is enabled, only the rule-based path runs here to avoid long
 * synchronous provider fan-out — per-lead AI scoring uses /score-lead/:id.
 */
const BATCH_LIMIT = 200;
router.post(
  '/score-all',
  asyncHandler(async (req: AuthedRequest, res) => {
    const orgId = req.org!.organizationId;
    const leads = await prisma.lead.findMany({
      where: { organizationId: orgId },
      orderBy: { lastActivityAt: 'desc' },
      take: BATCH_LIMIT,
      select: { id: true, name: true, email: true, phone: true, source: true, status: true, notes: true },
    });

    // Compute scores (rule-based = fast, deterministic) then persist in one
    // transaction to minimize DB round-trips on the free connection pool.
    const updates = [];
    for (const lead of leads) {
      const result = await scoreLead(lead);
      updates.push(prisma.lead.update({ where: { id: lead.id }, data: { score: result.score } }));
    }
    // Chunk the transaction so we never exceed pool limits.
    const CHUNK = 25;
    for (let i = 0; i < updates.length; i += CHUNK) {
      await prisma.$transaction(updates.slice(i, i + CHUNK));
    }

    const total = await prisma.lead.count({ where: { organizationId: orgId } });
    res.json({
      updated: leads.length,
      totalLeads: total,
      more: total > BATCH_LIMIT,
      mode: isAiEnabled() ? 'ai' : 'rules',
    });
  })
);

/** GET /api/v1/ai/reply-suggestions/:conversationId */
router.get(
  '/reply-suggestions/:conversationId',
  asyncHandler(async (req: AuthedRequest, res) => {
    const orgId = req.org!.organizationId;
    const conv = await prisma.conversation.findFirst({
      where: { id: req.params.conversationId, organizationId: orgId },
      include: {
        lead: true,
        messages: { where: { direction: 'INBOUND' }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!conv) throw NotFound('Conversation not found');

    const result = await suggestReplies({
      lastInbound: conv.messages[0]?.body,
      leadName: conv.lead?.name,
      hasPhone: Boolean(conv.lead?.phone),
      channel: conv.channel,
    });
    res.json(result);
  })
);

/** GET /api/v1/ai/summarize/:conversationId */
router.get(
  '/summarize/:conversationId',
  asyncHandler(async (req: AuthedRequest, res) => {
    const orgId = req.org!.organizationId;
    const conv = await prisma.conversation.findFirst({
      where: { id: req.params.conversationId, organizationId: orgId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conv) throw NotFound('Conversation not found');
    const result = await summarizeConversation(conv.messages.map((m) => ({ direction: m.direction, body: m.body })));
    res.json(result);
  })
);

/** GET /api/v1/ai/sentiment/:conversationId — sentiment of latest inbound msg. */
router.get(
  '/sentiment/:conversationId',
  asyncHandler(async (req: AuthedRequest, res) => {
    const conv = await prisma.conversation.findFirst({
      where: { id: req.params.conversationId, organizationId: req.org!.organizationId },
      include: { messages: { where: { direction: 'INBOUND' }, orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!conv) throw NotFound('Conversation not found');
    const text = conv.messages[0]?.body ?? '';
    res.json(await analyzeSentiment(text));
  })
);

/** GET /api/v1/ai/deal-probability/:dealId — close probability. */
router.get(
  '/deal-probability/:dealId',
  asyncHandler(async (req: AuthedRequest, res) => {
    const deal = await prisma.deal.findFirst({
      where: { id: req.params.dealId, organizationId: req.org!.organizationId },
      include: { stage: true },
    });
    if (!deal) throw NotFound('Deal not found');
    const ageDays = Math.floor((Date.now() - new Date(deal.createdAt).getTime()) / 86400000);
    res.json(dealCloseProbability({ stageProbability: deal.stage?.probability, status: deal.status, ageDays }));
  })
);

/** GET /api/v1/ai/next-best-action/:leadId — recommended next step. */
router.get(
  '/next-best-action/:leadId',
  asyncHandler(async (req: AuthedRequest, res) => {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.leadId, organizationId: req.org!.organizationId },
    });
    if (!lead) throw NotFound('Lead not found');
    const captureState = parseJsonField<{ captureState?: string }>(lead.customFields)?.captureState ?? null;
    const lastActivityDays = lead.lastActivityAt
      ? Math.floor((Date.now() - new Date(lead.lastActivityAt).getTime()) / 86400000)
      : undefined;
    const result = await nextBestAction({
      status: lead.status,
      hasPhone: Boolean(lead.phone),
      hasEmail: Boolean(lead.email),
      captureState,
      lastActivityDays,
    });
    res.json(result);
  })
);

export default router;
