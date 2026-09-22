import { Link } from 'react-router';
import { Plus, Workflow as WorkflowIcon } from 'lucide-react';
import { useWorkflows } from '@/api/workflows';
import { usePipelines } from '@/api/pipelines';
import { buttonClasses } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { errorMessage } from '@/lib/api-client';
import { useSession } from '@/providers/session';
import { WorkflowCard } from './workflow-card';

const EXAMPLES = [
  'When a lead is created, share it out to the team in turn and add a follow-up task.',
  'When a lead becomes Qualified, let the owner know and rescore it with AI.',
  'When a deal is won, send it to your invoicing app with a webhook.',
];

function NewWorkflowLink({ label = 'New workflow' }: { label?: string }) {
  return (
    <Link to="/workflows/new" className={buttonClasses({ variant: 'primary' })}>
      <Plus aria-hidden />
      {label}
    </Link>
  );
}

function ListSkeleton() {
  return (
    <LoadingRegion label="Loading workflows…">
      <ul className="flex flex-col gap-3" aria-hidden>
        {[0, 1, 2].map((i) => (
          <li key={i} className="rounded-xl border border-border bg-surface p-4">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="mt-2 h-4 w-72 max-w-full" />
            <Skeleton className="mt-3 h-4 w-56 max-w-full" />
          </li>
        ))}
      </ul>
    </LoadingRegion>
  );
}

export default function WorkflowsPage() {
  useDocumentTitle('Workflows');
  const { isAdmin } = useSession();
  const { data: workflows, isLoading, isError, error, refetch, isFetching } = useWorkflows();
  const { data: pipelines } = usePipelines();

  let body;
  if (isLoading) body = <ListSkeleton />;
  else if (isError)
    body = (
      <ErrorState
        message={errorMessage(error)}
        onRetry={() => void refetch()}
        retrying={isFetching}
      />
    );
  else if (!workflows?.length) {
    body = (
      <div className="rounded-xl border border-border bg-surface">
        <EmptyState
          icon={WorkflowIcon}
          title="No workflows yet"
          text={
            isAdmin
              ? 'A workflow watches for something to happen, checks your conditions, then does the next step for you.'
              : 'Workflows do routine steps automatically. An admin on your team can set them up.'
          }
          action={isAdmin ? <NewWorkflowLink label="Create your first workflow" /> : undefined}
        />
        <div className="border-t border-border px-6 py-4">
          <h2 className="type-small font-medium text-fg">Ideas to get started</h2>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4 type-body text-fg-muted">
            {EXAMPLES.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  } else {
    body = (
      <ul className="flex flex-col gap-3" aria-label="Workflows">
        {workflows.map((wf) => (
          <WorkflowCard key={wf.id} workflow={wf} pipelines={pipelines} isAdmin={isAdmin} />
        ))}
      </ul>
    );
  }

  return (
    <div>
      <PageHeader
        title="Workflows"
        description="Automate the busywork: when something happens, LeadOS does the next step."
        actions={isAdmin ? <NewWorkflowLink /> : undefined}
      />
      {!isAdmin && workflows && workflows.length > 0 && (
        <p className="mb-4 type-small text-fg-muted">
          Only admins can change workflows. You can view them and their run history.
        </p>
      )}
      {body}
    </div>
  );
}
