import type { Task } from '@leados/shared';
import { isSameDay } from '@/lib/format';

export type TaskGroupKey = 'overdue' | 'today' | 'upcoming' | 'none';

export const taskGroupLabels: Record<TaskGroupKey, string> = {
  overdue: 'Overdue',
  today: 'Today',
  upcoming: 'Upcoming',
  none: 'No due date',
};

/** Splits open tasks into due-date groups (input is already sorted by due date). */
export function groupOpenTasks(
  tasks: Task[],
  now: Date = new Date(),
): Record<TaskGroupKey, Task[]> {
  const groups: Record<TaskGroupKey, Task[]> = { overdue: [], today: [], upcoming: [], none: [] };
  for (const t of tasks) {
    if (!t.dueDate) groups.none.push(t);
    else if (t.isOverdue) groups.overdue.push(t);
    else if (isSameDay(new Date(t.dueDate), now)) groups.today.push(t);
    else groups.upcoming.push(t);
  }
  return groups;
}
