import type { ActivityType, CreateLeadInput } from '@leados/shared';
import { recordActivity } from '../../lib/activity.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { asAttachments } from '../../lib/serializers.js';
import { createLead } from '../leads/index.js';
import type { Prisma } from '@prisma/client';

/** Lock keys: one per Instagram user (webhook processing) and one per conversation (sending). */
export const userLock = (igsid: string) => `ig-user:${igsid}`;
export const conversationLock = (id: string) => `ig-conv:${id}`;
export const commentLock = (id: string) => `ig-comment:${id}`;

/** “text” with a length cap, for timeline descriptions and notifications. */
export function quote(text: string | null | undefined, max = 80): string {
  const s = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  return `“${s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s}”`;
}

export function handleOf(p: { username?: string | null; name?: string | null }): string {
  return p.username ? `@${p.username}` : (p.name ?? 'an Instagram user');
}

const ATTACHMENT_LABEL: Record<string, string> = {
  image: 'Photo',
  video: 'Video',
  audio: 'Voice message',
  file: 'File',
  share: 'Shared post',
  story_mention: 'Story mention',
  reel: 'Reel',
};

/** Short plain-text preview for lists and notifications. */
export function previewOf(text: string | null, attachments: Prisma.JsonValue = []): string {
  if (text?.trim()) return text.replace(/\s+/g, ' ').trim().slice(0, 200);
  const first = asAttachments(attachments)[0];
  return first ? `[${ATTACHMENT_LABEL[first.type] ?? 'Attachment'}]` : '[Message]';
}

export async function logIgActivity(input: {
  type: Extract<ActivityType, `INSTAGRAM_${string}`>;
  leadId: string | null;
  description: string;
  performedById?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!input.leadId) return;
  const lead = await prisma.lead.findFirst({
    where: { id: input.leadId, deletedAt: null },
    select: { id: true },
  });
  if (!lead) return;
  await recordActivity(prisma, {
    type: input.type,
    description: input.description.slice(0, 500),
    metadata: input.metadata ?? {},
    performedById: input.performedById ?? null,
    leadId: lead.id,
  });
}

/** A live (non-deleted) lead already linked to this Instagram user via a DM thread or a comment. */
export async function existingLeadFor(igsid: string): Promise<string | null> {
  const [conv, comment] = await Promise.all([
    prisma.igConversation.findFirst({
      where: { igsid, lead: { is: { deletedAt: null } } },
      select: { leadId: true },
    }),
    prisma.igComment.findFirst({
      where: { fromIgId: igsid, lead: { is: { deletedAt: null } } },
      orderBy: { commentedAt: 'desc' },
      select: { leadId: true },
    }),
  ]);
  return conv?.leadId ?? comment?.leadId ?? null;
}

/**
 * Finds or creates the lead for an Instagram user and links their conversation and comments.
 * Callers hold the per-user lock, so two quick messages can't create two leads.
 */
/** Name given to a lead when Instagram shares neither a name nor a username. */
export const INSTAGRAM_PLACEHOLDER_NAME = 'Instagram user';

export async function ensureLeadFor(person: {
  igsid: string;
  username: string | null;
  name: string | null;
}): Promise<string> {
  let leadId = await existingLeadFor(person.igsid);
  if (!leadId) {
    const firstName = (
      person.name?.trim() || (person.username ? `@${person.username}` : INSTAGRAM_PLACEHOLDER_NAME)
    ).slice(0, 100);
    const input: CreateLeadInput = {
      firstName,
      source: 'INSTAGRAM',
      status: 'NEW',
      tags: ['instagram'],
    };
    const lead = await createLead({ userId: null, role: null, depth: 0 }, input);
    leadId = lead.id;
    logger.info({ leadId, igsid: person.igsid }, 'Lead created from Instagram');
  }
  // Link everything from this person that isn't linked to a live lead yet.
  await prisma.igConversation.updateMany({
    where: {
      igsid: person.igsid,
      OR: [{ leadId: null }, { lead: { is: { deletedAt: { not: null } } } }],
    },
    data: { leadId },
  });
  await prisma.igComment.updateMany({
    where: {
      fromIgId: person.igsid,
      OR: [{ leadId: null }, { lead: { is: { deletedAt: { not: null } } } }],
    },
    data: { leadId },
  });
  return leadId;
}

/**
 * Fills the lead's empty email/phone with what the customer shared (never overwrites), and
 * replaces an auto-generated name (@username or the Instagram profile name) with the name
 * the customer typed. A name someone edited by hand is never touched.
 */
export async function fillLeadContact(
  leadId: string | null,
  found: { name?: string | null; email: string | null; phone: string | null },
  conv?: { username: string | null; name: string | null },
): Promise<void> {
  if (!leadId || (!found.email && !found.phone && !found.name)) return;
  const lead = await prisma.lead.findFirst({ where: { id: leadId, deletedAt: null } });
  if (!lead) return;
  const data: { email?: string; phone?: string; firstName?: string; lastName?: string | null } = {};
  if (found.email && !lead.email) {
    const taken = await prisma.lead.count({
      where: { email: found.email, deletedAt: null, id: { not: leadId } },
    });
    if (!taken) data.email = found.email;
  }
  if (found.phone && !lead.phone) data.phone = found.phone;
  if (found.name && hasAutoName(lead, conv)) {
    const [first = found.name, ...rest] = found.name.split(' ');
    if (`${first} ${rest.join(' ')}`.trim() !== fullName(lead)) {
      data.firstName = first;
      data.lastName = rest.join(' ') || null;
    }
  }
  if (Object.keys(data).length === 0) return;
  const updated = await prisma.lead.updateMany({
    where: {
      id: leadId,
      ...(data.email ? { email: null } : {}),
      ...(data.phone ? { phone: null } : {}),
      ...(data.firstName ? { firstName: lead.firstName, lastName: lead.lastName } : {}),
    },
    data,
  });
  if (updated.count === 0) return;
  const what = [
    data.firstName && 'name',
    data.email && 'email',
    data.phone && 'phone number',
  ].filter(Boolean) as string[];
  const list = what.length > 1 ? `${what.slice(0, -1).join(', ')} and ${what.at(-1)}` : what[0]!;
  await recordActivity(prisma, {
    type: 'LEAD_UPDATED',
    description: `${list.charAt(0).toUpperCase()}${list.slice(1)} added from the Instagram conversation`,
    metadata: { fields: Object.keys(data), source: 'instagram' },
    performedById: null,
    leadId,
  });
}

const fullName = (l: { firstName: string; lastName: string | null }) =>
  [l.firstName, l.lastName].filter(Boolean).join(' ').trim();

/** True when the lead still carries the name LeadOS generated from Instagram. */
function hasAutoName(
  lead: { firstName: string; lastName: string | null },
  conv?: { username: string | null; name: string | null },
): boolean {
  const current = fullName(lead).toLowerCase();
  if (lead.firstName.startsWith('@') || current === INSTAGRAM_PLACEHOLDER_NAME.toLowerCase())
    return true;
  if (conv?.username && current === conv.username.toLowerCase()) return true;
  if (conv?.name && current === conv.name.trim().toLowerCase()) return true;
  return false;
}
