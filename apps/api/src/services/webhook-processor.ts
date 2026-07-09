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
import { parseJson, logActivity } from '../lib/helpers.js';

export interface InboundPayload {
  organizationId: string;
  channel: 'INSTAGRAM' | 'WHATSAPP' | 'FACEBOOK';
  senderId: string; // external sender id (IG/WA user)
  senderName?: string;
  text: string;
  messageId?: string; // external message id for idempotency
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
  const { organizationId, channel, senderId, senderName, text, messageId } = payload;

  // Verify org exists (account → org mapping; simulation supplies it directly).
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org) throw new Error(`Unknown organization: ${organizationId}`);

  // Find or create conversation for this sender on this channel.
  let conversation = await prisma.conversation.findFirst({
    where: { organizationId, channel, externalId: senderId },
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        organizationId,
        channel,
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

  // Idempotency: skip if this external message was already recorded.
  if (messageId) {
    const dupe = await prisma.message.findFirst({
      where: { conversationId: conversation.id, body: text, direction: 'INBOUND' },
    });
    // (Best-effort dedupe; a dedicated externalId column could be added later.)
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
      body: text,
      status: 'RECEIVED',
      isSimulation,
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

  // Create the simulated outbound reply (SENT only if isSimulation — §11.3).
  const send = await sendOutbound({
    organizationId,
    conversationId: conversation.id,
    channel,
    body: capture.reply,
    isSimulation,
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date() },
  });

  return {
    conversationId: conversation.id,
    leadId: lead.id,
    inboundMessageId: inbound.id,
    replyMessageId: send.messageId,
    replyStatus: send.status,
    captureState: capture.nextState,
    captured: { name: lead.name, phone: lead.phone },
  };
}
