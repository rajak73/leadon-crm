import type { Prisma } from '@prisma/client';
import type {
  BulkLeadsInput,
  Contact,
  ConvertLeadInput,
  CreateLeadInput,
  Deal,
  Lead,
  LeadDetail,
  LeadListQuery,
  LeadStatus,
  PageMeta,
  UpdateLeadInput,
} from '@leados/shared';
import { recordActivity } from '../../lib/activity.js';
import { type Actor, isAdmin } from '../../lib/auth.js';
import { type DomainEvent, emitAll } from '../../lib/events.js';
import { conflict, fieldError, forbidden, invalidTransition, notFound } from '../../lib/errors.js';
import { pageMeta } from '../../lib/http.js';
import { LEAD_SOURCE_LABEL, LEAD_STATUS_LABEL, fullName } from '../../lib/labels.js';
import { lockRows, prisma, type Tx } from '../../lib/prisma.js';
import {
  asTags,
  contactInclude,
  dealInclude,
  dealSummaryInclude,
  leadInclude,
  toAiScore,
  toContact,
  toDeal,
  toDealSummary,
  toLead,
} from '../../lib/serializers.js';
import { getDefaultPipelineId } from '../pipelines/index.js';
import { getSettings } from '../settings/index.js';
import { assertAssignable } from '../users/index.js';

// ─── Filters ─────────────────────────────────────────────────────────────────

/** Each whitespace-separated word must match at least one of the fields (case-insensitive). */
export function textSearch<W>(fields: string[], search: string | undefined): W[] {
  if (!search) return [];
  const words = search.split(/\s+/).filter(Boolean).slice(0, 5);
  return words.map(
    (w) => ({ OR: fields.map((f) => ({ [f]: { contains: w, mode: 'insensitive' } })) }) as W,
  );
}

export function assigneeFilter(
  value: string | undefined,
  actor: Actor,
): { assignedToId?: string | null } {
  if (!value) return {};
  if (value === 'unassigned') return { assignedToId: null };
  if (value === 'me') return { assignedToId: actor.userId ?? '__none__' };
  return { assignedToId: value };
}

/** Records whose `tags` jsonb array contains `tag` (exact match; uses the GIN index). */
export function tagFilter(tag: string): { tags: { array_contains: string[] } } {
  return { tags: { array_contains: [tag] } };
}

export type LeadFilters = Omit<LeadListQuery, 'page' | 'limit' | 'sortBy' | 'sortOrder'>;

export async function buildLeadWhere(actor: Actor, q: LeadFilters): Promise<Prisma.LeadWhereInput> {
  const and: Prisma.LeadWhereInput[] = textSearch(
    ['firstName', 'lastName', 'email', 'phone', 'company'],
    q.search,
  );
  if (q.tag) and.push(tagFilter(q.tag));
  if (q.scoreMin !== undefined || q.scoreMax !== undefined) {
    and.push({ aiScore: { gte: q.scoreMin, lte: q.scoreMax } });
  }
  return {
    deletedAt: null,
    ...(q.status?.length ? { status: { in: q.status } } : {}),
    ...(q.source?.length ? { source: { in: q.source } } : {}),
    ...assigneeFilter(q.assignedToId, actor),
    ...(and.length ? { AND: and } : {}),
  };
}

export function leadOrderBy(
  q: Pick<LeadListQuery, 'sortBy' | 'sortOrder'>,
): Prisma.LeadOrderByWithRelationInput[] {
  const nullable = q.sortBy === 'aiScore' || q.sortBy === 'lastActivityAt';
  const primary = nullable
    ? { [q.sortBy]: { sort: q.sortOrder, nulls: 'last' as const } }
    : { [q.sortBy]: q.sortOrder };
  return [primary, { id: 'asc' }];
}

export async function listLeads(
  actor: Actor,
  q: LeadListQuery,
): Promise<{ data: Lead[]; meta: PageMeta }> {
  const where = await buildLeadWhere(actor, q);
  const [rows, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      include: leadInclude,
      orderBy: leadOrderBy(q),
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
    prisma.lead.count({ where }),
  ]);
  return { data: rows.map(toLead), meta: pageMeta(q.page, q.limit, total) };
}

