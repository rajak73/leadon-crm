import { Router } from 'express';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth, requireOrg, type AuthedRequest } from '../middleware/auth.js';

/** Instagram Inbox dashboard — connection health + today's activity. */
const router = Router();
router.use(requireAuth, requireOrg());

/** GET /api/v1/dashboard */
router.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const orgId = req.org!.organizationId;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      instagramAccount,
      todayDMs,
      todayComments,
      todayLeads,
      recentInboundDMs,
      recentConversations,
      lastWebhookEvent,
      failedWebhookCount,
      unreadConversations,
      automationTriggerCount,
    ] = await Promise.all([
      prisma.integrationAccount.findFirst({ where: { organizationId: orgId, provider: 'INSTAGRAM', isConnected: true } }),
      prisma.message.count({ where: { organizationId: orgId, type: 'DM', createdAt: { gte: startOfToday } } }),
      prisma.message.count({ where: { organizationId: orgId, type: 'COMMENT', createdAt: { gte: startOfToday } } }),
      prisma.lead.count({ where: { organizationId: orgId, source: 'INSTAGRAM', createdAt: { gte: startOfToday } } }),
      // Inbound messages from today, paired with the org's next outbound reply (if any) to compute response time.
      prisma.message.findMany({
        where: { organizationId: orgId, direction: 'INBOUND', createdAt: { gte: startOfToday } },
        select: { conversationId: true, createdAt: true },
      }),
      prisma.conversation.findMany({
        where: { organizationId: orgId },
        orderBy: { updatedAt: 'desc' },
        take: 8,
        include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
      }),
      prisma.webhookEvent.findFirst({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.webhookEvent.count({ where: { organizationId: orgId, status: 'FAILED' } }),
      prisma.conversation.count({ where: { organizationId: orgId, unreadCount: { gt: 0 } } }),
      prisma.activity.count({
        where: {
          organizationId: orgId,
          type: { in: ['AUTO_REPLY_TRIGGERED', 'AUTO_REPLY_ASSIGNED_HUMAN'] },
          createdAt: { gte: startOfToday },
        },
      }),
    ]);

    // Pending replies: conversations whose latest message is inbound (i.e. we owe a reply).
    const openConversations = await prisma.conversation.findMany({
      where: { organizationId: orgId },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    const pendingReplies = openConversations.filter((c) => c.messages[0]?.direction === 'INBOUND').length;

    // Average response time: for each conversation with an inbound message
    // today, find the next outbound message after it and diff the timestamps.
    let totalResponseMs = 0;
    let responseSamples = 0;
    for (const inbound of recentInboundDMs) {
      const nextOutbound = await prisma.message.findFirst({
        where: { conversationId: inbound.conversationId, direction: 'OUTBOUND', createdAt: { gt: inbound.createdAt } },
        orderBy: { createdAt: 'asc' },
      });
      if (nextOutbound) {
        totalResponseMs += nextOutbound.createdAt.getTime() - inbound.createdAt.getTime();
        responseSamples++;
      }
    }
    const avgResponseMinutes = responseSamples > 0 ? Math.round(totalResponseMs / responseSamples / 60000) : null;

    res.json({
      connection: instagramAccount
        ? {
            connected: true,
            displayName: instagramAccount.displayName,
            webhookSubscribed: instagramAccount.webhookSubscribed,
            tokenExpiresAt: instagramAccount.tokenExpiresAt,
          }
        : { connected: false },
      counts: {
        todayMessages: todayDMs,
        todayComments: todayComments,
        todayLeads,
        pendingReplies,
        unreadConversations,
        automationTriggerCount,
      },
      avgResponseMinutes,
      recentConversations: recentConversations.map((c) => ({
        id: c.id,
        channel: c.channel,
        type: c.type,
        customerName: c.customerName,
        lastMessage: c.messages[0] ?? null,
        updatedAt: c.updatedAt,
      })),
      webhookHealth: {
        lastEventAt: lastWebhookEvent?.createdAt ?? null,
        lastEventStatus: lastWebhookEvent?.status ?? null,
        failedCount: failedWebhookCount,
      },
    });
  })
);

export default router;
