import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { Pipeline } from '@leados/shared';
import { useDeletePipeline } from '@/api/pipelines';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { pluralize } from '@/lib/format';
import { notify } from '@/lib/toast';
import { StageDot, StageOutcome } from '@/features/pipeline/stage-dot';

export function PipelineListItem({ pipeline, onEdit }: { pipeline: Pipeline; onEdit: () => void }) {
  const remove = useDeletePipeline();
  const [confirming, setConfirming] = useState(false);
  const dealCount = pipeline.stages.reduce((sum, s) => sum + s.dealCount, 0);

  const deleteButton = (
    <Button
      variant="ghost"
      size="sm"
      icon={<Trash2 aria-hidden />}
      aria-disabled={pipeline.isDefault || undefined}
      className={cn(pipeline.isDefault && 'cursor-not-allowed opacity-50 hover:bg-transparent')}
      onClick={() => !pipeline.isDefault && setConfirming(true)}
    >
      Delete
    </Button>
  );

  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="type-section text-fg">{pipeline.name}</h3>
          {pipeline.isDefault && <Badge tone="primary">Default</Badge>}
        </div>
        <p className="mt-0.5 type-small text-fg-muted tabular-nums">
          {pluralize(pipeline.stages.length, 'stage')} · {pluralize(dealCount, 'deal')}
        </p>
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`Stages in ${pipeline.name}`}>
          {pipeline.stages.map((s) => (
            <li
              key={s.id}
              className="inline-flex h-6 items-center gap-1.5 rounded-full border border-border bg-surface px-2 type-caption text-fg"
            >
              <StageDot color={s.color} className="size-2" />
              {s.name}
              {(s.isWon || s.isLost) && <StageOutcome stage={s} />}
              <span aria-hidden className="text-fg-subtle tabular-nums">
                {s.dealCount}
              </span>
              <span className="sr-only">, {pluralize(s.dealCount, 'deal')}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="secondary" size="sm" icon={<Pencil aria-hidden />} onClick={onEdit}>
          Edit
        </Button>
        {pipeline.isDefault ? (
          <Tooltip content="The default pipeline can't be deleted. Make another pipeline the default first.">
            {deleteButton}
          </Tooltip>
        ) : (
          deleteButton
        )}
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete pipeline “${pipeline.name}”? This can't be undone.`}
        description="Pipelines that still hold deals can't be deleted — move or delete those deals first."
        confirmLabel="Delete pipeline"
        onConfirm={async () => {
          await remove.mutateAsync(pipeline.id);
          notify.success('Pipeline deleted');
        }}
      />
    </li>
  );
}
