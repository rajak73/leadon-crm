import type { DealStatus, LeadStatus, TaskPriority } from '@leados/shared';
import { Flame } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  dealStatusLabels,
  dealStatusTones,
  leadStatusLabels,
  leadStatusTones,
  taskPriorityLabels,
  taskPriorityTones,
  type Tone,
} from '@/lib/labels';

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return (
    <Badge tone={leadStatusTones[status]} dot>
      {leadStatusLabels[status]}
    </Badge>
  );
}

export function DealStatusBadge({ status }: { status: DealStatus }) {
  return <Badge tone={dealStatusTones[status]}>{dealStatusLabels[status]}</Badge>;
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return <Badge tone={taskPriorityTones[priority]}>{taskPriorityLabels[priority]}</Badge>;
}

export function scoreTone(score: number): Tone {
  if (score >= 70) return 'success';
  if (score >= 40) return 'warning';
  return 'neutral';
}

export function scoreLabel(score: number): string {
  if (score >= 70) return 'Hot';
  if (score >= 40) return 'Warm';
  return 'Cold';
}

/** AI score pill: number + Hot/Warm/Cold wording so colour isn't the only signal. */
export function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="type-small text-fg-subtle">Not scored</span>;
  return (
    <Badge
      tone={scoreTone(score)}
      className="tabular-nums"
      aria-label={`AI score ${score} out of 100, ${scoreLabel(score)}`}
    >
      {score >= 70 && <Flame aria-hidden className="size-3" />}
      {score}
      <span className="font-normal opacity-80">· {scoreLabel(score)}</span>
    </Badge>
  );
}

export function OverdueBadge() {
  return <Badge tone="danger">Overdue</Badge>;
}
