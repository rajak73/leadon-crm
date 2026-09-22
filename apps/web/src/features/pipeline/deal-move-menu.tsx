import { ArrowRightLeft } from 'lucide-react';
import type { PipelineStage } from '@leados/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StageDot } from './stage-dot';

interface DealMoveMenuProps {
  dealTitle: string;
  currentStageId: string;
  stages: ReadonlyArray<PipelineStage>;
  onMove: (stage: PipelineStage) => void;
  className?: string;
}

/** Non-drag alternative for moving a deal between stages (keyboard, touch, screen readers). */
export function DealMoveMenu({
  dealTitle,
  currentStageId,
  stages,
  onMove,
  className,
}: DealMoveMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={`Move deal ${dealTitle}`}
          icon={<ArrowRightLeft aria-hidden />}
          className={className}
          // Keep the board's drag sensor from treating the menu click as a drag start.
          onPointerDown={(e) => e.stopPropagation()}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Move to…</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={currentStageId}
          onValueChange={(id) => {
            const stage = stages.find((s) => s.id === id);
            // Let the menu close and hand focus back before a follow-up dialog (lost reason) opens.
            if (stage) window.setTimeout(() => onMove(stage), 0);
          }}
        >
          {stages.map((s) => (
            <DropdownMenuRadioItem key={s.id} value={s.id}>
              <span className="flex items-center gap-2">
                <StageDot color={s.color} />
                {s.name}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
