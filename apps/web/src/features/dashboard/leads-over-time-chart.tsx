import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DashboardSummary } from '@leados/shared';
import { formatDate, formatNumber, pluralize } from '@/lib/format';
import { axisProps, ChartCard, ChartTooltip, type ChartTable } from './chart-card';

type Point = DashboardSummary['leadsOverTime'][number];

const toDate = (ymd: string) => new Date(`${ymd}T00:00`);
const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

/** Daily rows for short ranges; monthly totals for long ones so the table stays readable. */
function buildTable(points: Point[]): ChartTable {
  if (points.length <= 62) {
    return {
      caption: 'New leads per day',
      columns: ['Date', 'New leads'],
      rows: points.map((p) => [formatDate(toDate(p.date)), formatNumber(p.count)]),
    };
  }
  const months = new Map<string, number>();
  for (const p of points) {
    const key = monthFmt.format(toDate(p.date));
    months.set(key, (months.get(key) ?? 0) + p.count);
  }
  return {
    caption: 'New leads per month',
    columns: ['Month', 'New leads'],
    rows: [...months].map(([m, c]) => [m, formatNumber(c)]),
  };
}

export function LeadsOverTimeChart({ points, className }: { points: Point[]; className?: string }) {
  const total = points.reduce((s, p) => s + p.count, 0);
  return (
    <ChartCard
      title="New leads"
      description={total > 0 ? `${pluralize(total, 'lead')} in this period` : undefined}
      empty={total === 0 && 'No leads in this period'}
      table={buildTable(points)}
      className={className}
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid vertical={false} stroke="var(--color-border)" />
            <XAxis
              dataKey="date"
              {...axisProps}
              minTickGap={24}
              tickFormatter={(d: string) => formatDate(toDate(d))}
            />
            <YAxis {...axisProps} allowDecimals={false} width={48} />
            <Tooltip
              cursor={{ stroke: 'var(--color-border-strong)', strokeWidth: 1 }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as Point | undefined;
                if (!active || !p) return null;
                return (
                  <ChartTooltip
                    title={formatDate(toDate(p.date))}
                    rows={[
                      {
                        label: 'New leads',
                        value: formatNumber(p.count),
                        color: 'var(--color-chart-1)',
                      },
                    ]}
                  />
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="var(--color-chart-1)"
              strokeWidth={2}
              fill="var(--color-chart-1)"
              fillOpacity={0.1}
              activeDot={{
                r: 4,
                stroke: 'var(--color-surface)',
                strokeWidth: 2,
                fill: 'var(--color-chart-1)',
              }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
