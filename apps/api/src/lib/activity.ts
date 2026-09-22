import type { Prisma } from '@prisma/client';
import type { ActivityType } from '@leados/shared';
import type { Tx } from './prisma.js';

export interface ActivityInput {
  type: ActivityType;
  description: string; // human-readable, shown as-is in the timeline
  metadata?: Record<string, unknown>;
  performedById: string | null;
  leadId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  /** Whether this counts as engagement (bumps lastActivityAt). Scoring runs don't. */
  touch?: boolean;
}

/** Appends a timeline entry and bumps lastActivityAt on the related lead/contact. */
export async function recordActivity(tx: Tx, input: ActivityInput): Promise<void> {
  const now = new Date();
  await tx.activity.create({
    data: {
      type: input.type,
      description: input.description,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      performedById: input.performedById,
      relatedLeadId: input.leadId ?? null,
      relatedContactId: input.contactId ?? null,
      relatedDealId: input.dealId ?? null,
      createdAt: now,
    },
  });
  if (input.touch === false) return;
  if (input.leadId)
    await tx.lead.update({ where: { id: input.leadId }, data: { lastActivityAt: now } });
  if (input.contactId)
    await tx.contact.update({ where: { id: input.contactId }, data: { lastActivityAt: now } });
}
