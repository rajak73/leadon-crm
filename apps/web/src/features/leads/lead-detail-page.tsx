import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, ArrowRightLeft, Pencil, SearchX, Trash2, UserRound } from 'lucide-react';
import type { LeadDetail } from '@leados/shared';
import { useDeleteLead, useLead, useUpdateLead } from '@/api/leads';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { UserSelect } from '@/components/domain/user-select';
import type { RecordRef } from '@/components/domain/record-picker';
import { Button, buttonClasses } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { TextLink } from '@/components/ui/link';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RelatedTasks } from '@/features/tasks/related-tasks';
import { RecordTimeline } from '@/features/timeline/record-timeline';
import { errorMessage, isApiError } from '@/lib/api-client';
import { personName } from '@/lib/format';
import { notify } from '@/lib/toast';
import { AiScoreCard } from './ai-score-card';
import { ConvertLeadDialog } from './convert-lead-dialog';
import { DetailSkeleton } from './detail-skeleton';
import { LeadFormDialog } from './lead-form-dialog';
import { LeadInfoPanel } from './lead-info-panel';
import { LeadStatusControl } from './lead-status-control';
import { RecordDeals } from './record-deals';

const backLink = (
  <TextLink to="/leads" className="inline-flex items-center gap-1 type-small">
    <ArrowLeft aria-hidden className="size-4" />
    Leads
  </TextLink>
);

function LeadView({ lead }: { lead: LeadDetail }) {
  const navigate = useNavigate();
  const updateOwner = useUpdateLead({ optimistic: true });
  const del = useDeleteLead();
  const [editOpen, setEditOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const name = personName(lead);
  const record = useMemo<RecordRef>(
    () => ({ kind: 'lead', id: lead.id, label: name }),
    [lead.id, name],
  );
  const converted = Boolean(lead.convertedToContactId);
  const subtitle = [lead.company, lead.email].filter(Boolean).join(' · ');

  return (
    <>
      <PageHeader
        eyebrow={backLink}
        title={name}
        description={subtitle || undefined}
        actions={
          <>
            <Button icon={<Pencil aria-hidden />} onClick={() => setEditOpen(true)}>
              Edit
            </Button>
            {converted ? (
              <Link
                to={`/contacts/${lead.convertedToContactId}`}
                className={buttonClasses({ variant: 'secondary' })}
              >
                <UserRound aria-hidden />
                View contact
              </Link>
            ) : (
              <Button
                variant="primary"
                icon={<ArrowRightLeft aria-hidden />}
                onClick={() => setConvertOpen(true)}
              >
                Convert
              </Button>
            )}
            <Button
              variant="ghost"
              icon={<Trash2 aria-hidden />}
              onClick={() => setDeleteOpen(true)}
            >
              Delete
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="type-small text-fg-muted">Status</span>
          <LeadStatusControl lead={lead} />
        </div>
        <div className="flex items-center gap-2">
          <span aria-hidden className="type-small text-fg-muted">
            Owner
          </span>
          <UserSelect
            size="sm"
            className="w-48"
            aria-label="Owner"
            value={lead.assignedTo?.id ?? null}
            noneLabel="Unassigned"
            onChange={(assignedToId) =>
              updateOwner.mutate(
                { id: lead.id, assignedToId },
                {
                  onSuccess: () =>
                    notify.success(assignedToId ? 'Owner changed' : 'Lead unassigned'),
                },
              )
            }
          />
        </div>
        {converted && (
          <p className="type-small text-fg-muted">
            Converted to a contact, so it can't be converted again.
          </p>
        )}
      </div>

      {/* Same layout as contacts and deals: the record on the left, its activity on the right. */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <LeadInfoPanel lead={lead} />
          <AiScoreCard lead={lead} />
        </div>
        <Tabs defaultValue="activity" className="min-w-0">
          <TabsList label="Lead records">
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="tasks" count={lead.openTaskCount}>
              Tasks
            </TabsTrigger>
            <TabsTrigger value="deals" count={lead.deals.length}>
              Deals
            </TabsTrigger>
          </TabsList>
          <TabsContent value="activity">
            <RecordTimeline scope={{ leadId: lead.id }} />
          </TabsContent>
          <TabsContent value="tasks">
            <RelatedTasks scope={{ relatedLeadId: lead.id }} record={record} />
          </TabsContent>
          <TabsContent value="deals">
            <RecordDeals deals={lead.deals} record={record} />
          </TabsContent>
        </Tabs>
      </div>

      <LeadFormDialog open={editOpen} onOpenChange={setEditOpen} lead={lead} />
      {!converted && (
        <ConvertLeadDialog open={convertOpen} onOpenChange={setConvertOpen} lead={lead} />
      )}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete lead “${name}”?`}
        description="This can't be undone."
        confirmLabel="Delete lead"
        onConfirm={async () => {
          await del.mutateAsync(lead.id);
          notify.success(`${name} deleted`);
          navigate('/leads', { replace: true });
        }}
      />
    </>
  );
}

export default function LeadDetailPage() {
  const { id } = useParams();
  const { data: lead, isLoading, error, refetch, isFetching } = useLead(id);
  useDocumentTitle(lead ? personName(lead) : 'Lead');

  if (isLoading) return <DetailSkeleton label="Loading lead…" />;
  if (error || !lead) {
    if (isApiError(error) && (error.status === 404 || error.code === 'NOT_FOUND')) {
      return (
        <EmptyState
          icon={SearchX}
          title="This lead doesn't exist or was deleted"
          text="It may have been removed by someone on your team."
          action={
            <Link to="/leads" className={buttonClasses({ variant: 'primary' })}>
              Back to leads
            </Link>
          }
        />
      );
    }
    return (
      <>
        <div className="mb-4">{backLink}</div>
        <ErrorState
          message={errorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      </>
    );
  }
  return <LeadView lead={lead} />;
}
