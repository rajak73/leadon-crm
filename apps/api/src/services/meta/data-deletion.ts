/**
 * Data deletion handling for Meta App Review (BRD §16, §19.1 privacy).
 *
 * When Meta sends a data-deletion callback for a user_id (the app-scoped id of
 * a social sender), we must delete/anonymize the personal data we hold for that
 * sender and return a status URL + confirmation code Meta can display.
 *
 * We store the deletion request so the user can check status via the returned
 * URL, and we scrub the matching conversations/leads/messages across all orgs.
 */
import crypto from 'crypto';
import { prisma } from '../../prisma.js';
import { config } from '../../config.js';

export interface DeletionOutcome {
  url: string;
  confirmationCode: string;
}

/**
 * Delete data tied to a Meta sender id (conversation.externalId). Anonymizes
 * the lead and removes message bodies for privacy. Idempotent.
 */
export async function handleDataDeletion(metaUserId: string, baseUrl: string): Promise<DeletionOutcome> {
  const confirmationCode = crypto.randomBytes(8).toString('hex');

  // Find every conversation that originated from this social sender.
  const conversations = await prisma.conversation.findMany({
    where: { externalId: metaUserId },
    select: { id: true, leadId: true },
  });

  const conversationIds = conversations.map((c) => c.id);
  const leadIds = conversations.map((c) => c.leadId).filter((x): x is string => Boolean(x));

  await prisma.$transaction(async (tx) => {
    // Remove message contents (scrub PII) then the messages themselves.
    if (conversationIds.length) {
      await tx.message.deleteMany({ where: { conversationId: { in: conversationIds } } });
      await tx.conversation.deleteMany({ where: { id: { in: conversationIds } } });
    }
    // Anonymize leads created from this sender (keep aggregate stats, drop PII).
    if (leadIds.length) {
      await tx.lead.updateMany({
        where: { id: { in: leadIds } },
        data: {
          name: 'Deleted User',
          email: null,
          phone: null,
          notes: null,
          customFields: JSON.stringify({ deleted: true, reason: 'meta_data_deletion' }),
        },
      });
    }
    // Record the request for status lookup.
    await tx.webhookEvent.create({
      data: {
        channel: 'DATA_DELETION',
        externalId: confirmationCode,
        isSimulation: false,
        status: 'PROCESSED',
        processedAt: new Date(),
        payload: JSON.stringify({
          metaUserId,
          confirmationCode,
          conversationsDeleted: conversationIds.length,
          leadsAnonymized: leadIds.length,
        }),
      },
    });
  });

  const base = baseUrl || config.webOrigin;
  return {
    url: `${base}/api/v1/webhooks/meta/deletion-status?code=${confirmationCode}`,
    confirmationCode,
  };
}

/** Look up the status of a deletion request by confirmation code. */
export async function getDeletionStatus(code: string) {
  const rec = await prisma.webhookEvent.findFirst({
    where: { channel: 'DATA_DELETION', externalId: code },
    orderBy: { createdAt: 'desc' },
  });
  if (!rec) return null;
  const detail = JSON.parse(rec.payload);
  return {
    confirmationCode: code,
    status: 'complete',
    completedAt: rec.processedAt,
    conversationsDeleted: detail.conversationsDeleted ?? 0,
    leadsAnonymized: detail.leadsAnonymized ?? 0,
  };
}
