import type { DashboardSummary } from '@leados/shared';
import { formatMoney, formatNumber, pluralize } from '@/lib/format';
import { leadSourceLabels } from '@/lib/labels';
import { BarListChart, type BarDatum } from './bar-list-chart';
import { ChartCard } from './chart-card';

export function PipelineByStageChart({
  summary,
  className,
}: {
  summary: DashboardSummary;
  className?: string;
}) {
  const { pipelineByStage: stages, currency } = summary;
  const money = (v: number) => formatMoney(v, currency, { compact: true });
  const data: BarDatum[] = stages.map((s) => ({
    key: s.stageId,
    label: s.stageName,
    value: s.value,
    color: s.color,
    tooltip: [
      { label: 'Value', value: formatMoney(s.value, currency) },
      { label: 'Deals', value: formatNumber(s.count) },
    ],
  }));
  const empty = stages.every((s) => s.count === 0);
  return (
    <ChartCard
      title="Pipeline by stage"
      description="Deal value in each stage"
      empty={empty && 'No deals in the pipeline yet'}
      className={className}
      table={{
        caption: 'Deals and value by pipeline stage',
        columns: ['Stage', 'Deals', 'Value'],
        rows: stages.map((s) => [
          s.stageName,
          formatNumber(s.count),
          formatMoney(s.value, currency),
        ]),
      }}
    >
      <BarListChart data={data} formatValue={money} />
    </ChartCard>
  );
}

export function LeadsBySourceChart({
  summary,
  className,
}: {
  summary: DashboardSummary;
  className?: string;
}) {
  const sources = summary.leadsBySource
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);
  const total = sources.reduce((sum, s) => sum + s.count, 0);
  const data: BarDatum[] = sources.map((s) => ({
    key: s.source,
    label: leadSourceLabels[s.source],
    value: s.count,
    tooltip: [
      { label: 'Leads', value: formatNumber(s.count) },
      { label: 'Share', value: `${Math.round((s.count / total) * 100)}%` },
    ],
  }));
  return (
    <ChartCard
      title="Leads by source"
      description={total > 0 ? `Where ${pluralize(total, 'new lead')} came from` : undefined}
      empty={total === 0 && 'No leads in this period'}
      className={className}
      table={{
        caption: 'New leads by source',
        columns: ['Source', 'Leads'],
        rows: sources.map((s) => [leadSourceLabels[s.source], formatNumber(s.count)]),
      }}
    >
      <BarListChart data={data} formatValue={formatNumber} />
    </ChartCard>
  );
}
