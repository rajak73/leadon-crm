import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { History, MoreHorizontal, Pencil, Trash2, Zap } from 'lucide-react';
import type { Pipeline, Workflow } from '@leados/shared';
import { useDeleteWorkflow, useToggleWorkflow } from '@/api/workflows';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { RelativeTime } from '@/components/domain/relative-time';
import { pluralize } from '@/lib/format';
import { notify } from '@/lib/toast';
import { describeTrigger } from './workflow-text';

interface WorkflowCardProps {
  workflow: Workflow;
  pipelines: Pipeline[] | undefined;
  isAdmin: boolean;
}

export function WorkflowCard({ workflow: wf, pipelines, isAdmin }: WorkflowCardProps) {
  const navigate = useNavigate();
  const toggle = useToggleWorkflow();
  const remove = useDeleteWorkflow();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const switchId = `workflow-active-${wf.id}`;
  const actionCount = wf.definition.actions.length;

  return (
    <li className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="type-section">
            <Link
              to={`/workflows/${wf.id}`}
              className="break-words text-fg hover:text-primary-text hover:underline"
            >
              {wf.name}
            </Link>
          </h2>
          {wf.description && <p className="mt-0.5 type-body text-fg-muted">{wf.description}</p>}
          <p className="mt-2 flex items-start gap-1.5 type-small text-fg">
            <Zap aria-hidden className="mt-0.5 size-4 shrink-0 text-primary-text" />
            <span>
              {describeTrigger(wf.definition.trigger.type, wf.definition.trigger.config, pipelines)}
              <span className="text-fg-muted"> · {pluralize(actionCount, 'action')}</span>
            </span>
          </p>
          <p className="mt-1 type-caption text-fg-subtle">
            {wf.lastRunAt ? (
              <>
                Last run <RelativeTime date={wf.lastRunAt} />
              </>
            ) : (
              'Never run'
            )}
            <span className="tabular-nums"> · {pluralize(wf.runCount, 'run')}</span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {isAdmin ? (
            <div className="flex items-center gap-2">
              <Switch
                id={switchId}
                checked={wf.isActive}
                aria-label={`Active: ${wf.name}`}
                onCheckedChange={(isActive) =>
                  toggle.mutate(
                    { id: wf.id, isActive },
                    {
                      onSuccess: () =>
                        notify.success(isActive ? 'Workflow turned on' : 'Workflow paused'),
                    },
                  )
                }
              />
              <label htmlFor={switchId} className="type-small text-fg-muted" aria-hidden>
                Active
              </label>
            </div>
          ) : (
            <Badge tone={wf.isActive ? 'success' : 'neutral'} dot>
              {wf.isActive ? 'Active' : 'Paused'}
            </Badge>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                aria-label={`More options for ${wf.name}`}
                icon={<MoreHorizontal aria-hidden />}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                icon={<History aria-hidden />}
                onSelect={() => navigate(`/workflows/${wf.id}/runs`)}
              >
                View run history
              </DropdownMenuItem>
              <DropdownMenuItem
                icon={<Pencil aria-hidden />}
                onSelect={() => navigate(`/workflows/${wf.id}`)}
              >
                {isAdmin ? 'Edit' : 'View'}
              </DropdownMenuItem>
              {isAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    destructive
                    icon={<Trash2 aria-hidden />}
                    onSelect={() => setConfirmOpen(true)}
                  >
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {isAdmin && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`Delete workflow “${wf.name}”?`}
          description="It will stop running straight away. This can't be undone."
          confirmLabel="Delete workflow"
          onConfirm={async () => {
            await remove.mutateAsync(wf.id);
            notify.success('Workflow deleted');
          }}
        />
      )}
    </li>
  );
}
