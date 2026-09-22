import { Trophy } from 'lucide-react';
import type { DashboardSummary } from '@leados/shared';
import { Avatar } from '@/components/ui/avatar';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { formatMoney, personName, pluralize } from '@/lib/format';

export function TopPerformers({
  summary,
  className,
}: {
  summary: DashboardSummary;
  className?: string;
}) {
  const people = summary.topPerformers.slice(0, 5);
  return (
    <Card className={className}>
      <CardHeader title="Top performers" description="Deals won in this period" />
      <CardBody>
        {people.length === 0 ? (
          <EmptyState
            compact
            icon={Trophy}
            title="No deals won in this period"
            text="Wins will show up here."
          />
        ) : (
          <ol className="flex flex-col gap-3">
            {people.map((p, i) => {
              const name = personName(p.user);
              return (
                <li key={p.user.id} className="flex items-center gap-3">
                  <span className="w-4 type-small text-fg-subtle tabular-nums">{i + 1}</span>
                  <Avatar name={name} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate type-body font-medium text-fg">{name}</p>
                    <p className="type-small text-fg-muted">{pluralize(p.wonCount, 'deal')} won</p>
                  </div>
                  <span className="type-body font-medium text-fg tabular-nums">
                    {formatMoney(p.wonValue, summary.currency, { compact: true })}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}
