import type {
  Notification,
  NotificationListQuery,
  NotificationType,
  PageMeta,
} from '@leados/shared';
import { on } from '../../lib/events.js';
import { notFound } from '../../lib/errors.js';
import { pageMeta } from '../../lib/http.js';
import { fullName } from '../../lib/labels.js';
import { prisma, type Tx } from '../../lib/prisma.js';
import { toNotification } from '../../lib/serializers.js';

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType?: Notification['entityType'];
  entityId?: string | null;
}

export async function notify(input: NotificationInput, db: Tx = prisma): Promise<void> {
  await db.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title.slice(0, 200),
      body: input.body.slice(0, 1000),
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    },
  });
}

/**
 * Notifies every active admin. With `collapse`, an admin who still has an unread notification
 * of the same type for the same entity gets that one updated (and bumped to the top) instead of
 * a new one — so a chatty conversation produces one notification, not twenty.
 */
export async function notifyAdmins(
  input: Omit<NotificationInput, 'userId'>,
  options: { collapse?: boolean } = {},
): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', status: 'ACTIVE' },
    select: { id: true },
  });
  for (const admin of admins) {
    if (options.collapse) {
      const existing = await prisma.notification.findFirst({
        where: {
          userId: admin.id,
          type: input.type,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          readAt: null,
        },
        select: { id: true },
      });
      if (existing) {
        await prisma.notification.update({
          where: { id: existing.id },
          data: {
            title: input.title.slice(0, 200),
            body: input.body.slice(0, 1000),
            createdAt: new Date(),
          },
        });
        continue;
      }
    }
    await notify({ ...input, userId: admin.id });
  }
}

export async function listNotifications(
  userId: string,
  q: NotificationListQuery,
): Promise<{ data: Notification[]; meta: PageMeta }> {
  const where = { userId, ...(q.unreadOnly ? { readAt: null } : {}) };
  const [rows, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
    prisma.notification.count({ where }),
  ]);
  return { data: rows.map(toNotification), meta: pageMeta(q.page, q.limit, total) };
}

export const unreadCount = (userId: string) =>
  prisma.notification.count({ where: { userId, readAt: null } });

export async function markRead(userId: string, id: string): Promise<void> {
  const result = await prisma.notification.updateMany({
    where: { id, userId },
    data: { readAt: new Date() },
  });
  if (result.count === 0) {
    // updateMany also matches already-read rows, so zero means it isn't this user's notification.
    throw notFound('notification');
  }
}

export async function markAllRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}

async function actorName(actorId: string | null): Promise<string> {
  if (!actorId) return 'An automation';
  const u = await prisma.user.findUnique({
    where: { id: actorId },
    select: { firstName: true, lastName: true },
  });
  return u ? fullName(u) : 'Someone';
}

/** Assignment notifications (only when someone assigns a record to another person). */
export function registerNotificationSubscribers(): void {
  on('lead.assigned', 'notify-assignee', async (e) => {
    if (e.assigneeId === e.actorId) return;
    const who = await actorName(e.actorId);
    if (e.leadIds.length === 1) {
      const lead = await prisma.lead.findUnique({
        where: { id: e.leadIds[0] },
        select: { id: true, firstName: true, lastName: true },
      });
      if (!lead) return;
      await notify({
        userId: e.assigneeId,
        type: 'LEAD_ASSIGNED',
        title: `New lead assigned: ${fullName(lead)}`,
        body: `${who} assigned ${fullName(lead)} to you.`,
        entityType: 'lead',
        entityId: lead.id,
      });
    } else {
      await notify({
        userId: e.assigneeId,
        type: 'LEAD_ASSIGNED',
        title: `${e.leadIds.length} leads assigned to you`,
        body: `${who} assigned ${e.leadIds.length} leads to you.`,
        entityType: null,
        entityId: null,
      });
    }
  });

  on('deal.assigned', 'notify-assignee', async (e) => {
    if (e.assigneeId === e.actorId) return;
    const deal = await prisma.deal.findUnique({
      where: { id: e.dealId },
      select: { id: true, title: true },
    });
    if (!deal) return;
    await notify({
      userId: e.assigneeId,
      type: 'DEAL_ASSIGNED',
      title: `New deal assigned: ${deal.title}`,
      body: `${await actorName(e.actorId)} assigned the deal "${deal.title}" to you.`,
      entityType: 'deal',
      entityId: deal.id,
    });
  });

  on('task.assigned', 'notify-assignee', async (e) => {
    if (e.assigneeId === e.actorId) return;
    const task = await prisma.task.findUnique({
      where: { id: e.taskId },
      select: { id: true, title: true, dueDate: true },
    });
    if (!task) return;
    await notify({
      userId: e.assigneeId,
      type: 'TASK_ASSIGNED',
      title: `New task: ${task.title}`,
      body: `${await actorName(e.actorId)} assigned you a task.`,
      entityType: 'task',
      entityId: task.id,
    });
  });
}
