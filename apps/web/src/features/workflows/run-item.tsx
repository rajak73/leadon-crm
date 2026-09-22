import { useState } from 'react';
import { Link } from 'react-router';
import { CheckCircle2, ChevronDown, MinusCircle, XCircle } from 'lucide-react';
import type { WorkflowRun } from '@leados/shared';
import { Badge } from '@/components/ui/badge';
import { RelativeTime } from '@/components/domain/relative-time';
import { cn } from '@/lib/cn';
import {
  actionLogStatusLabels,
  workflowRunStatusLabels,
  workflowRunStatusTones,
  workflowTriggerLabels,
} from '@/lib/labels';
import { actionLabel, formatDuration, triggerEntityHref } from './workflow-text';

const logIcons = {
  SUCCESS: <CheckCircle2 aria-hidden className="size-4 text-success" />,
  FAILED: <XCircle aria-hidden className="size-4 text-danger" />,
  SKIPPED: <MinusCircle aria-hidden className="size-4 text-fg-subtle" />,
};

export function RunItem({ run }: { run: WorkflowRun }) {
  const [open, setOpen] = useState(false);
  const href = triggerEntityHref(run.triggerEvent.type, run.triggerEvent.entityId);
  const duration = formatDuration(run.startedAt, run.finishedAt);
  const panelId = `run-${run.id}-logs`;

  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Badge tone={workflowRunStatusTones[run.status]} dot>
          {workflowRunStatusLabels[run.status]}
        </Badge>
        <span className="type-body text-fg">
          {workflowTriggerLabels[run.triggerEvent.type]}
          {href && (
            <>
              {' · '}
              <Link to={href} className="text-primary-text hover:underline">
                View record
              </Link>
            </>
          )}
        </span>
        <span className="type-small text-fg-subtle">
          <RelativeTime date={run.startedAt} />
          {duration && ` · took ${duration}`}
        </span>
        {run.actionLogs.length > 0 && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((o) => !o)}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 type-small text-fg-muted hover:bg-muted hover:text-fg"
          >
            {open ? 'Hide steps' : `Show steps (${run.actionLogs.length})`}
            <ChevronDown
              aria-hidden
              className={cn('size-4 transition-transform', open && 'rotate-180')}
            />
          </button>
        )}
      </div>
      {run.error && <p className="mt-1 type-small text-danger-fg">{run.error}</p>}
      {open && (
        <ol id={panelId} className="mt-3 flex flex-col gap-2 border-l-2 border-border pl-4">
          {run.actionLogs.map((log, i) => (
            <li key={i} className="flex items-start gap-2">
              {logIcons[log.status]}
              <div className="min-w-0">
                <p className="type-small font-medium text-fg">
                  {actionLabel(log.type)}{' '}
                  <span className="font-normal text-fg-muted">
                    — {actionLogStatusLabels[log.status]}
                  </span>
                </p>
                {log.message && (
                  <p className="type-small break-words text-fg-muted">{log.message}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
