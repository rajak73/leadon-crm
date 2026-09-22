import { useId, type ReactNode } from 'react';
import { BarChart3 } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/cn';

export interface ChartTable {
  caption: string;
  columns: string[];
  rows: string[][];
}

interface ChartCardProps {
  title: string;
  description?: string;
  /** Visually hidden table that carries every value for screen readers. */
  table: ChartTable;
  empty?: string | false;
  className?: string;
  children: ReactNode;
  actions?: ReactNode;
}

/** Card with an h2, the (decorative) chart, and an accessible data table twin. */
export function ChartCard({
  title,
  description,
  table,
  empty,
  className,
  children,
  actions,
}: ChartCardProps) {
  const headingId = useId();
  return (
    <Card className={cn('flex min-w-0 flex-col', className)}>
      <section aria-labelledby={headingId} className="flex flex-1 flex-col">
        <CardHeader id={headingId} title={title} description={description} actions={actions} />
        <CardBody className="flex-1">
          {empty ? (
            <EmptyState compact icon={BarChart3} title={empty} text="Try a longer date range." />
          ) : (
            <>
              <div aria-hidden>{children}</div>
              {/* Wrap the data table: a <table> ignores the 1px height from sr-only and would
                  stretch the page's scroll area. */}
              <div className="sr-only">
                <table>
                  <caption>{table.caption}</caption>
                  <thead>
                    <tr>
                      {table.columns.map((c) => (
                        <th key={c} scope="col">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((r, i) => (
                      <tr key={i}>
                        {r.map((cell, j) =>
                          j === 0 ? (
                            <th key={j} scope="row">
                              {cell}
                            </th>
                          ) : (
                            <td key={j}>{cell}</td>
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardBody>
      </section>
    </Card>
  );
}

interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

/** Recharts tooltip styled with theme tokens. Rendered via `content={(p) => <ChartTooltip … />}`. */
export function ChartTooltip({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised px-3 py-2 shadow-md">
      <p className="type-caption font-medium text-fg">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="mt-0.5 flex items-center gap-2 type-caption text-fg-muted">
          {r.color && (
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ backgroundColor: r.color }}
            />
          )}
          <span>{r.label}</span>
          <span className="ml-auto pl-3 font-medium text-fg tabular-nums">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

/** Shared axis/grid styling (CSS variables so both themes work). */
export const axisProps = {
  stroke: 'var(--color-border)',
  tick: { fill: 'var(--color-fg-subtle)', fontSize: 12 },
  tickLine: false,
  axisLine: false,
} as const;
