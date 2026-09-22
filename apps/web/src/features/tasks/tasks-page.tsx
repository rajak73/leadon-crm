import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { CheckCircle2, Plus } from 'lucide-react';
import { TASK_PRIORITIES, type Task, type TaskPriority } from '@leados/shared';
import { useTasks } from '@/api/tasks';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { errorMessage, type QueryParams } from '@/lib/api-client';
import { formatNumber } from '@/lib/format';
import { taskPriorityLabels } from '@/lib/labels';
import { groupOpenTasks, taskGroupLabels, type TaskGroupKey } from './group-tasks';
import { SegmentedControl } from './segmented-control';
import { TaskFormDialog } from './task-form-dialog';
import { TaskGroup } from './task-group';

type Who = 'mine' | 'everyone';
const GROUP_ORDER: TaskGroupKey[] = ['overdue', 'today', 'upcoming', 'none'];
const COMPLETED_LIMIT = 20;

const priorityOptions = [
  { value: 'all', label: 'All priorities' },
  ...TASK_PRIORITIES.map((p) => ({ value: p, label: taskPriorityLabels[p] })),
];

function isPriority(v: string | null): v is TaskPriority {
  return v !== null && (TASK_PRIORITIES as readonly string[]).includes(v);
}

function TasksSkeleton() {
  return (
    <LoadingRegion label="Loading tasks…" className="flex flex-col gap-4">
      {[3, 2].map((rows, g) => (
        <div key={g} className="flex flex-col gap-2">
          <Skeleton className="h-6 w-32" />
          <Card className="divide-y divide-border">
            {Array.from({ length: rows }, (_, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3">
                <Skeleton className="size-4" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </Card>
        </div>
      ))}
    </LoadingRegion>
  );
}

export default function TasksPage() {
  useDocumentTitle('Tasks');
  const [params, setParams] = useSearchParams();
  const who: Who = params.get('who') === 'everyone' ? 'everyone' : 'mine';
  const priorityParam = params.get('priority');
  const priority = isPriority(priorityParam) ? priorityParam : null;
  const [dialog, setDialog] = useState<{ open: boolean; task: Task | null }>({
    open: false,
    task: null,
  });

  // ?new=1 opens the "New task" dialog (e.g. from the command palette), then drops the param.
  useEffect(() => {
    if (params.get('new') !== '1') return;
    setDialog({ open: true, task: null });
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.delete('new');
        return next;
      },
      { replace: true },
    );
  }, [params, setParams]);

  function updateParam(key: string, value: string | null) {
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  }

  const filters: QueryParams = {
    assignedToId: who === 'mine' ? 'me' : undefined,
    priority: priority ? [priority] : undefined,
  };
  const openQuery = useTasks({
    ...filters,
    status: ['PENDING', 'IN_PROGRESS'],
    limit: 100,
    sortBy: 'dueDate',
    sortOrder: 'asc',
  });
  const doneQuery = useTasks({
    ...filters,
    status: ['COMPLETED'],
    limit: COMPLETED_LIMIT,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  const openTasks = useMemo(() => openQuery.data?.data ?? [], [openQuery.data]);
  const doneTasks = doneQuery.data?.data ?? [];
  const doneTotal = doneQuery.data?.meta?.total ?? doneTasks.length;
  const groups = useMemo(() => groupOpenTasks(openTasks), [openTasks]);
  const filtered = Boolean(priority);
  const openEdit = (task: Task | null) => setDialog({ open: true, task });

  let content;
  if (openQuery.isLoading) {
    content = <TasksSkeleton />;
  } else if (openQuery.error && !openQuery.data) {
    content = (
      <ErrorState
        message={errorMessage(openQuery.error)}
        onRetry={() => void openQuery.refetch()}
      />
    );
  } else {
    const nothingOpen = openTasks.length === 0;
    content = (
      <div
        className={
          openQuery.isPlaceholderData
            ? 'flex flex-col gap-4 opacity-60 transition-opacity'
            : 'flex flex-col gap-4'
        }
      >
        {nothingOpen ? (
          <Card>
            <EmptyState
              icon={CheckCircle2}
              title={filtered ? 'No open tasks match this filter' : "You're all caught up"}
              text={
                filtered
                  ? 'Try another priority, or show all tasks.'
                  : 'No open tasks right now. Plan your next step with a new task.'
              }
              action={
                filtered ? (
                  <Button onClick={() => updateParam('priority', null)}>Show all priorities</Button>
                ) : (
                  <Button
                    variant="primary"
                    icon={<Plus aria-hidden />}
                    onClick={() => openEdit(null)}
                  >
                    New task
                  </Button>
                )
              }
            />
          </Card>
        ) : (
          GROUP_ORDER.filter((key) => groups[key].length > 0).map((key) => (
            <TaskGroup
              key={key}
              title={taskGroupLabels[key]}
              count={groups[key].length}
              tasks={groups[key]}
              onEdit={openEdit}
              tone={key === 'overdue' ? 'danger' : undefined}
            />
          ))
        )}
        {doneTasks.length > 0 && (
          <TaskGroup
            title="Completed"
            count={doneTotal}
            tasks={doneTasks}
            onEdit={openEdit}
            collapsible
            footer={
              doneTotal > doneTasks.length ? (
                <p className="border-t border-border px-4 py-2 type-small text-fg-muted">
                  Showing the {formatNumber(doneTasks.length)} most recent of{' '}
                  {formatNumber(doneTotal)} completed tasks.
                </p>
              ) : undefined
            }
          />
        )}
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Everything that needs doing, grouped by when it's due."
        actions={
          <Button variant="primary" icon={<Plus aria-hidden />} onClick={() => openEdit(null)}>
            New task
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SegmentedControl<Who>
          label="Whose tasks"
          value={who}
          onChange={(v) => updateParam('who', v === 'everyone' ? 'everyone' : null)}
          options={[
            { value: 'mine', label: 'Mine' },
            { value: 'everyone', label: 'Everyone' },
          ]}
        />
        <Select
          aria-label="Priority"
          className="w-44"
          value={priority ?? 'all'}
          onValueChange={(v) => updateParam('priority', v === 'all' ? null : v)}
          options={priorityOptions}
        />
      </div>
      {content}
      <TaskFormDialog
        open={dialog.open}
        onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
        task={dialog.task}
      />
    </>
  );
}
