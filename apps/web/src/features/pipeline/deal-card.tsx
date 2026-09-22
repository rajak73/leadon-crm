import type { CSSProperties, KeyboardEventHandler, PointerEventHandler } from 'react';
import { Link } from 'react-router';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CalendarDays, GripVertical } from 'lucide-react';
import type { Deal, PipelineStage } from '@leados/shared';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/cn';
import { formatDate, formatMoney, personName, startOfDay } from '@/lib/format';
import { DealMoveMenu } from './deal-move-menu';

export function isDealOverdue(deal: Pick<Deal, 'expectedCloseDate' | 'status'>): boolean {
  return (
    deal.status === 'OPEN' &&
    deal.expectedCloseDate !== null &&
    new Date(deal.expectedCloseDate).getTime() < startOfDay().getTime()
  );
}

function DealMeta({ deal }: { deal: Deal }) {
  const who = deal.contact ? personName(deal.contact) : deal.lead ? personName(deal.lead) : null;
  const overdue = isDealOverdue(deal);
  return (
    <>
      <p className="mt-1 type-body font-semibold text-fg tabular-nums">
        {formatMoney(deal.value, deal.currency)}
      </p>
      {who && <p className="truncate type-small text-fg-muted">{who}</p>}
      <div className="mt-2 flex items-center justify-between gap-2">
        {deal.expectedCloseDate ? (
          <span
            className={cn(
              'inline-flex items-center gap-1 type-caption',
              overdue ? 'font-medium text-danger-fg' : 'text-fg-subtle',
            )}
          >
            <CalendarDays aria-hidden className="size-3.5" />
            <span className="sr-only">Expected close </span>
            {formatDate(deal.expectedCloseDate)}
            {overdue && <span> · Overdue</span>}
          </span>
        ) : (
          <span className="type-caption text-fg-subtle">No close date</span>
        )}
        {deal.assignedTo ? (
          <Avatar name={personName(deal.assignedTo)} size="sm" decorative={false} />
        ) : (
          <span className="type-caption text-fg-subtle">Unassigned</span>
        )}
      </div>
    </>
  );
}

/** Static copy of a card shown under the pointer while dragging. */
export function DealCardOverlay({ deal }: { deal: Deal }) {
  return (
    <div className="w-72 cursor-grabbing rounded-lg border border-border-strong bg-surface-raised p-3 shadow-lg">
      <p className="truncate type-body font-medium text-fg">{deal.title}</p>
      <DealMeta deal={deal} />
    </div>
  );
}

interface DealCardProps {
  deal: Deal;
  stages: ReadonlyArray<PipelineStage>;
  onMove: (deal: Deal, stage: PipelineStage) => void;
}

export function DealCard({ deal, stages, onMove }: DealCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: deal.id,
    data: { type: 'deal', stageId: deal.stage.id },
  });
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition };

  return (
    <li
      ref={setNodeRef}
      style={style}
      // Pointer drags start anywhere on the card (after 5px of movement, so clicks still work).
      onPointerDown={listeners?.onPointerDown as PointerEventHandler | undefined}
      className={cn(
        'group relative rounded-lg border border-border bg-surface p-3 shadow-sm transition-colors hover:border-border-strong',
        isDragging && 'opacity-40',
      )}
    >
      <div className="flex items-start gap-1">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          onKeyDown={listeners?.onKeyDown as KeyboardEventHandler | undefined}
          aria-label={`Drag deal ${deal.title}`}
          className="relative z-10 -ml-1 flex h-6 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-fg-subtle hover:text-fg"
        >
          <GripVertical aria-hidden className="size-4" />
        </button>
        <Link
          to={`/deals/${deal.id}`}
          draggable={false}
          className="min-w-0 flex-1 truncate type-body font-medium text-fg after:absolute after:inset-0 after:rounded-lg hover:underline"
        >
          {deal.title}
        </Link>
        <DealMoveMenu
          dealTitle={deal.title}
          currentStageId={deal.stage.id}
          stages={stages}
          onMove={(stage) => onMove(deal, stage)}
          className="relative z-10 -mt-1 -mr-1 size-7"
        />
      </div>
      <div className="pl-4">
        <DealMeta deal={deal} />
      </div>
    </li>
  );
}
