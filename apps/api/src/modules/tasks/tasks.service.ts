import type { Prisma } from '@prisma/client';
import type {
  CreateTaskInput,
  PageMeta,
  Task,
  TaskListQuery,
  TaskPriority,
  UpdateTaskInput,
} from '@leados/shared';
import { recordActivity } from '../../lib/activity.js';
import type { Actor } from '../../lib/auth.js';
import { type DomainEvent, emitAll } from '../../lib/events.js';
import { fieldError, notFound } from '../../lib/errors.js';
import { pageMeta } from '../../lib/http.js';
import { TASK_TYPE_LABEL } from '../../lib/labels.js';
import { lockRows, prisma, type Tx } from '../../lib/prisma.js';
import { taskInclude, toTask } from '../../lib/serializers.js';
import { addDays, startOfDayIn } from '../../lib/time.js';
import { assigneeFilter, textSearch } from '../leads/index.js';
import { getSettings } from '../settings/index.js';
import { assertAssignable } from '../users/index.js';

const OPEN_STATUSES = ['PENDING', 'IN_PROGRESS'];
const PRIORITY_RANK: Record<TaskPriority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

async function dueFilter(due: TaskListQuery['due']): Promise<Prisma.TaskWhereInput> {
  if (!due) return {};
  const now = new Date();
  if (due === 'none') return { dueDate: null };
  if (due === 'overdue') return { dueDate: { lt: now }, status: { in: OPEN_STATUSES } };
  const { timezone } = await getSettings();
  const today = startOfDayIn(now, timezone);
  // today = the current calendar day; week = today plus the next 6 days (settings time zone).
  const end = startOfDayIn(addDays(today, due === 'today' ? 1.5 : 7.5), timezone);
  return { dueDate: { gte: today, lt: end } };
}

export async function listTasks(
  actor: Actor,
  q: TaskListQuery,
): Promise<{ data: Task[]; meta: PageMeta }> {
  const and: Prisma.TaskWhereInput[] = [
    ...textSearch<Prisma.TaskWhereInput>(['title', 'description'], q.search),
    await dueFilter(q.due),
  ];
  if (q.status?.length) and.push({ status: { in: q.status } });
  if (q.priority?.length) and.push({ priority: { in: q.priority } });
  const where: Prisma.TaskWhereInput = {
    deletedAt: null,
    ...assigneeFilter(q.assignedToId, actor),
    ...(q.relatedLeadId ? { relatedLeadId: q.relatedLeadId } : {}),
    ...(q.relatedContactId ? { relatedContactId: q.relatedContactId } : {}),
    ...(q.relatedDealId ? { relatedDealId: q.relatedDealId } : {}),
    AND: and,
  };
  const skip = (q.page - 1) * q.limit;

  if (q.sortBy === 'priority') {
    // Priority is stored as text, so rank it in memory (single-organisation volumes are small).
    const keys = await prisma.task.findMany({
      where,
      select: { id: true, priority: true, dueDate: true },
    });
    const dir = q.sortOrder === 'asc' ? 1 : -1;
    keys.sort(
      (a, b) =>
        dir *
          (PRIORITY_RANK[a.priority as TaskPriority] - PRIORITY_RANK[b.priority as TaskPriority]) ||
        (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity) ||
        a.id.localeCompare(b.id),
    );
    const pageIds = keys.slice(skip, skip + q.limit).map((k) => k.id);
    const rows = await prisma.task.findMany({
      where: { id: { in: pageIds } },
      include: taskInclude,
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const now = new Date();
    return {
      data: pageIds.map((id) => toTask(byId.get(id)!, now)),
      meta: pageMeta(q.page, q.limit, keys.length),
    };
  }

  const orderBy: Prisma.TaskOrderByWithRelationInput[] = [
    q.sortBy === 'dueDate'
      ? { dueDate: { sort: q.sortOrder, nulls: 'last' } }
      : { createdAt: q.sortOrder },
    { createdAt: 'desc' },
    { id: 'asc' },
  ];
  const [rows, total] = await Promise.all([
    prisma.task.findMany({ where, include: taskInclude, orderBy, skip, take: q.limit }),
    prisma.task.count({ where }),
  ]);
  const now = new Date();
  return { data: rows.map((t) => toTask(t, now)), meta: pageMeta(q.page, q.limit, total) };
}

export async function getTask(id: string): Promise<Task> {
  const row = await prisma.task.findFirst({ where: { id, deletedAt: null }, include: taskInclude });
  if (!row) throw notFound('task');
  return toTask(row);
}

async function assertRelated(
  tx: Tx,
  input: {
    relatedLeadId?: string | null;
    relatedContactId?: string | null;
    relatedDealId?: string | null;
  },
) {
  if (
    input.relatedLeadId &&
    !(await tx.lead.count({ where: { id: input.relatedLeadId, deletedAt: null } }))
  ) {
    throw fieldError('relatedLeadId', 'Choose an existing lead');
  }
  if (
    input.relatedContactId &&
    !(await tx.contact.count({ where: { id: input.relatedContactId, deletedAt: null } }))
  ) {
    throw fieldError('relatedContactId', 'Choose an existing contact');
  }
  if (
    input.relatedDealId &&
    !(await tx.deal.count({ where: { id: input.relatedDealId, deletedAt: null } }))
  ) {
    throw fieldError('relatedDealId', 'Choose an existing deal');
  }
}

/** `createdById` lets workflows attribute tasks to the workflow's owner. */
export async function createTask(
  actor: Actor,
  input: CreateTaskInput,
  createdById?: string,
): Promise<Task> {
  const creator = createdById ?? actor.userId!;
  const assignee = input.assignedToId === undefined ? (actor.userId ?? null) : input.assignedToId;
  const events: DomainEvent[] = [];
  const id = await prisma.$transaction(async (tx) => {
    await assertRelated(tx, input);
    await assertAssignable(tx, assignee);
    const task = await tx.task.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        type: input.type,
        priority: input.priority,
        dueDate: input.dueDate ?? null,
        assignedToId: assignee,
        createdById: creator,
        relatedLeadId: input.relatedLeadId ?? null,
        relatedContactId: input.relatedContactId ?? null,
        relatedDealId: input.relatedDealId ?? null,
      },
    });
    if (task.relatedLeadId || task.relatedContactId || task.relatedDealId) {
      await recordActivity(tx, {
        type: 'TASK_CREATED',
        description: `${TASK_TYPE_LABEL[input.type]} task created: ${task.title}`,
        metadata: { taskId: task.id },
        performedById: actor.userId,
        leadId: task.relatedLeadId,
        contactId: task.relatedContactId,
        dealId: task.relatedDealId,
      });
    }
    if (assignee)
      events.push({
        type: 'task.assigned',
        taskId: task.id,
        assigneeId: assignee,
        actorId: actor.userId,
        depth: actor.depth,
      });
    return task.id;
  });
  emitAll(events);
  return getTask(id);
}

