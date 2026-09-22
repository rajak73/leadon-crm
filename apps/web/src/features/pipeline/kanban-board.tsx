import { useMemo, useRef, useState } from 'react';
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type Over,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { Deal, PipelineBoard, PipelineStage } from '@leados/shared';
import { DealCardOverlay } from './deal-card';
import { KanbanColumn } from './kanban-column';
import { useStageMove } from './use-stage-move';

const screenReaderInstructions = {
  draggable:
    'To move a deal, press Space or Enter to pick it up. Use the arrow keys to move it to another stage, ' +
    'then press Space or Enter to drop it, or Escape to cancel. You can also use the Move deal menu on each card.',
};

function stageIdOf(over: Over | null): string | undefined {
  const data = over?.data.current as { stageId?: string } | undefined;
  return data?.stageId;
}

interface KanbanBoardProps {
  board: PipelineBoard;
  currency: string;
}

export function KanbanBoard({ board, currency }: KanbanBoardProps) {
  const { pipeline, deals } = board;
  const stages = pipeline.stages;
  const { requestMove, lostDialog } = useStageMove(pipeline.id);
  const [activeId, setActiveId] = useState<string | null>(null);
  const suppressClickUntil = useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byStage = useMemo(() => {
    const map = new Map<string, Deal[]>(stages.map((s) => [s.id, []]));
    for (const d of deals) map.get(d.stage.id)?.push(d);
    return map;
  }, [stages, deals]);

  const dealById = (id: string | number) => deals.find((d) => d.id === String(id));
  const stageById = (id: string | undefined) => stages.find((s) => s.id === id);
  const activeDeal = activeId ? dealById(activeId) : undefined;

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up deal ${dealById(active.id)?.title ?? ''}.`,
    onDragOver: ({ active, over }) => {
      const title = dealById(active.id)?.title ?? '';
      const stage = stageById(stageIdOf(over));
      return stage ? `Deal ${title} is over ${stage.name}.` : `Deal ${title} is not over a stage.`;
    },
    onDragEnd: ({ active, over }) => {
      const deal = dealById(active.id);
      const stage = stageById(stageIdOf(over));
      if (!deal) return undefined;
      if (!stage || stage.id === deal.stage.id) return `Moved back to ${deal.stage.name}.`;
      if (stage.isLost)
        return `Deal ${deal.title} dropped on ${stage.name}. Add a reason to confirm.`;
      return `Deal ${deal.title} moved to ${stage.name}.`;
    },
    onDragCancel: ({ active }) => {
      const deal = dealById(active.id);
      return deal ? `Moved back to ${deal.stage.name}.` : undefined;
    },
  };

  function onDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id));
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    suppressClickUntil.current = Date.now() + 200;
    const deal = dealById(active.id);
    const stage = stageById(stageIdOf(over));
    if (deal && stage) requestMove(deal, stage);
  }

  function onMove(deal: Deal, stage: PipelineStage) {
    requestMove(deal, stage);
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        accessibility={{ announcements, screenReaderInstructions }}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        {/* Only the board scrolls sideways (with snap on small screens), never the page. */}
        <div
          className="flex min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto pb-4 md:snap-none"
          onClickCapture={(e) => {
            // A drop right after a drag shouldn't also open the deal.
            if (Date.now() < suppressClickUntil.current) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          {stages.map((stage) => (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              stages={stages}
              deals={byStage.get(stage.id) ?? []}
              currency={currency}
              onMove={onMove}
            />
          ))}
        </div>
        <DragOverlay>{activeDeal ? <DealCardOverlay deal={activeDeal} /> : null}</DragOverlay>
      </DndContext>
      {lostDialog}
    </>
  );
}
