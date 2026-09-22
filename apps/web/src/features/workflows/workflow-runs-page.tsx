import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, History } from 'lucide-react';
import { useWorkflow, useWorkflowRuns } from '@/api/workflows';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api-client';
import { RunItem } from './run-item';

export default function WorkflowRunsPage() {
  const { id = '' } = useParams();
  const [page, setPage] = useState(1);
  const { data: workflow } = useWorkflow(id);
  const runs = useWorkflowRuns(id, page);
  useDocumentTitle(workflow ? `Run history · ${workflow.name}` : 'Run history');

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            to={`/workflows/${id}`}
            className="inline-flex items-center gap-1 type-small text-fg-muted hover:text-fg"
          >
            <ArrowLeft aria-hidden className="size-4" /> {workflow?.name ?? 'Workflow'}
          </Link>
        }
        title="Run history"
        description={workflow ? `Every time “${workflow.name}” ran, newest first.` : undefined}
      />
      <Card>
        {runs.isLoading ? (
          <LoadingRegion label="Loading runs…" className="divide-y divide-border">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex gap-3 px-4 py-4">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 flex-1" />
              </div>
            ))}
          </LoadingRegion>
        ) : runs.error ? (
          <ErrorState message={errorMessage(runs.error)} onRetry={() => void runs.refetch()} />
        ) : !runs.data?.data.length ? (
          <EmptyState
            icon={History}
            title="No runs yet"
            text="Runs appear here when the trigger happens."
          />
        ) : (
          <ul className="divide-y divide-border">
            {runs.data.data.map((run) => (
              <li key={run.id}>
                <RunItem run={run} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Pagination meta={runs.data?.meta} onPageChange={setPage} noun="runs" />
    </>
  );
}
