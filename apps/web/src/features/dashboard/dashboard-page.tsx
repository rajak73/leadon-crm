import { useSearchParams } from 'react-router';
import { useDashboard, type DashboardRange } from '@/api/misc';
import { ErrorState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { errorMessage } from '@/lib/api-client';
import { dashboardRangeLabels } from '@/lib/labels';
import { cn } from '@/lib/cn';
import { useCurrentUser } from '@/providers/session';
import { LeadsBySourceChart, PipelineByStageChart } from './breakdown-charts';
import { DashboardSkeleton } from './dashboard-skeleton';
import { KpiCards } from './kpi-cards';
import { LeadsOverTimeChart } from './leads-over-time-chart';
import { MyTasks } from './my-tasks';
import { TopPerformers } from './top-performers';

const RANGES = Object.keys(dashboardRangeLabels) as DashboardRange[];
const rangeOptions = RANGES.map((r) => ({ value: r, label: dashboardRangeLabels[r] }));

function greeting(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardPage() {
  useDocumentTitle('Dashboard');
  const user = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const rangeParam = params.get('range') as DashboardRange | null;
  const range: DashboardRange = rangeParam && RANGES.includes(rangeParam) ? rangeParam : '30d';
  const { data, error, isLoading, isPlaceholderData, refetch, isRefetching } = useDashboard(range);

  function setRange(next: string) {
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (next === '30d') n.delete('range');
        else n.set('range', next);
        return n;
      },
      { replace: true },
    );
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${greeting(new Date().getHours())}, ${user.firstName}`}
        actions={
          <Select
            aria-label="Date range"
            className="w-44"
            value={range}
            onValueChange={setRange}
            options={rangeOptions}
          />
        }
      />
      {isLoading ? (
        <DashboardSkeleton />
      ) : !data ? (
        <ErrorState
          message={errorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isRefetching}
        />
      ) : (
        <div
          aria-busy={isPlaceholderData || undefined}
          className={cn(
            'flex flex-col gap-4 transition-opacity',
            isPlaceholderData && 'opacity-60',
          )}
        >
          <KpiCards summary={data} />
          <div className="grid gap-4 lg:grid-cols-3">
            <LeadsOverTimeChart points={data.leadsOverTime} className="lg:col-span-2" />
            <MyTasks />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <PipelineByStageChart summary={data} />
            <LeadsBySourceChart summary={data} />
            <TopPerformers summary={data} />
          </div>
        </div>
      )}
    </>
  );
}
