import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { notify } from '../notifications/index.js';

export const REMINDER_INTERVAL_MS = 60_000;
const LOOKAHEAD_MS = 15 * 60_000;

/**
 * Sends one TASK_DUE notification per task that is due within 15 minutes or overdue.
 * `reminderSentAt` is claimed atomically so overlapping runs never double-notify.
 */
export async function sendTaskReminders(now = new Date()): Promise<number> {
  const due = await prisma.task.findMany({
    where: {
      deletedAt: null,
      reminderSentAt: null,
      assignedToId: { not: null },
      status: { in: ['PENDING', 'IN_PROGRESS'] },
      dueDate: { lte: new Date(now.getTime() + LOOKAHEAD_MS) },
    },
    select: { id: true, title: true, dueDate: true, assignedToId: true },
    take: 500,
  });
  let sent = 0;
  for (const task of due) {
    const claimed = await prisma.task.updateMany({
      where: { id: task.id, reminderSentAt: null },
      data: { reminderSentAt: now },
    });
    if (claimed.count === 0) continue;
    const overdue = task.dueDate! <= now;
    await notify({
      userId: task.assignedToId!,
      type: 'TASK_DUE',
      title: overdue ? `Overdue: ${task.title}` : `Due soon: ${task.title}`,
      body: overdue ? 'This task is past its due date.' : 'This task is due within 15 minutes.',
      entityType: 'task',
      entityId: task.id,
    });
    sent++;
  }
  return sent;
}

export function startTaskReminders(): () => void {
  const timer = setInterval(() => {
    sendTaskReminders().catch((err: unknown) => logger.error({ err }, 'Task reminder run failed'));
  }, REMINDER_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
