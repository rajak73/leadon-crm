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
import { sendWhatsApp, sendMessengerLike } from './meta/graph.js';
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

  // Create the outbound message row first (audit trail).
  const message = await prisma.message.create({
    data: {
      organizationId,
      conversationId,
      direction: 'OUTBOUND',
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

  // Resolve the recipient (the customer's external id / phone) from the conv.
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  const recipient = conversation?.externalId;
  if (!recipient) {
    await prisma.message.update({ where: { id: message.id }, data: { status: 'FAILED' } });
    return { messageId: message.id, status: 'FAILED', reason: 'No recipient external id on conversation.' };
  }

  try {
    let externalId: string;
    if (realChannel === 'WHATSAPP') {
      externalId = await sendWhatsApp(recipient, body);
    } else {
      // Instagram / Facebook use the Send API with the page access token stored
      // on the org's IntegrationAccount.
      const integration = await prisma.integrationAccount.findFirst({
        where: { organizationId, provider: realChannel, isConnected: true },
      });
      const pageToken = integration?.accessToken ?? '';
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