export async function updateTask(actor: Actor, id: string, input: UpdateTaskInput): Promise<Task> {
  const events: DomainEvent[] = [];
  await prisma.$transaction(async (tx) => {
    await lockRows(tx, 'Task', [id]);
    const existing = await tx.task.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw notFound('task');
    const data: Prisma.TaskUncheckedUpdateInput = {
      title: input.title,
      description: input.description,
      type: input.type,
      priority: input.priority,
      status: input.status,
    };
    if (input.dueDate !== undefined && input.dueDate?.getTime() !== existing.dueDate?.getTime()) {
      data.dueDate = input.dueDate;
      data.reminderSentAt = null; // remind again for the new due date
    }
    const reassigned =
      input.assignedToId !== undefined && input.assignedToId !== existing.assignedToId;
    if (reassigned) {
      await assertAssignable(tx, input.assignedToId);
      data.assignedToId = input.assignedToId ?? null;
    }
    const completing = input.status === 'COMPLETED' && existing.status !== 'COMPLETED';
    if (completing) data.completedAt = new Date();
    else if (input.status && input.status !== 'COMPLETED' && existing.status === 'COMPLETED')
      data.completedAt = null;

    await tx.task.update({ where: { id }, data });
    if (completing) {
      await recordActivity(tx, {
        type: 'TASK_COMPLETED',
        description: `Task completed: ${input.title ?? existing.title}`,
        metadata: { taskId: id },
        performedById: actor.userId,
        leadId: existing.relatedLeadId,
        contactId: existing.relatedContactId,
        dealId: existing.relatedDealId,
      });
      events.push({
        type: 'task.completed',
        taskId: id,
        actorId: actor.userId,
        depth: actor.depth,
      });
    }
    if (reassigned && input.assignedToId) {
      events.push({
        type: 'task.assigned',
        taskId: id,
        assigneeId: input.assignedToId,
        actorId: actor.userId,
        depth: actor.depth,
      });
    }
  });
  emitAll(events);
  return getTask(id);
}

export async function deleteTask(id: string): Promise<void> {
  const r = await prisma.task.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (r.count === 0) throw notFound('task');
}