export async function listLeadTags(): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ value: string }>>`
    SELECT value FROM (
      SELECT DISTINCT t.value #>> '{}' AS value
      FROM "Lead" l CROSS JOIN LATERAL jsonb_array_elements(l.tags) AS t(value)
      WHERE l."deletedAt" IS NULL AND jsonb_typeof(l.tags) = 'array' AND jsonb_typeof(t.value) = 'string'
    ) tags ORDER BY lower(value), value`;
  return rows.map((r) => r.value);
}

// ─── Single lead ─────────────────────────────────────────────────────────────

async function findActiveLead(db: Tx, id: string) {
  const lead = await db.lead.findFirst({ where: { id, deletedAt: null } });
  if (!lead) throw notFound('lead');
  return lead;
}

export async function getLead(id: string): Promise<Lead> {
  const lead = await prisma.lead.findFirst({
    where: { id, deletedAt: null },
    include: leadInclude,
  });
  if (!lead) throw notFound('lead');
  return toLead(lead);
}

export async function getLeadDetail(id: string): Promise<LeadDetail> {
  const lead = await getLead(id);
  const [latest, openTaskCount, deals] = await Promise.all([
    prisma.aiScore.findFirst({ where: { leadId: id }, orderBy: { createdAt: 'desc' } }),
    prisma.task.count({
      where: { relatedLeadId: id, deletedAt: null, status: { in: ['PENDING', 'IN_PROGRESS'] } },
    }),
    prisma.deal.findMany({
      where: { leadId: id, deletedAt: null },
      include: dealSummaryInclude,
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  return {
    ...lead,
    latestScore: latest ? toAiScore(latest) : null,
    openTaskCount,
    deals: deals.map(toDealSummary),
  };
}

async function assertEmailUnique(
  db: Tx,
  email: string | null | undefined,
  exceptId?: string,
): Promise<void> {
  if (!email) return;
  const existing = await db.lead.findFirst({
    where: { email, deletedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true, firstName: true, lastName: true },
  });
  if (existing) {
    throw conflict(`A lead with this email already exists (${fullName(existing)}).`, {
      email: ['A lead with this email already exists'],
      existingId: [existing.id],
    });
  }
}

export async function createLead(actor: Actor, input: CreateLeadInput): Promise<Lead> {
  if (input.status === 'LOST') throw fieldError('status', 'New leads can’t start as Lost');
  const events: DomainEvent[] = [];
  const lead = await prisma.$transaction(async (tx) => {
    await assertEmailUnique(tx, input.email);
    await assertAssignable(tx, input.assignedToId);
    const created = await tx.lead.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        company: input.company ?? null,
        source: input.source,
        status: input.status,
        tags: input.tags,
        assignedToId: input.assignedToId ?? null,
        createdById: actor.userId ?? (await automationUserId(tx)),
      },
    });
    await recordActivity(tx, {
      type: 'LEAD_CREATED',
      description:
        input.source === 'MANUAL'
          ? 'Lead created'
          : `Lead created from ${LEAD_SOURCE_LABEL[input.source]}`,
      metadata: { source: input.source },
      performedById: actor.userId,
      leadId: created.id,
    });
    return created;
  });
  events.push({ type: 'lead.created', leadId: lead.id, actorId: actor.userId, depth: actor.depth });
  if (lead.assignedToId) {
    events.push({
      type: 'lead.assigned',
      leadIds: [lead.id],
      assigneeId: lead.assignedToId,
      actorId: actor.userId,
      depth: actor.depth,
    });
  }
  emitAll(events);
  return getLead(lead.id);
}

/** Records created by automation are attributed to the first admin. */
async function automationUserId(db: Tx): Promise<string> {
  const admin = await db.user.findFirst({
    where: { role: 'ADMIN' },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!admin) throw notFound('admin user');
  return admin.id;
}

const FIELD_LABEL: Record<string, string> = {
  firstName: 'first name',
  lastName: 'last name',
  email: 'email',
  phone: 'phone',
  company: 'company',
  source: 'source',
  tags: 'tags',
  lostReason: 'lost reason',
};

export async function updateLead(actor: Actor, id: string, input: UpdateLeadInput): Promise<Lead> {
  const events: DomainEvent[] = [];
  await prisma.$transaction(async (tx) => {
    await lockRows(tx, 'Lead', [id]);
    const existing = await findActiveLead(tx, id);
    const data: Prisma.LeadUncheckedUpdateInput = {};
    const changed: string[] = [];

    for (const key of ['firstName', 'lastName', 'email', 'phone', 'company', 'source'] as const) {
      if (input[key] !== undefined && input[key] !== existing[key]) {
        data[key] = input[key] as string;
        changed.push(FIELD_LABEL[key]!);
      }
    }
    if (input.tags && JSON.stringify(input.tags) !== JSON.stringify(asTags(existing.tags))) {
      data.tags = input.tags;
      changed.push('tags');
    }
    if (input.email !== undefined && input.email !== existing.email)
      await assertEmailUnique(tx, input.email, id);

    // Status rules: WON only via convert; LOST needs a reason; leaving LOST clears it.
    const fromStatus = existing.status as LeadStatus;
    const toStatus = input.status && input.status !== fromStatus ? input.status : null;
    if (toStatus) {
      if (fromStatus === 'WON')
        throw invalidTransition('This lead has been converted, so its status can’t be changed.');
      if (toStatus === 'LOST') {
        const reason = input.lostReason ?? existing.lostReason;
        if (!reason) throw fieldError('lostReason', 'Say why this lead was lost');
        data.lostReason = reason;
      } else {
        data.lostReason = null;
      }
      data.status = toStatus;
    } else if (input.lostReason !== undefined && fromStatus === 'LOST') {
      if (!input.lostReason) throw fieldError('lostReason', 'Say why this lead was lost');
      if (input.lostReason !== existing.lostReason) {
        data.lostReason = input.lostReason;
        changed.push(FIELD_LABEL.lostReason!);
      }
    }

    const assigneeChanged =
      input.assignedToId !== undefined && input.assignedToId !== existing.assignedToId;
    if (assigneeChanged) {
      await assertAssignable(tx, input.assignedToId);
      data.assignedToId = input.assignedToId ?? null;
    }

    if (Object.keys(data).length === 0) return;
    await tx.lead.update({ where: { id }, data });

    if (toStatus) {
      await recordActivity(tx, {
        type: 'LEAD_STATUS_CHANGED',
        description:
          `Status changed from ${LEAD_STATUS_LABEL[fromStatus]} to ${LEAD_STATUS_LABEL[toStatus]}` +
          (toStatus === 'LOST' ? ` — ${String(data.lostReason)}` : ''),
        metadata: { from: fromStatus, to: toStatus },
        performedById: actor.userId,
        leadId: id,
      });
      events.push({
        type: 'lead.status_changed',
        leadId: id,
        fromStatus,
        toStatus,
        actorId: actor.userId,
        depth: actor.depth,
      });
    }
    if (assigneeChanged) {
      await recordAssignment(tx, actor, id, input.assignedToId ?? null);
      if (input.assignedToId) {
        events.push({
          type: 'lead.assigned',
          leadIds: [id],
          assigneeId: input.assignedToId,
          actorId: actor.userId,
          depth: actor.depth,
        });
      }
    }
    if (changed.length) {
      await recordActivity(tx, {
        type: 'LEAD_UPDATED',
        description: `Updated ${joinWords(changed)}`,
        metadata: { fields: changed },
        performedById: actor.userId,
        leadId: id,
      });
    }
  });
  emitAll(events);
  return getLead(id);
}

async function recordAssignment(
  tx: Tx,
  actor: Actor,
  leadId: string,
  assigneeId: string | null,
): Promise<void> {
  const assignee = assigneeId
    ? await tx.user.findUnique({
        where: { id: assigneeId },
        select: { firstName: true, lastName: true },
      })
    : null;
  await recordActivity(tx, {
    type: 'LEAD_ASSIGNED',
    description: assignee ? `Assigned to ${fullName(assignee)}` : 'Unassigned',
    metadata: { assignedToId: assigneeId },
    performedById: actor.userId,
    leadId,
  });
}

const joinWords = (words: string[]) =>
  words.length <= 1
    ? (words[0] ?? '')
    : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;

export async function deleteLead(id: string): Promise<void> {
  const result = await prisma.lead.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (result.count === 0) throw notFound('lead');
}

/** Adds a tag if missing (used by workflows). Returns false when the lead already had it. */
export async function addLeadTag(actor: Actor, id: string, tag: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await lockRows(tx, 'Lead', [id]);
    const lead = await findActiveLead(tx, id);
    const tags = asTags(lead.tags);
    if (tags.includes(tag)) return false;
    if (tags.length >= 20) throw fieldError('tags', 'A record can have at most 20 tags');
    await tx.lead.update({ where: { id }, data: { tags: [...tags, tag] } });
    await recordActivity(tx, {
      type: 'LEAD_UPDATED',
      description: `Tag "${tag}" added`,
      metadata: { tag },
      performedById: actor.userId,
      leadId: id,
    });
    return true;
  });
}

