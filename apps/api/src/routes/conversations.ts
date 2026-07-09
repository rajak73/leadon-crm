import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth, requireOrg, type AuthedRequest } from '../middleware/auth.js';
import { NotFound } from '../lib/errors.js';
import { sendOutbound } from '../services/messaging.js';
import { Channel } from '@leados/shared';

/** Inbox & Conversations (BRD §10.10). */
const router = Router();
router.use(requireAuth, requireOrg());

const CHANNELS = Object.values(Channel) as [string, ...string[]];

/** GET /api/v1/conversations — conversation list with last message + source badge. */
router.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const conversations = await prisma.conversation.findMany({
      where: { organizationId: req.org!.organizationId },
      orderBy: { updatedAt: 'desc' },
      take: 100, // most recent 100 conversations (BRD §19.2)
      include: {
        lead: { select: { id: true, name: true, status: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    res.json(
      conversations.map((c) => ({
        id: c.id,
        channel: c.channel,
        customerName: c.customerName,
        lead: c.lead,
        lastMessage: c.messages[0] ?? null,
        updatedAt: c.updatedAt,
      }))
    );
  })
);

/** GET /api/v1/conversations/:id — full message thread. */
router.get(
  '/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const conversation = await prisma.conversation.findFirst({
      where: { id: req.params.id, organizationId: req.org!.organizationId },
      include: {
        lead: true,
        // Load the latest 200 messages (asc after slicing) to bound memory.
        messages: { orderBy: { createdAt: 'desc' }, take: 200 },
      },
    });
    if (!conversation) throw NotFound('Conversation not found');
    // Return messages in chronological order.
    conversation.messages.reverse();
    res.json(conversation);
  })
);

const replySchema = z.object({
  body: z.string().min(1),
  isSimulation: z.boolean().default(true),
});

/**
 * POST /api/v1/conversations/:id/reply — send an outbound reply.
 * Enforces BRD §11.3: simulation → SENT; real w/o creds → FAILED (safe).
 */
router.post(
  '/:id/reply',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { body, isSimulation } = replySchema.parse(req.body);
    const conversation = await prisma.conversation.findFirst({
      where: { id: req.params.id, organizationId: req.org!.organizationId },
    });
    if (!conversation) throw NotFound('Conversation not found');

    const result = await sendOutbound({
      organizationId: conversation.organizationId,
      conversationId: conversation.id,
      channel: conversation.channel as any,
      body,
      isSimulation,
    });
    await prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });

    res.status(result.status === 'FAILED' ? 502 : 201).json(result);
  })
);

const createSchema = z.object({
  channel: z.enum(CHANNELS).default('INTERNAL'),
  customerName: z.string().optional(),
  leadId: z.string().optional(),
});

/** POST /api/v1/conversations — create a manual/internal conversation. */
router.post(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = createSchema.parse(req.body);
    const conversation = await prisma.conversation.create({
      data: {
        organizationId: req.org!.organizationId,
        channel: data.channel,
        customerName: data.customerName || null,
        leadId: data.leadId || null,
      },
    });
    res.status(201).json(conversation);
  })
);

/**
 * POST /api/v1/conversations/:id/convert-to-lead
 * Conversation → lead mapping (BRD §10.10 "Lead creation option").
 */
router.post(
  '/:id/convert-to-lead',
  asyncHandler(async (req: AuthedRequest, res) => {
    const orgId = req.org!.organizationId;
    const conversation = await prisma.conversation.findFirst({
      where: { id: req.params.id, organizationId: orgId },
    });
    if (!conversation) throw NotFound('Conversation not found');

    if (conversation.leadId) {
      const existing = await prisma.lead.findUnique({ where: { id: conversation.leadId } });
      if (existing) return res.json(existing);
    }

    const lead = await prisma.lead.create({
      data: {
        organizationId: orgId,
        name: conversation.customerName || 'Unknown Contact',
        source: conversation.channel,
        status: 'NEW',
        lastActivityAt: new Date(),
      },
    });
    await prisma.conversation.update({ where: { id: conversation.id }, data: { leadId: lead.id } });
    res.status(201).json(lead);
  })
);

export default router;
