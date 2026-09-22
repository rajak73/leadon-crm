import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { Task } from '@leados/shared';
import { useTasks } from '@/api/tasks';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { TextLink } from '@/components/ui/link';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api-client';
import { TaskFormDialog } from '@/features/tasks/task-form-dialog';
import { TaskRow } from '@/features/tasks/task-row';

const base = {
  assignedToId: 'me',
  status: ['PENDING', 'IN_PROGRESS'],
  limit: 10,
  sortBy: 'dueDate',
  sortOrder: 'asc',
} as const;

/** Overdue + due-today tasks for the signed-in person. */
export function MyTasks({ className }: { className?: string }) {
  const overdue = useTasks({ ...base, due: 'overdue' });
  const today = useTasks({ ...base, due: 'today' });
  const [dialog, setDialog] = useState<{ open: boolean; task: Task | null }>({
    open: false,
    task: null,
  });

  const seen = new Set<string>();
  const tasks = [...(overdue.data?.data ?? []), ...(today.data?.data ?? [])].filter((t) =>
    seen.has(t.id) ? false : (seen.add(t.id), true),
  );
  const loading = overdue.isLoading || today.isLoading;
  const error = overdue.error ?? today.error;

  return (
    <Card className={className}>
      <CardHeader
        title="My tasks"
        description="Overdue and due today"
        actions={
          <TextLink to="/tasks" className="type-small">
            View all tasks
          </TextLink>
        }
      />
      {loading ? (
        <LoadingRegion label="Loading your tasks…" className="space-y-3 px-4 pb-5">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </LoadingRegion>
      ) : error && tasks.length === 0 ? (
        <ErrorState
          compact
          message={errorMessage(error)}
          onRetry={() => {
            void overdue.refetch();
            void today.refetch();
          }}
        />
      ) : tasks.length === 0 ? (
        <EmptyState
          compact
          icon={CheckCircle2}
          title="Nothing due today"
          text="You're all caught up."
        />
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {tasks.map((t) => (
            <li key={t.id}>
              <TaskRow task={t} onEdit={(task) => setDialog({ open: true, task })} />
            </li>
          ))}
        </ul>
      )}
      <TaskFormDialog
        open={dialog.open}
        onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
        task={dialog.task}
      />
    </Card>
  );
}