// ─── Convert ─────────────────────────────────────────────────────────────────

export async function convertLead(
  actor: Actor,
  id: string,
  input: ConvertLeadInput,
): Promise<{ lead: Lead; contact: Contact; deal: Deal | null }> {
  const events: DomainEvent[] = [];
  const result = await prisma.$transaction(async (tx) => {
    const lead = await findActiveLead(tx, id);
    if (lead.status === 'WON' || lead.convertedToContactId)
      throw conflict('This lead has already been converted.');
    const settings = await getSettings(tx);

    let contact = lead.email
      ? await tx.contact.findFirst({ where: { email: lead.email, deletedAt: null } })
      : null;
    const linkedExisting = !!contact;
    if (!contact) {
      contact = await tx.contact.create({
        data: {
          firstName: lead.firstName,
          lastName: lead.lastName,
          email: lead.email,
          phone: lead.phone,
          company: lead.company,
          tags: asTags(lead.tags),
          assignedToId: lead.assignedToId,
          createdById: actor.userId ?? lead.createdById,
        },
      });
      await recordActivity(tx, {
        type: 'CONTACT_CREATED',
        description: `Contact created from lead ${fullName(lead)}`,
        metadata: { leadId: lead.id },
        performedById: actor.userId,
        contactId: contact.id,
      });
    }

    let dealId: string | null = null;
    if (input.createDeal) {
      const pipelineId = input.pipelineId ?? (await getDefaultPipelineId(tx));
      if (!pipelineId) throw fieldError('pipelineId', 'Create a pipeline first');
      const stage = await tx.pipelineStage.findFirst({
        where: { pipelineId, isWon: false, isLost: false },
        orderBy: { order: 'asc' },
      });
      if (!stage) throw fieldError('pipelineId', 'Choose a pipeline with at least one open stage');
      const title =
        input.dealTitle ?? (lead.company ? `${lead.company} — ${fullName(lead)}` : fullName(lead));
      const deal = await tx.deal.create({
        data: {
          title,
          value: input.dealValue ?? null,
          currency: settings.defaultCurrency,
          pipelineId,
          stageId: stage.id,
          leadId: lead.id,
          contactId: contact.id,
          assignedToId: lead.assignedToId,
          createdById: actor.userId ?? lead.createdById,
        },
      });
      dealId = deal.id;
      await recordActivity(tx, {
        type: 'DEAL_CREATED',
        description: `Deal "${title}" created in ${stage.name}`,
        metadata: { stageId: stage.id, pipelineId },
        performedById: actor.userId,
        dealId,
        leadId: lead.id,
        contactId: contact.id,
      });
      events.push({
        type: 'deal.created',
        dealId,
        pipelineId,
        stageId: stage.id,
        actorId: actor.userId,
        depth: actor.depth,
      });
    }

    await tx.lead.update({
      where: { id },
      data: { status: 'WON', lostReason: null, convertedToContactId: contact.id },
    });
    await recordActivity(tx, {
      type: 'LEAD_CONVERTED',
      description: linkedExisting
        ? `Converted and linked to existing contact ${fullName(contact)}`
        : `Converted to contact ${fullName(contact)}`,
      metadata: { contactId: contact.id, dealId, from: lead.status },
      performedById: actor.userId,
      leadId: id,
      contactId: contact.id,
    });
    events.unshift({
      type: 'lead.status_changed',
      leadId: id,
      fromStatus: lead.status as LeadStatus,
      toStatus: 'WON',
      actorId: actor.userId,
      depth: actor.depth,
    });
    return { contactId: contact.id, dealId };
  });
  emitAll(events);

  const [lead, contact, deal] = await Promise.all([
    getLead(id),
    prisma.contact.findUniqueOrThrow({ where: { id: result.contactId }, include: contactInclude }),
    result.dealId
      ? prisma.deal.findUniqueOrThrow({ where: { id: result.dealId }, include: dealInclude })
      : null,
  ]);
  return { lead, contact: toContact(contact), deal: deal ? toDeal(deal) : null };
}

