import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { axisProps, ChartTooltip } from './chart-card';

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  /** Colour for this bar (e.g. a stage colour from the API); defaults to chart-1. */
  color?: string | null;
  tooltip: Array<{ label: string; value: string }>;
}

const ROW = 36;

/** Horizontal bar chart for ranked categories, labels on the left, value at the bar tip. */
export function BarListChart({
  data,
  formatValue,
}: {
  data: BarDatum[];
  formatValue: (v: number) => string;
}) {
  return (
    <div style={{ height: data.length * ROW + 8 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 56, bottom: 4, left: 0 }}
          barCategoryGap={8}
        >
          <XAxis type="number" hide domain={[0, 'dataMax']} />
          <YAxis
            type="category"
            dataKey="label"
            {...axisProps}
            width={112}
            tickFormatter={(l: string) => (l.length > 16 ? `${l.slice(0, 15)}…` : l)}
          />
          <Tooltip
            cursor={{ fill: 'var(--color-muted)' }}
            content={({ active, payload }) => {
              const d = payload?.[0]?.payload as BarDatum | undefined;
              if (!active || !d) return null;
              return <ChartTooltip title={d.label} rows={d.tooltip} />;
            }}
          />
          <Bar
            dataKey="value"
            radius={[0, 4, 4, 0]}
            maxBarSize={24}
            isAnimationActive={false}
            minPointSize={2}
          >
            {data.map((d) => (
              <Cell key={d.key} fill={d.color ?? 'var(--color-chart-1)'} />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              formatter={(v: number) => formatValue(v)}
              style={{ fill: 'var(--color-fg-muted)', fontSize: 12 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
