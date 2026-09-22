import { scoreLabel, scoreTone } from '@/components/domain/badges';
import { cn } from '@/lib/cn';
import type { Tone } from '@/lib/labels';

export const toneStroke: Record<Tone, string> = {
  success: 'stroke-success',
  warning: 'stroke-warning',
  neutral: 'stroke-fg-subtle',
  primary: 'stroke-primary',
  danger: 'stroke-danger',
  info: 'stroke-info',
};

export const toneFill: Record<Tone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  neutral: 'bg-fg-subtle',
  primary: 'bg-primary',
  danger: 'bg-danger',
  info: 'bg-info',
};

const SIZE = 96;
const STROKE = 8;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

/** Circular 0–100 gauge. Colour follows the Hot/Warm/Cold tone; the number is always shown. */
export function ScoreRing({ score, className }: { score: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <div
      role="img"
      aria-label={`AI score ${clamped} out of 100, ${scoreLabel(clamped)}`}
      className={cn('relative inline-flex size-24 shrink-0 items-center justify-center', className)}
    >
      <svg aria-hidden viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 -rotate-90">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          strokeWidth={STROKE}
          className="stroke-muted"
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - clamped / 100)}
          className={cn(
            toneStroke[scoreTone(clamped)],
            'transition-[stroke-dashoffset] duration-500',
          )}
        />
      </svg>
      <span aria-hidden className="type-metric text-fg tabular-nums">
        {clamped}
      </span>
    </div>
  );
}
