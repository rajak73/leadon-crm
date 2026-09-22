import { useState } from 'react';
import { CheckSquare, Plus } from 'lucide-react';
import type { Task } from '@leados/shared';
import { useTasks } from '@/api/tasks';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import type { RecordRef } from '@/components/domain/record-picker';
import { errorMessage } from '@/lib/api-client';
import { TaskFormDialog } from './task-form-dialog';
import { TaskRow } from './task-row';

type Scope = { relatedLeadId: string } | { relatedContactId: string } | { relatedDealId: string };

/** Tasks linked to one record, with an "Add task" button pre-filled with that record. */
export function RelatedTasks({ scope, record }: { scope: Scope; record: RecordRef }) {
  const { data, isLoading, error, refetch } = useTasks({
    ...scope,
    limit: 100,
    sortBy: 'dueDate',
    sortOrder: 'asc',
  });
  const [dialog, setDialog] = useState<{ open: boolean; task: Task | null }>({
    open: false,
    task: null,
  });
  const tasks = data?.data ?? [];
  const open = tasks.filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED');
  const closed = tasks.filter((t) => t.status === 'COMPLETED' || t.status === 'CANCELLED');

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button
          size="sm"
          icon={<Plus aria-hidden />}
          onClick={() => setDialog({ open: true, task: null })}
        >
          Add task
        </Button>
      </div>
      {isLoading ? (
        <LoadingRegion label="Loading tasks…" className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </LoadingRegion>
      ) : error ? (
        <ErrorState compact message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : tasks.length === 0 ? (
        <EmptyState
          compact
          icon={CheckSquare}
          title="No tasks yet"
          text="Add a task to plan your next step."
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {[...open, ...closed].map((t) => (
            <li key={t.id}>
              <TaskRow task={t} hideRelated onEdit={(task) => setDialog({ open: true, task })} />
            </li>
          ))}
        </ul>
      )}
      <TaskFormDialog
        open={dialog.open}
        onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
        task={dialog.task}
        defaultRelated={record}
      />
    </div>
  );
}
