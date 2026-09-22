import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Pencil, SearchX, Trash2 } from 'lucide-react';
import type { ContactDetail } from '@leados/shared';
import { useContact, useDeleteContact, useUpdateContact } from '@/api/contacts';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { UserSelect } from '@/components/domain/user-select';
import type { RecordRef } from '@/components/domain/record-picker';
import { Button, buttonClasses } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { TextLink } from '@/components/ui/link';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DetailSkeleton } from '@/features/leads/detail-skeleton';
import { RecordDeals } from '@/features/leads/record-deals';
import { RelatedTasks } from '@/features/tasks/related-tasks';
import { RecordTimeline } from '@/features/timeline/record-timeline';
import { errorMessage, isApiError } from '@/lib/api-client';
import { personName } from '@/lib/format';
import { notify } from '@/lib/toast';
import { ContactFormDialog } from './contact-form-dialog';
import { ContactInfoPanel } from './contact-info-panel';

const backLink = (
  <TextLink to="/contacts" className="inline-flex items-center gap-1 type-small">
    <ArrowLeft aria-hidden className="size-4" />
    Contacts
  </TextLink>
);

function ContactView({ contact }: { contact: ContactDetail }) {
  const navigate = useNavigate();
  const update = useUpdateContact();
  const del = useDeleteContact();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const name = personName(contact);
  const record = useMemo<RecordRef>(
    () => ({ kind: 'contact', id: contact.id, label: name }),
    [contact.id, name],
  );
  const subtitle = [
    contact.jobTitle && contact.company
      ? `${contact.jobTitle} at ${contact.company}`
      : contact.jobTitle || contact.company,
    contact.email,
  ]
    .filter(Boolean)
    .join(' · ');

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
          <span aria-hidden className="type-small text-fg-muted">
            Owner
          </span>
          <UserSelect
            size="sm"
            className="w-48"
            aria-label="Owner"
            value={contact.assignedTo?.id ?? null}
            noneLabel="Unassigned"
            disabled={update.isPending}
            onChange={(assignedToId) =>
              update.mutate(
                { id: contact.id, assignedToId },
                {
                  onSuccess: () =>
                    notify.success(assignedToId ? 'Owner changed' : 'Contact unassigned'),
                  onError: (err) => notify.error(err, "We couldn't change the owner."),
                },
              )
            }
          />
        </div>
        {contact.convertedFromLeadId && (
          <TextLink to={`/leads/${contact.convertedFromLeadId}`} className="type-small">
            Converted from lead
          </TextLink>
        )}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <ContactInfoPanel contact={contact} />
        <Tabs defaultValue="activity" className="min-w-0">
          <TabsList label="Contact records">
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="deals" count={contact.deals.length}>
              Deals
            </TabsTrigger>
          </TabsList>
          <TabsContent value="activity">
            <RecordTimeline scope={{ contactId: contact.id }} />
          </TabsContent>
          <TabsContent value="tasks">
            <RelatedTasks scope={{ relatedContactId: contact.id }} record={record} />
          </TabsContent>
          <TabsContent value="deals">
            <RecordDeals deals={contact.deals} record={record} />
          </TabsContent>
        </Tabs>
      </div>

      <ContactFormDialog open={editOpen} onOpenChange={setEditOpen} contact={contact} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete contact “${name}”?`}
        description="This can't be undone."
        confirmLabel="Delete contact"
        onConfirm={async () => {
          await del.mutateAsync(contact.id);
          notify.success(`${name} deleted`);
          navigate('/contacts', { replace: true });
        }}
      />
    </>
  );
}

export default function ContactDetailPage() {
  const { id } = useParams();
  const { data: contact, isLoading, error, refetch, isFetching } = useContact(id);
  useDocumentTitle(contact ? personName(contact) : 'Contact');

  if (isLoading) return <DetailSkeleton label="Loading contact…" />;
  if (error || !contact) {
    if (isApiError(error) && (error.status === 404 || error.code === 'NOT_FOUND')) {
      return (
        <EmptyState
          icon={SearchX}
          title="This contact doesn't exist or was deleted"
          text="It may have been removed by someone on your team."
          action={
            <Link to="/contacts" className={buttonClasses({ variant: 'primary' })}>
              Back to contacts
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
  return <ContactView contact={contact} />;
}
