import { useCallback, useState } from 'react';
import { Plus, SearchX, UserRound } from 'lucide-react';
import { useContacts } from '@/api/contacts';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { useNewParam } from '@/features/leads/use-new-param';
import { errorMessage } from '@/lib/api-client';
import { ContactFilters } from './contact-filters';
import { ContactFormDialog } from './contact-form-dialog';
import { useContactListParams } from './contact-list-params';
import { ContactCards, ContactsSkeleton, ContactsTable } from './contacts-table';

export default function ContactsPage() {
  useDocumentTitle('Contacts');
  const list = useContactListParams();
  const { data, isLoading, error, refetch, isFetching } = useContacts(list.query);
  const [formOpen, setFormOpen] = useState(false);
  const openForm = useCallback(() => setFormOpen(true), []);
  useNewParam(openForm);
  const contacts = data?.data ?? [];

  let body;
  if (isLoading) body = <ContactsSkeleton />;
  else if (error && !data)
    body = (
      <ErrorState
        message={errorMessage(error)}
        onRetry={() => void refetch()}
        retrying={isFetching}
      />
    );
  else if (contacts.length === 0)
    body = list.hasFilters ? (
      <EmptyState
        icon={SearchX}
        title="No contacts match these filters"
        text="Try a different search or clear the filters."
        action={<Button onClick={list.clearFilters}>Clear filters</Button>}
      />
    ) : (
      <EmptyState
        icon={UserRound}
        title="No contacts yet"
        text="Contacts are created when you convert a lead, or you can add one yourself."
        action={
          <Button variant="primary" icon={<Plus aria-hidden />} onClick={openForm}>
            Add contact
          </Button>
        }
      />
    );
  else
    body = (
      <>
        <ContactsTable
          contacts={contacts}
          sortBy={list.sortBy}
          sortOrder={list.sortOrder}
          onSort={list.setSort}
        />
        <ContactCards contacts={contacts} />
      </>
    );

  return (
    <>
      <PageHeader
        title="Contacts"
        description="People you're doing business with."
        actions={
          <Button variant="primary" icon={<Plus aria-hidden />} onClick={openForm}>
            Add contact
          </Button>
        }
      />
      <ContactFilters />
      <Card className="mt-4 overflow-hidden" aria-busy={isFetching && !isLoading}>
        {body}
      </Card>
      <Pagination meta={data?.meta} onPageChange={list.setPage} noun="contacts" />
      <ContactFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </>
  );
}
