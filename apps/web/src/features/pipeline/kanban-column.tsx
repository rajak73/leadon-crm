import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Deal, PipelineStage } from '@leados/shared';
import { cn } from '@/lib/cn';
import { formatMoney, pluralize } from '@/lib/format';
import { DealCard } from './deal-card';
import { StageDot, StageOutcome } from './stage-dot';

export const columnId = (stageId: string) => `stage:${stageId}`;

interface KanbanColumnProps {
  stage: PipelineStage;
  stages: ReadonlyArray<PipelineStage>;
  deals: Deal[];
  currency: string;
  onMove: (deal: Deal, stage: PipelineStage) => void;
}

export function KanbanColumn({ stage, stages, deals, currency, onMove }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnId(stage.id),
    data: { type: 'stage', stageId: stage.id },
  });
  const total = deals.reduce((sum, d) => sum + (d.value ?? 0), 0);
  const headingId = `stage-heading-${stage.id}`;

  return (
    <section
      aria-labelledby={headingId}
      className="flex w-72 shrink-0 snap-start flex-col rounded-xl border border-border bg-muted/50"
    >
      <header className="flex flex-col gap-0.5 border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <StageDot color={stage.color} />
          <h2 id={headingId} className="min-w-0 flex-1 truncate type-small font-semibold text-fg">
            {stage.name}
          </h2>
          <StageOutcome stage={stage} />
        </div>
        <p className="type-caption text-fg-muted tabular-nums">
          {pluralize(deals.length, 'deal')} · {formatMoney(total, currency)}
        </p>
      </header>
      <div
        ref={setNodeRef}
        className={cn(
          'min-h-32 flex-1 rounded-b-xl p-2 transition-colors',
          isOver && 'bg-primary-subtle',
        )}
      >
        <SortableContext items={deals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-2" aria-label={`Deals in ${stage.name}`}>
            {deals.map((deal) => (
              <DealCard key={deal.id} deal={deal} stages={stages} onMove={onMove} />
            ))}
          </ul>
        </SortableContext>
        {deals.length === 0 && (
          <p className="px-2 py-6 text-center type-caption text-fg-subtle">Drop deals here</p>
        )}
      </div>
    </section>
  );
}
