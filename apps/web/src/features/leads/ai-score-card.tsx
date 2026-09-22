import { useState } from 'react';
import { ChevronRight, Minus, Plus, RefreshCw, Sparkles } from 'lucide-react';
import type { LeadDetail } from '@leados/shared';
import { useRescoreLead } from '@/api/leads';
import { scoreLabel } from '@/components/domain/badges';
import { RelativeTime } from '@/components/domain/relative-time';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { aiTriggerLabels } from '@/lib/labels';
import { notify } from '@/lib/toast';
import { ScoreHistory } from './score-history';
import { ScoreRing } from './score-ring';

/** "gpt-4o-mini" → "GPT-4o mini"; rules-based versions → "built-in rules". */
export function modelLabel(modelVersion: string): string {
  if (modelVersion.toLowerCase().startsWith('rules')) return 'built-in rules';
  const [first = '', second, ...rest] = modelVersion.split('-');
  if (first.toLowerCase() === 'gpt' && second) return [`GPT-${second}`, ...rest].join(' ');
  return modelVersion;
}

export function AiScoreCard({ lead }: { lead: LeadDetail }) {
  const rescore = useRescoreLead(lead.id);
  const [historyOpen, setHistoryOpen] = useState(false);
  const score = lead.latestScore;

  function run() {
    rescore.mutate(undefined, {
      onSuccess: (s) => notify.success(`Scored ${s.score} out of 100 (${scoreLabel(s.score)})`),
      onError: (err) => notify.error(err, "We couldn't score this lead right now."),
    });
  }

  const rescoreButton = (
    <Button size="sm" icon={<RefreshCw aria-hidden />} loading={rescore.isPending} onClick={run}>
      {rescore.isPending ? 'Scoring…' : 'Rescore'}
    </Button>
  );

  return (
    <Card aria-labelledby="ai-score-heading">
      <CardHeader
        id="ai-score-heading"
        title="AI score"
        actions={score ? rescoreButton : undefined}
      />
      <CardBody>
        {!score ? (
          <EmptyState
            compact
            icon={Sparkles}
            title="Not scored yet"
            text="Get a 0–100 score with the reasons behind it."
            action={
              <Button
                variant="primary"
                icon={<Sparkles aria-hidden />}
                loading={rescore.isPending}
                onClick={run}
              >
                {rescore.isPending ? 'Scoring…' : 'Score now'}
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <ScoreRing score={score.score} />
              <div className="min-w-0">
                <p className="type-section text-fg">{scoreLabel(score.score)} lead</p>
                <p className="type-caption text-fg-subtle">
                  Scored by {modelLabel(score.modelVersion)} ·{' '}
                  <RelativeTime date={score.createdAt} />
                </p>
                <p className="type-caption text-fg-subtle">{aiTriggerLabels[score.triggeredBy]}</p>
              </div>
            </div>
            {score.factors.length > 0 && (
              <ul className="flex flex-col gap-2" aria-label="What affected the score">
                {score.factors.map((f, i) => {
                  const positive = f.type === 'POSITIVE';
                  const Icon = positive ? Plus : Minus;
                  return (
                    <li key={i} className="flex items-start gap-2 type-small text-fg">
                      <span
                        className={
                          positive
                            ? 'mt-0.5 rounded-full bg-success-subtle p-0.5 text-success-fg'
                            : 'mt-0.5 rounded-full bg-danger-subtle p-0.5 text-danger-fg'
                        }
                      >
                        <Icon aria-hidden className="size-3" strokeWidth={3} />
                      </span>
                      <span>
                        <span className="sr-only">{positive ? 'Helps: ' : 'Hurts: '}</span>
                        {f.description}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {score.recommendation && (
              <div className="rounded-lg bg-primary-subtle/60 px-3 py-2">
                <p className="type-caption font-medium text-primary-subtle-fg">
                  Suggested next step
                </p>
                <p className="type-small text-fg">{score.recommendation}</p>
              </div>
            )}
            <details
              className="group border-t border-border pt-3"
              onToggle={(e) => setHistoryOpen((e.currentTarget as HTMLDetailsElement).open)}
            >
              <summary className="flex cursor-pointer list-none items-center gap-1 type-small font-medium text-fg-muted hover:text-fg [&::-webkit-details-marker]:hidden">
                <ChevronRight
                  aria-hidden
                  className="size-4 transition-transform group-open:rotate-90"
                />
                History
              </summary>
              <div className="mt-3">{historyOpen && <ScoreHistory leadId={lead.id} />}</div>
            </details>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
