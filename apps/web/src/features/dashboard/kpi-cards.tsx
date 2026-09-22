import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { DashboardSummary } from '@leados/shared';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { changeRatio, formatMoney, formatNumber, formatPercent } from '@/lib/format';

function Change({ value, previous }: { value: number; previous: number }) {
  const ratio = changeRatio(value, previous);
  if (ratio === null)
    return <p className="type-small text-fg-subtle">No data for the previous period</p>;
  if (ratio === 0)
    return (
      <p className="inline-flex items-center gap-1 type-small text-fg-muted">
        <Minus aria-hidden className="size-3.5" />
        No change from the previous period
      </p>
    );
  const up = ratio > 0;
  const pct = formatPercent(Math.abs(ratio));
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <p className="type-small text-fg-muted">
      <span aria-hidden className="inline-flex items-center gap-1">
        <span
          className={cn(
            'inline-flex items-center gap-0.5 font-medium',
            up ? 'text-success-fg' : 'text-danger-fg',
          )}
        >
          <Icon className="size-3.5" />
          {pct}
        </span>
        vs previous period
      </span>
      <span className="sr-only">
        {up ? 'up' : 'down'} {pct} from the previous period
      </span>
    </p>
  );
}

function Kpi({ label, value, footer }: { label: string; value: string; footer: ReactNode }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <h2 className="type-small font-medium text-fg-muted">{label}</h2>
      <p className="type-metric text-fg">{value}</p>
      <div className="mt-auto">{footer}</div>
    </Card>
  );
}

export function KpiCards({ summary }: { summary: DashboardSummary }) {
  const { kpis, currency } = summary;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <Kpi
        label="New leads"
        value={formatNumber(kpis.newLeads.value)}
        footer={<Change {...kpis.newLeads} />}
      />
      <Kpi
        label="Conversion rate"
        value={formatPercent(kpis.conversionRate.value)}
        footer={<Change {...kpis.conversionRate} />}
      />
      <Kpi
        label="Open pipeline value"
        value={formatMoney(kpis.openPipelineValue.value, currency, { compact: true })}
        footer={<p className="type-small text-fg-subtle">Across all open deals</p>}
      />
      <Kpi
        label="Won value"
        value={formatMoney(kpis.wonValue.value, currency, { compact: true })}
        footer={<Change {...kpis.wonValue} />}
      />
      <Kpi
        label="Open tasks"
        value={formatNumber(kpis.openTasks.value)}
        footer={
          kpis.openTasks.overdue > 0 ? (
            <p className="type-small font-medium text-danger-fg">
              {formatNumber(kpis.openTasks.overdue)} overdue
            </p>
          ) : (
            <p className="type-small text-fg-subtle">None overdue</p>
          )
        }
      />
    </div>
  );
}
