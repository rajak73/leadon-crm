import { useCallback, useState } from 'react';
import { Download, Plus, SearchX, Upload, Users } from 'lucide-react';
import { useLeads } from '@/api/leads';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { downloadFile, errorMessage } from '@/lib/api-client';
import { notify } from '@/lib/toast';
import { BulkBar } from './bulk-bar';
import { ImportLeadsDialog } from './import-leads-dialog';
import { LeadFilters } from './lead-filters';
import { LeadFormDialog } from './lead-form-dialog';
import { useLeadListParams } from './lead-list-params';
import { LeadCards, LeadsSkeleton, LeadsTable } from './leads-table';
import { useNewParam } from './use-new-param';
import { useSelection } from './use-selection';

export default function LeadsPage() {
  useDocumentTitle('Leads');
  const list = useLeadListParams();
  const { data, isLoading, error, refetch, isFetching } = useLeads(list.query);
  const selection = useSelection(list.resetKey);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const openForm = useCallback(() => setFormOpen(true), []);
  useNewParam(openForm);

  async function exportCsv() {
    setExporting(true);
    try {
      await downloadFile('/leads/export', list.filterQuery, 'leads.csv');
    } catch (err) {
      notify.error(err, "We couldn't export your leads.");
    } finally {
      setExporting(false);
    }
  }

  const leads = data?.data ?? [];

  let body;
  if (isLoading) body = <LeadsSkeleton />;
  else if (error && !data)
    body = (
      <ErrorState
        message={errorMessage(error)}
        onRetry={() => void refetch()}
        retrying={isFetching}
      />
    );
  else if (leads.length === 0 && list.page > 1)
    body = (
      <EmptyState
        icon={SearchX}
        title="Nothing on this page"
        text="There are fewer leads than before."
        action={<Button onClick={() => list.setPage(1)}>Go to the first page</Button>}
      />
    );
  else if (leads.length === 0)
    body = list.hasFilters ? (
      <EmptyState
        icon={SearchX}
        title="No leads match these filters"
        text="Try a different search or clear the filters to see every lead."
        action={<Button onClick={list.clearFilters}>Clear filters</Button>}
      />
    ) : (
      <EmptyState
        icon={Users}
        title="No leads yet"
        text="Add your first lead or import a list from a spreadsheet."
        action={
          <>
            <Button variant="primary" icon={<Plus aria-hidden />} onClick={() => setFormOpen(true)}>
              Add lead
            </Button>
            <Button icon={<Upload aria-hidden />} onClick={() => setImportOpen(true)}>
              Import leads
            </Button>
          </>
        }
      />
    );
  else
    body = (
      <>
        <LeadsTable
          leads={leads}
          selection={selection}
          sortBy={list.sortBy}
          sortOrder={list.sortOrder}
          onSort={list.setSort}
        />
        <LeadCards leads={leads} selection={selection} />
      </>
    );

  return (
    <>
      <PageHeader
        title="Leads"
        description="Everyone who might buy from you, from first touch to converted."
        actions={
          <>
            <Button icon={<Upload aria-hidden />} onClick={() => setImportOpen(true)}>
              Import
            </Button>
            <Button
              icon={<Download aria-hidden />}
              loading={exporting}
              onClick={() => void exportCsv()}
            >
              {exporting ? 'Exporting…' : 'Export'}
            </Button>
            <Button variant="primary" icon={<Plus aria-hidden />} onClick={() => setFormOpen(true)}>
              Add lead
            </Button>
          </>
        }
      />
      <LeadFilters />
      <Card className="mt-4 overflow-hidden" aria-busy={isFetching && !isLoading}>
        {body}
      </Card>
      <Pagination meta={data?.meta} onPageChange={list.setPage} noun="leads" />
      <BulkBar selection={selection} />
      <LeadFormDialog open={formOpen} onOpenChange={setFormOpen} />
      <ImportLeadsDialog open={importOpen} onOpenChange={setImportOpen} />
    </>
  );
}