// ─── Bulk ────────────────────────────────────────────────────────────────────

export async function bulkLeads(
  actor: Actor,
  input: BulkLeadsInput,
): Promise<{ affected: number }> {
  const ids = [...new Set(input.ids)];
  if (input.action === 'delete') {
    if (!isAdmin(actor)) throw forbidden('Only admins can delete leads in bulk.');
    const r = await prisma.lead.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return { affected: r.count };
  }

  const events: DomainEvent[] = [];
  const affected = await prisma.$transaction(async (tx) => {
    await lockRows(tx, 'Lead', ids);
    const leads = await tx.lead.findMany({ where: { id: { in: ids }, deletedAt: null } });
    let count = 0;

    if (input.action === 'assign') {
      await assertAssignable(tx, input.assignedToId);
      const targets = leads.filter((l) => l.assignedToId !== input.assignedToId);
      if (targets.length) {
        await tx.lead.updateMany({
          where: { id: { in: targets.map((l) => l.id) } },
          data: { assignedToId: input.assignedToId },
        });
        for (const l of targets) await recordAssignment(tx, actor, l.id, input.assignedToId);
        if (input.assignedToId) {
          events.push({
            type: 'lead.assigned',
            leadIds: targets.map((l) => l.id),
            assigneeId: input.assignedToId,
            actorId: actor.userId,
            depth: actor.depth,
          });
        }
      }
      count = targets.length;
    }

    if (input.action === 'status') {
      // Converted leads keep their status.
      const targets = leads.filter((l) => l.status !== input.status && l.status !== 'WON');
      for (const l of targets) {
        const lostReason =
          input.status === 'LOST' ? (l.lostReason ?? 'Marked as lost in a bulk update') : null;
        await tx.lead.update({ where: { id: l.id }, data: { status: input.status, lostReason } });
        await recordActivity(tx, {
          type: 'LEAD_STATUS_CHANGED',
          description: `Status changed from ${LEAD_STATUS_LABEL[l.status as LeadStatus]} to ${LEAD_STATUS_LABEL[input.status]}`,
          metadata: { from: l.status, to: input.status, bulk: true },
          performedById: actor.userId,
          leadId: l.id,
        });
        events.push({
          type: 'lead.status_changed',
          leadId: l.id,
          fromStatus: l.status as LeadStatus,
          toStatus: input.status,
          actorId: actor.userId,
          depth: actor.depth,
        });
      }
      count = targets.length;
    }

    if (input.action === 'tag') {
      const targets = leads.filter(
        (l) => !asTags(l.tags).includes(input.tag) && asTags(l.tags).length < 20,
      );
      for (const l of targets) {
        await tx.lead.update({
          where: { id: l.id },
          data: { tags: [...asTags(l.tags), input.tag] },
        });
      }
      count = targets.length;
    }
    return count;
  });
  emitAll(events);
  return { affected };
}
