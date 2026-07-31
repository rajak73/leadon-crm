/**
 * Outbound messaging service (BRD §11.3 safety rule, §16 real send).
 *
 *  - Simulation sends (isSimulation=true): recorded and marked SENT. The real
 *    user receives NOTHING (BRD §11.1).
 *  - Real sends (isSimulation=false): attempted via the Meta Graph API only if
 *    credentials exist for the channel. If credentials are missing OR the send
 *    fails, the message is marked FAILED and NEVER SENT (BRD §11.3, Risk 3).
 */
import { prisma } from '../prisma.js';
import { hasRealMetaCreds } from '../config.js';
import { sendWhatsApp, sendMessengerLike, sendPrivateReplyToComment } from './meta/graph.js';
import { decryptSecret } from '../lib/crypto.js';
import type { Channel } from '@leados/shared';

export interface SendParams {
  organizationId: string;
  conversationId: string;
  channel: Channel;
  body: string;
  isSimulation: boolean;
}

export interface SendResult {
  messageId: string;
  status: 'SENT' | 'FAILED' | 'QUEUED';
  reason?: string;
  externalId?: string;
}

export async function sendOutbound(params: SendParams): Promise<SendResult> {
  const { organizationId, conversationId, channel, body, isSimulation } = params;

  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  const isComment = conversation?.type === 'COMMENT';

  // Create the outbound message row first (audit trail).
  const message = await prisma.message.create({
    data: {
      organizationId,
      conversationId,
      direction: 'OUTBOUND',
      type: isComment ? 'COMMENT' : 'DM',
      body,
      status: 'QUEUED',
      isSimulation,
    },
  });

  // BRD §11.3: simulation is the ONLY case allowed to be marked SENT without a
  // real delivery. The real user receives nothing.
  if (isSimulation) {
    await prisma.message.update({ where: { id: message.id }, data: { status: 'SENT' } });
    return { messageId: message.id, status: 'SENT', reason: 'simulation' };
  }

  // Real send path — requires channel credentials (BRD §16).
  const realChannel = channel === 'INTERNAL' ? null : (channel as 'INSTAGRAM' | 'WHATSAPP' | 'FACEBOOK');
  if (!realChannel || !hasRealMetaCreds(realChannel)) {
    await prisma.message.update({ where: { id: message.id }, data: { status: 'FAILED' } });
    return {
      messageId: message.id,
      status: 'FAILED',
      reason: 'Missing Meta credentials for real send (not marked SENT).',
    };
  }

  try {
    let externalId: string;
    if (isComment) {
      // Reply privately via DM to the commenter, referencing their comment,
      // instead of a public reply visible under the post.
      const lastInbound = await prisma.message.findFirst({
        where: { conversationId, direction: 'INBOUND', type: 'COMMENT' },
        orderBy: { createdAt: 'desc' },
      });
      if (!lastInbound?.externalId) throw new Error('No source comment id to reply to.');
      const integration = await prisma.integrationAccount.findFirst({
        where: { organizationId, provider: 'INSTAGRAM', isConnected: true },
      });
      const pageToken = decryptSecret(integration?.accessToken) ?? '';
      externalId = await sendPrivateReplyToComment(lastInbound.externalId, body, pageToken);
    } else if (realChannel === 'WHATSAPP') {
      const recipient = conversation?.externalId;
      if (!recipient) throw new Error('No recipient external id on conversation.');
      externalId = await sendWhatsApp(recipient, body);
    } else {
      // Instagram / Facebook DMs use the Send API with the page access token
      // stored on the org's IntegrationAccount.
      const recipient = conversation?.externalId;
      if (!recipient) throw new Error('No recipient external id on conversation.');
      const integration = await prisma.integrationAccount.findFirst({
        where: { organizationId, provider: realChannel, isConnected: true },
      });
      const pageToken = decryptSecret(integration?.accessToken) ?? '';
      externalId = await sendMessengerLike(recipient, body, pageToken);
    }
    await prisma.message.update({ where: { id: message.id }, data: { status: 'SENT' } });
    return { messageId: message.id, status: 'SENT', externalId };
  } catch (err) {
    // Real failure — mark FAILED, never SENT (BRD §11.3, §19.4).
    await prisma.message.update({ where: { id: message.id }, data: { status: 'FAILED' } });
    return {
      messageId: message.id,
      status: 'FAILED',
      reason: err instanceof Error ? err.message : 'Send failed',
    };
  }
}
