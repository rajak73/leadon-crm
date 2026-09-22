import { useLeadScores } from '@/api/leads';
import { scoreLabel, scoreTone } from '@/components/domain/badges';
import { RelativeTime } from '@/components/domain/relative-time';
import { ErrorState } from '@/components/ui/empty-state';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api-client';
import { aiTriggerLabels } from '@/lib/labels';
import { cn } from '@/lib/cn';
import { toneFill } from './score-ring';

/** Previous AI scores for a lead, newest first, each with a small bar. */
export function ScoreHistory({ leadId }: { leadId: string }) {
  const { data, isLoading, error, refetch } = useLeadScores(leadId);
  if (isLoading)
    return (
      <LoadingRegion label="Loading score history…" className="space-y-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </LoadingRegion>
    );
  if (error)
    return <ErrorState compact message={errorMessage(error)} onRetry={() => void refetch()} />;
  if (!data?.length) return <p className="type-small text-fg-muted">No earlier scores.</p>;
  return (
    <ol className="flex flex-col gap-2">
      {data.map((s) => (
        <li key={s.id} className="grid grid-cols-[2.5rem_1fr] items-center gap-x-3">
          <span className="type-small font-medium text-fg tabular-nums">
            {s.score}
            <span className="sr-only"> out of 100, {scoreLabel(s.score)}</span>
          </span>
          <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full', toneFill[scoreTone(s.score)])}
              style={{ width: `${s.score}%` }}
            />
          </div>
          <p className="col-start-2 type-caption text-fg-subtle">
            {aiTriggerLabels[s.triggeredBy]} · <RelativeTime date={s.createdAt} />
          </p>
        </li>
      ))}
    </ol>
  );
}
