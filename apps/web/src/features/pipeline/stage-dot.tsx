import { CircleCheck, CircleX } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Coloured dot for a stage. The colour comes from the API; falls back to a neutral token. */
export function StageDot({ color, className }: { color: string | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-2.5 shrink-0 rounded-full',
        !color && 'bg-fg-subtle',
        className,
      )}
      style={color ? { backgroundColor: color } : undefined}
    />
  );
}

/** "Won" / "Lost" marker so colour is never the only signal. */
export function StageOutcome({ stage }: { stage: { isWon: boolean; isLost: boolean } }) {
  if (stage.isWon)
    return (
      <span className="inline-flex items-center gap-1 type-caption font-medium text-success-fg">
        <CircleCheck aria-hidden className="size-3.5" />
        Won
      </span>
    );
  if (stage.isLost)
    return (
      <span className="inline-flex items-center gap-1 type-caption font-medium text-danger-fg">
        <CircleX aria-hidden className="size-3.5" />
        Lost
      </span>
    );
  return null;
}
