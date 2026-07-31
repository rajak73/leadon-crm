/**
 * Webhook processing pipeline (BRD §11.1 current simulation flow, §21.4).
 *
 * Given a saved WebhookEvent (fake IG/WhatsApp payload), this:
 *   1. maps account → organization (simulation passes organizationId directly)
 *   2. finds/creates conversation + lead by sender
 *   3. records the inbound message
 *   4. runs the rule-based name/phone capture (§12)
 *   5. updates the lead (name/phone/captureState)
 *   6. creates a simulated OUTBOUND reply (marked SENT only if isSimulation)
 *
 * Idempotent per (organizationId, channel, externalId) message (BRD §19.4).
 */
import { prisma } from '../prisma.js';
import { runCapture } from './capture.js';
import { sendOutbound } from './messaging.js';
import { createNotification } from './notifications.js';
import { matchAutoReplyRule } from './autoReply.js';
import { generateAutoReply } from './ai/index.js';
import { CAPTURE_STATE } from './capture.js';
import { parseJson, logActivity } from '../lib/helpers.js';

export interface InboundPayload {
  organizationId: string;
  channel: 'INSTAGRAM' | 'WHATSAPP' | 'FACEBOOK';
  kind?: 'message' | 'comment'; // defaults to 'message' (simulation payloads predate this field)
  senderId: string; // external sender id (IG/WA user)
  senderName?: string;
  text: string;
  messageId?: string; // external message/comment id, used for idempotency
  mediaId?: string; // IG post/media id (comments only)
}

export interface ProcessResult {
  conversationId: string;
  leadId: string;
  inboundMessageId: string;
  replyMessageId: string;
  replyStatus: string;
  captureState: string;
  captured: { name: string | null; phone: string | null };
}

export async function processInbound(
  payload: InboundPayload,
  isSimulation: boolean
): Promise<ProcessResult> {
  if (payload.kind === 'comment') return processInboundComment(payload, isSimulation);
  return processInboundMessage(payload, isSimulation);
}

/**
 * Instagram comment: recorded for the org's inbox but never auto-replied —
 * comments aren't lead-capture material, they need a human/agent reply.
 * Skips capture.ts entirely (that flow is DM-specific).
 */
async function processInboundComment(payload: InboundPayload, isSimulation: boolean): Promise<ProcessResult> {
  const { organizationId, channel, senderId, senderName, text, messageId, mediaId } = payload;

  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org) throw new Error(`Unknown organization: ${organizationId}`);

  const commentExternalId = `${mediaId ?? 'unknown'}:${senderId}`;
  let conversation = await prisma.conversation.findFirst({
    where: { organizationId, channel, type: 'COMMENT', externalId: commentExternalId },
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { organizationId, channel, type: 'COMMENT', externalId: commentExternalId, customerName: senderName ?? null },
    });
  }

  if (messageId) {
    const dupe = await prisma.message.findFirst({ where: { conversationId: conversation.id, externalId: messageId } });
    if (dupe) {
      return {
        conversationId: conversation.id,
        leadId: '',
        inboundMessageId: dupe.id,
        replyMessageId: '',
        replyStatus: 'SKIPPED_DUPLICATE',
        captureState: 'N/A',
        captured: { name: null, phone: null },
      };
    }
  }

  const inbound = await prisma.message.create({
    data: {
      organizationId,
      conversationId: conversation.id,
      direction: 'INBOUND',
      type: 'COMMENT',
      body: text,
      status: 'RECEIVED',
      isSimulation,
      externalId: messageId ?? null,
      mediaId: mediaId ?? null,
    },
  });

  await createNotification({
    organizationId,
    type: 'SYSTEM',
    title: `New Instagram comment${senderName ? ` from ${senderName}` : ''}`,
    body: text.slice(0, 140),
    link: '/app/inbox',
  });

  // Step 7: keyword rules apply to comments too (Message Count/Content Match).
  const rule = await matchAutoReplyRule(organizationId, text);
  let replyMessageId = '';
  let replyStatus = 'AWAITING_REPLY';
  if (rule?.action === 'REPLY' && rule.replyTemplate) {
    const send = await sendOutbound({
      organizationId,
      conversationId: conversation.id,
      channel,
      body: rule.replyTemplate,
      isSimulation,
    });
    replyMessageId = send.messageId;
    replyStatus = send.status;
    await logActivity({
      organizationId,
      type: 'AUTO_REPLY_TRIGGERED',
      message: `Rule "${rule.keyword}" auto-replied to a comment`,
    });
  }

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date(), unreadCount: { increment: 1 } },
  });

  return {
    conversationId: conversation.id,
    leadId: '',
    inboundMessageId: inbound.id,
    replyMessageId,
    replyStatus,
    captureState: 'N/A',
    captured: { name: null, phone: null },
  };
}

