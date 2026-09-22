import type { Prisma } from '@prisma/client';
import type {
  CreateDealInput,
  Deal,
  DealListQuery,
  MoveDealInput,
  PageMeta,
  UpdateDealInput,
} from '@leados/shared';
import { recordActivity } from '../../lib/activity.js';
import type { Actor } from '../../lib/auth.js';
import { type DomainEvent, emitAll } from '../../lib/events.js';
import { fieldError, notFound } from '../../lib/errors.js';
import { pageMeta } from '../../lib/http.js';
import { lockRows, prisma, type Tx } from '../../lib/prisma.js';
import { dealInclude, toDeal } from '../../lib/serializers.js';
import { assigneeFilter, textSearch } from '../leads/index.js';
import { getSettings } from '../settings/index.js';
import { assertAssignable } from '../users/index.js';

export async function listDeals(
  actor: Actor,
  q: DealListQuery,
): Promise<{ data: Deal[]; meta: PageMeta }> {
  const and: Prisma.DealWhereInput[] = textSearch(['title'], q.search);
  const where: Prisma.DealWhereInput = {
    deletedAt: null,
    ...(q.pipelineId ? { pipelineId: q.pipelineId } : {}),
    ...(q.stageId ? { stageId: q.stageId } : {}),
    ...(q.status?.length ? { status: { in: q.status } } : {}),
    ...(q.leadId ? { leadId: q.leadId } : {}),
    ...(q.contactId ? { contactId: q.contactId } : {}),
    ...assigneeFilter(q.assignedToId, actor),
    ...(and.length ? { AND: and } : {}),
  };
  const nullable = q.sortBy === 'value' || q.sortBy === 'expectedCloseDate';
  const orderBy: Prisma.DealOrderByWithRelationInput[] = [
    nullable ? { [q.sortBy]: { sort: q.sortOrder, nulls: 'last' } } : { [q.sortBy]: q.sortOrder },
    { id: 'asc' },
  ];
  const [rows, total] = await Promise.all([
    prisma.deal.findMany({
      where,
      include: dealInclude,
      orderBy,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
    prisma.deal.count({ where }),
  ]);
  return { data: rows.map(toDeal), meta: pageMeta(q.page, q.limit, total) };
}

export async function getDeal(id: string): Promise<Deal> {
  const row = await prisma.deal.findFirst({ where: { id, deletedAt: null }, include: dealInclude });
  if (!row) throw notFound('deal');
  return toDeal(row);
}

async function assertLinks(
  tx: Tx,
  input: { leadId?: string | null; contactId?: string | null },
): Promise<void> {
  if (input.leadId && !(await tx.lead.count({ where: { id: input.leadId, deletedAt: null } }))) {
    throw fieldError('leadId', 'Choose an existing lead');
  }
  if (
    input.contactId &&
    !(await tx.contact.count({ where: { id: input.contactId, deletedAt: null } }))
  ) {
    throw fieldError('contactId', 'Choose an existing contact');
  }
}

const statusForStage = (stage: { isWon: boolean; isLost: boolean }) =>
  stage.isWon ? 'WON' : stage.isLost ? 'LOST' : 'OPEN';

export async function createDeal(actor: Actor, input: CreateDealInput): Promise<Deal> {
  const events: DomainEvent[] = [];
  const id = await prisma.$transaction(async (tx) => {
    const pipeline = await tx.pipeline.findUnique({
      where: { id: input.pipelineId },
      select: { id: true },
    });
    if (!pipeline) throw fieldError('pipelineId', 'Choose an existing pipeline');
    const stage = await tx.pipelineStage.findUnique({ where: { id: input.stageId } });
    if (!stage || stage.pipelineId !== input.pipelineId)
      throw fieldError('stageId', 'This stage isn’t part of the selected pipeline');
    await assertLinks(tx, input);
    await assertAssignable(tx, input.assignedToId);
    const status = statusForStage(stage);
    const deal = await tx.deal.create({
      data: {
        title: input.title,
        value: input.value ?? null,
        currency: input.currency ?? (await getSettings(tx)).defaultCurrency,
        status,
        pipelineId: input.pipelineId,
        stageId: stage.id,
        leadId: input.leadId ?? null,
        contactId: input.contactId ?? null,
        assignedToId: input.assignedToId ?? null,
        createdById: actor.userId!,
        expectedCloseDate: input.expectedCloseDate ?? null,
        closedAt: status === 'OPEN' ? null : new Date(),
      },
    });
    await recordActivity(tx, {
      type: 'DEAL_CREATED',
      description: `Deal "${deal.title}" created in ${stage.name}`,
      metadata: { stageId: stage.id, pipelineId: deal.pipelineId },
      performedById: actor.userId,
      dealId: deal.id,
      leadId: deal.leadId,
      contactId: deal.contactId,
    });
    const base = {
      dealId: deal.id,
      pipelineId: deal.pipelineId,
      stageId: stage.id,
      actorId: actor.userId,
      depth: actor.depth,
    };
    events.push({ type: 'deal.created', ...base });
    if (status === 'WON') events.push({ type: 'deal.won', ...base });
    if (status === 'LOST') events.push({ type: 'deal.lost', ...base });
    if (deal.assignedToId)
      events.push({
        type: 'deal.assigned',
        dealId: deal.id,
        assigneeId: deal.assignedToId,
        actorId: actor.userId,
        depth: actor.depth,
      });
    return deal.id;
  });
  emitAll(events);
  return getDeal(id);
}

const FIELD_LABEL: Record<string, string> = {
  title: 'title',
  value: 'value',
  currency: 'currency',
  leadId: 'linked lead',
  contactId: 'linked contact',
  assignedToId: 'owner',
  expectedCloseDate: 'expected close date',
};

export async function updateDeal(actor: Actor, id: string, input: UpdateDealInput): Promise<Deal> {
  const events: DomainEvent[] = [];
  await prisma.$transaction(async (tx) => {
    await lockRows(tx, 'Deal', [id]);
    const existing = await tx.deal.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw notFound('deal');
    await assertLinks(tx, input);
    const data: Prisma.DealUncheckedUpdateInput = {};
    const changed: string[] = [];
    for (const key of [
      'title',
      'value',
      'currency',
      'leadId',
      'contactId',
      'assignedToId',
    ] as const) {
      if (input[key] !== undefined && input[key] !== existing[key]) {
        (data as Record<string, unknown>)[key] = input[key] ?? null;
        changed.push(FIELD_LABEL[key]!);
      }
    }
    if (
      input.expectedCloseDate !== undefined &&
      input.expectedCloseDate?.getTime() !== existing.expectedCloseDate?.getTime()
    ) {
      data.expectedCloseDate = input.expectedCloseDate ?? null;
      changed.push(FIELD_LABEL.expectedCloseDate!);
    }
    if (data.assignedToId) await assertAssignable(tx, data.assignedToId as string);
    if (!changed.length) return;
    await tx.deal.update({ where: { id }, data });
    await recordActivity(tx, {
      type: 'DEAL_UPDATED',
      description: `Updated ${changed.join(', ')}`,
      metadata: { fields: changed },
      performedById: actor.userId,
      dealId: id,
      leadId: (data.leadId as string | undefined) ?? existing.leadId,
      contactId: (data.contactId as string | undefined) ?? existing.contactId,
    });
    if (data.assignedToId) {
      events.push({
        type: 'deal.assigned',
        dealId: id,
        assigneeId: data.assignedToId as string,
        actorId: actor.userId,
        depth: actor.depth,
      });
    }
  });
  emitAll(events);
  return getDeal(id);
}

/**
 * Moves a deal to another stage of its pipeline. Won stage → WON + closedAt; Lost stage →
 * LOST (+ reason); any open stage → OPEN with closedAt cleared.
 */
export async function moveDeal(actor: Actor, id: string, input: MoveDealInput): Promise<Deal> {
  const events: DomainEvent[] = [];
  await prisma.$transaction(async (tx) => {
    await lockRows(tx, 'Deal', [id]);
    const deal = await tx.deal.findFirst({
      where: { id, deletedAt: null },
      include: { stage: true },
    });
    if (!deal) throw notFound('deal');
    const stage = await tx.pipelineStage.findUnique({ where: { id: input.stageId } });
    if (!stage || stage.pipelineId !== deal.pipelineId)
      throw fieldError('stageId', 'Choose a stage from this deal’s pipeline');

    const status = statusForStage(stage);
    const sameStage = stage.id === deal.stageId;
    const reasonChanged =
      status === 'LOST' && input.lostReason !== undefined && input.lostReason !== deal.lostReason;
    if (sameStage && !reasonChanged) return;

    await tx.deal.update({
      where: { id },
      data: {
        stageId: stage.id,
        status,
        closedAt: status === 'OPEN' ? null : sameStage ? deal.closedAt : new Date(),
        lostReason: status === 'LOST' ? (input.lostReason ?? deal.lostReason) : null,
      },
    });
    const links = {
      dealId: id,
      leadId: deal.leadId,
      contactId: deal.contactId,
      performedById: actor.userId,
    };
    if (!sameStage) {
      await recordActivity(tx, {
        type: 'DEAL_STAGE_MOVED',
        description: `Deal moved from ${deal.stage.name} to ${stage.name}`,
        metadata: { fromStageId: deal.stageId, toStageId: stage.id },
        ...links,
      });
      events.push({
        type: 'deal.stage_moved',
        dealId: id,
        pipelineId: deal.pipelineId,
        fromStageId: deal.stageId,
        stageId: stage.id,
        actorId: actor.userId,
        depth: actor.depth,
      });
    }
    const base = {
      dealId: id,
      pipelineId: deal.pipelineId,
      stageId: stage.id,
      actorId: actor.userId,
      depth: actor.depth,
    };
    if (status === 'WON' && deal.status !== 'WON') {
      await recordActivity(tx, {
        type: 'DEAL_WON',
        description: `Deal "${deal.title}" won`,
        ...links,
      });
      events.push({ type: 'deal.won', ...base });
    }
    if (status === 'LOST' && (deal.status !== 'LOST' || reasonChanged)) {
      const reason = input.lostReason ?? deal.lostReason;
      await recordActivity(tx, {
        type: 'DEAL_LOST',
        description: `Deal "${deal.title}" lost${reason ? ` — ${reason}` : ''}`,
        metadata: { lostReason: reason },
        ...links,
      });
      if (deal.status !== 'LOST') events.push({ type: 'deal.lost', ...base });
    }
    if (status === 'OPEN' && deal.status !== 'OPEN') {
      await recordActivity(tx, {
        type: 'DEAL_UPDATED',
        description: `Deal "${deal.title}" reopened`,
        ...links,
      });
    }
  });
  emitAll(events);
  return getDeal(id);
}

export async function deleteDeal(id: string): Promise<void> {
  const r = await prisma.deal.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (r.count === 0) throw notFound('deal');
}
