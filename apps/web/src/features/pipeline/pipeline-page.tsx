import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Briefcase, KanbanSquare, Plus } from 'lucide-react';
import type { Pipeline } from '@leados/shared';
import { useDefaultCurrency } from '@/api/account';
import { usePipelineBoard, usePipelines } from '@/api/pipelines';
import { Button, buttonClasses } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useSession } from '@/providers/session';
import { errorMessage } from '@/lib/api-client';
import { formatMoney, pluralize } from '@/lib/format';
import { DealFormDialog } from './deal-form-dialog';
import { KanbanBoard } from './kanban-board';

function BoardSkeleton() {
  return (
    <LoadingRegion label="Loading pipeline…" className="flex gap-3 overflow-hidden pb-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          className="flex w-72 shrink-0 flex-col gap-2 rounded-xl border border-border bg-muted/50 p-3"
        >
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
          {Array.from({ length: 3 - (i % 2) }, (_, j) => (
            <Skeleton key={j} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ))}
    </LoadingRegion>
  );
}

function BoardSection({ pipelineId, onNewDeal }: { pipelineId: string; onNewDeal: () => void }) {
  const currency = useDefaultCurrency();
  const { data: board, isLoading, error, refetch, isRefetching } = usePipelineBoard(pipelineId);

  if (isLoading) return <BoardSkeleton />;
  if (error || !board)
    return (
      <ErrorState
        message={errorMessage(error)}
        onRetry={() => void refetch()}
        retrying={isRefetching}
      />
    );

  const open = board.deals.filter((d) => d.status === 'OPEN');
  const openValue = open.reduce((sum, d) => sum + (d.value ?? 0), 0);

  return (
    <>
      <p className="mb-4 type-small text-fg-muted" aria-live="polite">
        <span className="font-medium text-fg tabular-nums">
          {pluralize(open.length, 'open deal')}
        </span>
        {' · '}
        <span className="tabular-nums">{formatMoney(openValue, currency)}</span> in play
      </p>
      {board.deals.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No deals in this pipeline yet"
          text="Add your first deal and move it through the stages as it progresses."
          action={
            <Button variant="primary" icon={<Plus aria-hidden />} onClick={onNewDeal}>
              New deal
            </Button>
          }
        />
      ) : (
        <KanbanBoard board={board} currency={currency} />
      )}
    </>
  );
}

export default function PipelinePage() {
  useDocumentTitle('Pipeline');
  const { isAdmin } = useSession();
  const [params, setParams] = useSearchParams();
  const { data: pipelines, isLoading, error, refetch, isRefetching } = usePipelines();
  const [dialogOpen, setDialogOpen] = useState(false);

  const requested = params.get('pipeline');
  const fallback: Pipeline | undefined = pipelines?.find((p) => p.isDefault) ?? pipelines?.[0];
  const selected = pipelines?.find((p) => p.id === requested) ?? fallback;

  // `?new=1` (from quick actions) opens the dialog once, then tidies the URL.
  useEffect(() => {
    if (params.get('new') !== '1') return;
    setDialogOpen(true);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('new');
        return next;
      },
      { replace: true },
    );
  }, [params, setParams]);

  function selectPipeline(id: string) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('pipeline', id);
        return next;
      },
      { replace: true },
    );
  }

  const actions = (
    <>
      {pipelines && selected && (
        <Select
          aria-label="Pipeline"
          value={selected.id}
          onValueChange={selectPipeline}
          options={pipelines.map((p) => ({ value: p.id, label: p.name }))}
          className="w-48"
        />
      )}
      <Button
        variant="primary"
        icon={<Plus aria-hidden />}
        onClick={() => setDialogOpen(true)}
        disabled={!pipelines?.length}
      >
        New deal
      </Button>
    </>
  );

  let body;
  if (isLoading) body = <BoardSkeleton />;
  else if (error)
    body = (
      <ErrorState
        message={errorMessage(error)}
        onRetry={() => void refetch()}
        retrying={isRefetching}
      />
    );
  else if (!selected)
    body = (
      <EmptyState
        icon={KanbanSquare}
        title="No pipelines yet"
        text={
          isAdmin
            ? 'Create a pipeline with the stages your deals move through.'
            : 'Ask an admin to set up a pipeline so you can start tracking deals.'
        }
        action={
          isAdmin ? (
            <Link to="/settings/pipelines" className={buttonClasses({ variant: 'primary' })}>
              Set up pipelines
            </Link>
          ) : undefined
        }
      />
    );
  else
    body = (
      <BoardSection
        key={selected.id}
        pipelineId={selected.id}
        onNewDeal={() => setDialogOpen(true)}
      />
    );

  return (
    <div className="min-w-0">
      <PageHeader title="Pipeline" actions={actions} />
      {body}
      <DealFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultPipelineId={selected?.id}
      />
    </div>
  );
}