async function processInboundMessage(payload: InboundPayload, isSimulation: boolean): Promise<ProcessResult> {
  const { organizationId, channel, senderId, senderName, text, messageId } = payload;

  // Verify org exists (account → org mapping; simulation supplies it directly).
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org) throw new Error(`Unknown organization: ${organizationId}`);

  // Find or create conversation for this sender on this channel.
  let conversation = await prisma.conversation.findFirst({
    where: { organizationId, channel, type: 'DM', externalId: senderId },
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        organizationId,
        channel,
        type: 'DM',
        externalId: senderId,
        customerName: senderName ?? null,
      },
    });
  }

  // Find or create the lead linked to this conversation.
  let lead = conversation.leadId
    ? await prisma.lead.findUnique({ where: { id: conversation.leadId } })
    : null;
  if (!lead) {
    lead = await prisma.lead.create({
      data: {
        organizationId,
        name: senderName || 'New Lead',
        source: channel,
        status: 'NEW',
        lastActivityAt: new Date(),
        customFields: JSON.stringify({ captureState: 'NEEDS_NAME_PHONE' }),
      },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { leadId: lead.id },
    });
  }

  // Idempotency: skip if this external message id was already recorded.
  if (messageId) {
    const dupe = await prisma.message.findFirst({
      where: { conversationId: conversation.id, externalId: messageId, direction: 'INBOUND' },
    });
    if (dupe) {
      return {
        conversationId: conversation.id,
        leadId: lead.id,
        inboundMessageId: dupe.id,
        replyMessageId: '',
        replyStatus: 'SKIPPED_DUPLICATE',
        captureState: (parseJson<{ captureState?: string }>(lead.customFields)?.captureState) ?? 'UNKNOWN',
        captured: { name: lead.name, phone: lead.phone },
      };
    }
  }

  // Record the inbound message.
  const inbound = await prisma.message.create({
    data: {
      organizationId,
      conversationId: conversation.id,
      direction: 'INBOUND',
      type: 'DM',
      body: text,
      status: 'RECEIVED',
      isSimulation,
      externalId: messageId ?? null,
    },
  });

  // Run the capture flow (§12).
  const currentState = parseJson<{ captureState?: string }>(lead.customFields)?.captureState ?? null;
  const capture = runCapture({
    messageText: text,
    currentName: lead.name && lead.name !== 'New Lead' ? lead.name : null,
    currentPhone: lead.phone,
    currentState,
  });

  // Update the lead with parsed data + next capture state.
  const newCustomFields = {
    ...(parseJson(lead.customFields) ?? {}),
    captureState: capture.nextState,
  };
  lead = await prisma.lead.update({
    where: { id: lead.id },
    data: {
      name: capture.nextName ?? lead.name,
      phone: capture.nextPhone ?? lead.phone,
      customFields: JSON.stringify(newCustomFields),
      lastActivityAt: new Date(),
    },
  });

  if (capture.parsedName || capture.parsedPhone) {
    await logActivity({
      organizationId,
      type: 'LEAD_DETAILS_CAPTURED',
      message: `Captured${capture.parsedName ? ` name: ${capture.parsedName}` : ''}${
        capture.parsedPhone ? ` phone: ${capture.parsedPhone}` : ''
      }`,
      leadId: lead.id,
    });
    // Notify the org when a lead completes capture (has name + phone).
    if (capture.completed) {
      await createNotification({
        organizationId,
        type: 'LEAD_CAPTURED',
        title: `New lead captured: ${lead.name}`,
        body: `via ${channel}${lead.phone ? ` · ${lead.phone}` : ''}`,
        link: '/app/leads',
      });
    }
  }

  // Step 7: an admin-defined keyword rule takes precedence over the generic
  // name/phone capture reply. ASSIGN_HUMAN skips auto-reply entirely (a human
  // takes over) — the capture-flow parsing above still ran, so lead details
  // captured so far aren't lost.
  const rule = await matchAutoReplyRule(organizationId, text);

  let replyMessageId = '';
  let replyStatus = 'AWAITING_REPLY';
  if (rule?.action === 'ASSIGN_HUMAN') {
    await logActivity({
      organizationId,
      type: 'AUTO_REPLY_ASSIGNED_HUMAN',
      message: `Rule "${rule.keyword}" flagged this conversation for a human reply`,
      leadId: lead.id,
    });
    await createNotification({
      organizationId,
      type: 'SYSTEM',
      title: `Human reply needed: ${lead.name}`,
      body: text.slice(0, 140),
      link: '/app/inbox',
    });
  } else {
    let replyBody = rule?.action === 'REPLY' && rule.replyTemplate ? rule.replyTemplate : capture.reply;
    // No keyword rule matched — use AI to answer what the customer actually
    // asked instead of the generic name/phone-capture message (falls back
    // to that same generic message when AI is disabled/unavailable).
    if (!(rule?.action === 'REPLY' && rule.replyTemplate)) {
      const ai = await generateAutoReply({
        messageText: text,
        leadName: capture.nextName,
        needsName: capture.nextState === CAPTURE_STATE.NEEDS_NAME_PHONE || capture.nextState === CAPTURE_STATE.NEEDS_NAME,
        needsPhone: capture.nextState === CAPTURE_STATE.NEEDS_NAME_PHONE || capture.nextState === CAPTURE_STATE.NEEDS_PHONE,
        fallbackReply: capture.reply,
      });
      replyBody = ai.reply;
    }
    const send = await sendOutbound({
      organizationId,
      conversationId: conversation.id,
      channel,
      body: replyBody,
      isSimulation,
    });
    replyMessageId = send.messageId;
    replyStatus = send.status;
    if (rule?.action === 'REPLY') {
      await logActivity({
        organizationId,
        type: 'AUTO_REPLY_TRIGGERED',
        message: `Rule "${rule.keyword}" auto-replied`,
        leadId: lead.id,
      });
    }
  }

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date(), unreadCount: { increment: 1 } },
  });

  return {
    conversationId: conversation.id,
    leadId: lead.id,
    inboundMessageId: inbound.id,
    replyMessageId,
    replyStatus,
    captureState: capture.nextState,
    captured: { name: lead.name, phone: lead.phone },
  };
}
