import { useState } from 'react';
import { Link } from 'react-router';
import {
  Briefcase,
  CalendarClock,
  MoreHorizontal,
  Pencil,
  Trash2,
  User,
  UserRound,
} from 'lucide-react';
import type { Task } from '@leados/shared';
import { useDeleteTask, useUpdateTask } from '@/api/tasks';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { OverdueBadge, PriorityBadge } from '@/components/domain/badges';
import { cn } from '@/lib/cn';
import { formatDueDate, personName } from '@/lib/format';
import { taskTypeLabels } from '@/lib/labels';
import { notify } from '@/lib/toast';

function RelatedLink({ task }: { task: Task }) {
  const cls = 'inline-flex min-w-0 items-center gap-1 text-fg-muted hover:text-fg hover:underline';
  if (task.relatedLead)
    return (
      <Link to={`/leads/${task.relatedLead.id}`} className={cls}>
        <User aria-hidden className="size-3.5 shrink-0" />
        <span className="truncate">{task.relatedLead.name}</span>
      </Link>
    );
  if (task.relatedContact)
    return (
      <Link to={`/contacts/${task.relatedContact.id}`} className={cls}>
        <UserRound aria-hidden className="size-3.5 shrink-0" />
        <span className="truncate">{task.relatedContact.name}</span>
      </Link>
    );
  if (task.relatedDeal)
    return (
      <Link to={`/deals/${task.relatedDeal.id}`} className={cls}>
        <Briefcase aria-hidden className="size-3.5 shrink-0" />
        <span className="truncate">{task.relatedDeal.title}</span>
      </Link>
    );
  return null;
}

interface TaskRowProps {
  task: Task;
  onEdit: (task: Task) => void;
  /** Hide the related-record link (e.g. when shown on that record's page). */
  hideRelated?: boolean;
}

/** One task with a quick-complete checkbox (optimistic). */
export function TaskRow({ task, onEdit, hideRelated }: TaskRowProps) {
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const done = task.status === 'COMPLETED';
  const overdue = task.isOverdue && !done;

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Checkbox
        className="mt-0.5"
        checked={done}
        aria-label={done ? `Mark “${task.title}” as not done` : `Mark “${task.title}” as done`}
        onCheckedChange={(checked) => {
          update.mutate(
            { id: task.id, status: checked === true ? 'COMPLETED' : 'PENDING' },
            { onSuccess: () => checked === true && notify.success('Task completed') },
          );
        }}
      />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onEdit(task)}
          className={cn(
            'text-left type-body font-medium text-fg hover:underline',
            done && 'text-fg-subtle line-through',
          )}
        >
          {task.title}
        </button>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 type-small text-fg-muted">
          <span>{taskTypeLabels[task.type]}</span>
          <span
            className={cn(
              'inline-flex items-center gap-1',
              overdue && 'font-medium text-danger-fg',
            )}
          >
            <CalendarClock aria-hidden className="size-3.5" />
            {formatDueDate(task.dueDate)}
          </span>
          {overdue && <OverdueBadge />}
          {task.priority !== 'MEDIUM' && task.priority !== 'LOW' && (
            <PriorityBadge priority={task.priority} />
          )}
          {!hideRelated && <RelatedLink task={task} />}
        </div>
      </div>
      {task.assignedTo && (
        <span className="hidden items-center gap-1.5 type-small text-fg-muted sm:inline-flex">
          <Avatar name={personName(task.assignedTo)} size="xs" />
          <span className="max-w-28 truncate">{personName(task.assignedTo)}</span>
        </span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={`Actions for “${task.title}”`}
            icon={<MoreHorizontal aria-hidden />}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem icon={<Pencil aria-hidden />} onSelect={() => onEdit(task)}>
            Edit task
          </DropdownMenuItem>
          <DropdownMenuItem
            destructive
            icon={<Trash2 aria-hidden />}
            onSelect={() => setConfirmOpen(true)}
          >
            Delete task
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete task “${task.title}”?`}
        description="This can't be undone."
        confirmLabel="Delete task"
        onConfirm={async () => {
          await remove.mutateAsync(task.id);
          notify.success('Task deleted');
        }}
      />
    </div>
  );
}
