import { useId, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import type { Task } from '@leados/shared';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { TaskRow } from './task-row';

interface TaskGroupProps {
  title: string;
  count: number;
  tasks: Task[];
  onEdit: (task: Task) => void;
  tone?: 'danger';
  /** Render as a disclosure, collapsed by default. */
  collapsible?: boolean;
  footer?: ReactNode;
}

export function TaskGroup({
  title,
  count,
  tasks,
  onEdit,
  tone,
  collapsible,
  footer,
}: TaskGroupProps) {
  const headingId = useId();
  const listId = useId();
  const [expanded, setExpanded] = useState(!collapsible);
  const countBadge = (
    <span
      className={cn(
        'rounded-full px-2 type-caption font-medium tabular-nums',
        tone === 'danger' ? 'bg-danger-subtle text-danger-fg' : 'bg-muted text-fg-muted',
      )}
    >
      {count}
    </span>
  );

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2
        id={headingId}
        className={cn('type-section', tone === 'danger' ? 'text-danger-fg' : 'text-fg')}
      >
        {collapsible ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={() => setExpanded((e) => !e)}
            className="-mx-1 inline-flex items-center gap-2 rounded-md px-1 hover:bg-muted"
          >
            <ChevronRight
              aria-hidden
              className={cn('size-4 transition-transform', expanded && 'rotate-90')}
            />
            {title}
            {countBadge}
          </button>
        ) : (
          <span className="inline-flex items-center gap-2">
            {title}
            {countBadge}
          </span>
        )}
      </h2>
      <div id={listId} hidden={!expanded}>
        {expanded && (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-border">
              {tasks.map((t) => (
                <li key={t.id}>
                  <TaskRow task={t} onEdit={onEdit} />
                </li>
              ))}
            </ul>
            {footer}
          </Card>
        )}
      </div>
    </section>
  );
}
