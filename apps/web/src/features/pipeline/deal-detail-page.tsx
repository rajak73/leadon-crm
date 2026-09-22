import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Pencil, SearchX, Trash2 } from 'lucide-react';
import type { Deal } from '@leados/shared';
import { useDeal, useDeleteDeal, usePipelines } from '@/api/pipelines';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DealStatusBadge } from '@/components/domain/badges';
import { RecordTimeline } from '@/features/timeline/record-timeline';
import { RelatedTasks } from '@/features/tasks/related-tasks';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { errorMessage, isApiError } from '@/lib/api-client';
import { formatMoney } from '@/lib/format';
import { notify } from '@/lib/toast';
import { DealFormDialog } from './deal-form-dialog';
import { DealInfoCard } from './deal-info-card';
import { StageDot } from './stage-dot';
import { useStageMove } from './use-stage-move';

const backLink = (
  <Link
    to="/pipeline"
    className="inline-flex items-center gap-1 type-small font-medium text-fg-muted hover:text-fg"
  >
    <ArrowLeft aria-hidden className="size-4" />
    Pipeline
  </Link>
);

function StagePicker({ deal }: { deal: Deal }) {
  const { data: pipelines } = usePipelines();
  const stages = pipelines?.find((p) => p.id === deal.pipelineId)?.stages ?? [];
  const { requestMove, lostDialog, isMoving } = useStageMove(deal.pipelineId);

  return (
    <div className="flex flex-col gap-1">
      <span className="type-caption text-fg-muted">Stage</span>
      {stages.length ? (
        <Select
          aria-label="Stage"
          value={deal.stage.id}
          disabled={isMoving}
          onValueChange={(id) => {
            const stage = stages.find((s) => s.id === id);
            if (stage) requestMove(deal, stage);
          }}
          options={stages.map((s) => ({
            value: s.id,
            label: (
              <span className="flex items-center gap-2">
                <StageDot color={s.color} />
                {s.name}
              </span>
            ),
          }))}
          className="w-52"
        />
      ) : (
        <span className="inline-flex h-9 items-center gap-2 type-body text-fg">
          <StageDot color={deal.stage.color} />
          {deal.stage.name}
        </span>
      )}
      {lostDialog}
    </div>
  );
}

function DealDetail({ deal }: { deal: Deal }) {
  const navigate = useNavigate();
  const remove = useDeleteDeal();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <>
      <PageHeader
        eyebrow={backLink}
        title={deal.title}
        actions={
          <>
            <Button icon={<Pencil aria-hidden />} onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              variant="danger"
              icon={<Trash2 aria-hidden />}
              onClick={() => setDeleting(true)}
            >
              Delete
            </Button>
          </>
        }
      />

      <Card className="mb-4 flex flex-wrap items-end gap-x-8 gap-y-4 px-4 py-4">
        <div className="flex flex-col gap-1">
          <span className="type-caption text-fg-muted">Status</span>
          <span className="flex h-9 items-center">
            <DealStatusBadge status={deal.status} />
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="type-caption text-fg-muted">Value</span>
          <span className="flex h-9 items-center type-metric text-fg tabular-nums">
            {formatMoney(deal.value, deal.currency)}
          </span>
        </div>
        <StagePicker deal={deal} />
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="min-w-0">
          <DealInfoCard deal={deal} />
        </div>
        <Tabs defaultValue="activity" className="min-w-0">
          <TabsList label="Deal sections">
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
          </TabsList>
          <TabsContent value="activity">
            <RecordTimeline scope={{ dealId: deal.id }} />
          </TabsContent>
          <TabsContent value="tasks">
            <RelatedTasks
              scope={{ relatedDealId: deal.id }}
              record={{ kind: 'deal', id: deal.id, label: deal.title }}
            />
          </TabsContent>
        </Tabs>
      </div>

      <DealFormDialog open={editing} onOpenChange={setEditing} deal={deal} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete deal “${deal.title}”? This can't be undone.`}
        description="Its notes and activity history will no longer be visible."
        confirmLabel="Delete deal"
        onConfirm={async () => {
          await remove.mutateAsync(deal.id);
          notify.success('Deal deleted');
          navigate('/pipeline');
        }}
      />
    </>
  );
}

export default function DealDetailPage() {
  const { id } = useParams();
  const { data: deal, isLoading, error, refetch, isRefetching } = useDeal(id);
  useDocumentTitle(deal?.title ?? 'Deal');

  if (isLoading)
    return (
      <LoadingRegion label="Loading deal…" className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-72 max-w-full" />
        </div>
        <Skeleton className="h-20 w-full rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </LoadingRegion>
    );

  if (isApiError(error) && error.status === 404)
    return (
      <>
        <PageHeader eyebrow={backLink} title="Deal not found" />
        <EmptyState
          icon={SearchX}
          title="We couldn't find this deal"
          text="It may have been deleted, or the link is incorrect."
          action={
            <Link to="/pipeline" className={buttonClasses({ variant: 'primary' })}>
              Back to pipeline
            </Link>
          }
        />
      </>
    );

  if (error || !deal)
    return (
      <>
        <PageHeader eyebrow={backLink} title="Deal" />
        <ErrorState
          message={errorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isRefetching}
        />
      </>
    );

  return <DealDetail deal={deal} />;
}
