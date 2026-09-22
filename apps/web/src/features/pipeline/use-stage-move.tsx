import { useState } from 'react';
import type { PipelineStage } from '@leados/shared';
import { useMoveDeal } from '@/api/pipelines';
import { LostReasonDialog } from '@/components/domain/lost-reason-dialog';
import { notify } from '@/lib/toast';

interface MovableDeal {
  id: string;
  title: string;
  stage: { id: string };
}

/**
 * Shared "move deal to stage" flow for the board and the deal page.
 * Moving into the Lost stage asks for a reason first; the API is only called
 * after the person confirms. Moving into the Won stage celebrates with a toast.
 */
export function useStageMove(pipelineId: string) {
  const move = useMoveDeal(pipelineId);
  const [pending, setPending] = useState<{ deal: MovableDeal; stageId: string } | null>(null);

  function requestMove(deal: MovableDeal, stage: PipelineStage) {
    if (deal.stage.id === stage.id) return;
    if (stage.isLost) {
      setPending({ deal, stageId: stage.id });
      return;
    }
    move.mutate(
      { dealId: deal.id, stageId: stage.id },
      { onSuccess: () => (stage.isWon ? notify.success('Deal won') : undefined) },
    );
  }

  const lostDialog = (
    <LostReasonDialog
      open={pending !== null}
      onOpenChange={(open) => !open && setPending(null)}
      name={pending?.deal.title ?? ''}
      kind="deal"
      onConfirm={(reason) => {
        if (!pending) return;
        move.mutate(
          { dealId: pending.deal.id, stageId: pending.stageId, lostReason: reason },
          { onSuccess: () => notify.success('Deal marked as lost') },
        );
      }}
    />
  );

  return { requestMove, lostDialog, isMoving: move.isPending };
}
