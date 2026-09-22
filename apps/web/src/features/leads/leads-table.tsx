import { Link } from 'react-router';
import type { Lead } from '@leados/shared';
import { ScoreBadge } from '@/components/domain/badges';
import { RelativeTime } from '@/components/domain/relative-time';
import { Checkbox } from '@/components/ui/checkbox';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import {
  pinned,
  SortableTH,
  Table,
  TableContainer,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui/table';
import { leadSourceLabels } from '@/lib/labels';
import { personName } from '@/lib/format';
import { LeadStatusControl } from './lead-status-control';
import { OwnerCell } from './owner-cell';
import type { Selection } from './use-selection';

interface LeadsTableProps {
  leads: Lead[];
  selection: Selection;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string) => void;
}

export function headerCheckState(ids: string[], selection: Selection): boolean | 'indeterminate' {
  const picked = ids.filter((id) => selection.isSelected(id)).length;
  if (picked === 0) return false;
  return picked === ids.length ? true : 'indeterminate';
}

/** Desktop table (md and up). */
export function LeadsTable({ leads, selection, sortBy, sortOrder, onSort }: LeadsTableProps) {
  const ids = leads.map((l) => l.id);
  const headerState = headerCheckState(ids, selection);
  const sort = { sortBy, sortOrder, onSort };
  return (
    <TableContainer className="hidden md:block">
      <Table>
        <THead>
          <tr>
            <TH className={cn('w-10', pinned('left-0', { header: true }))}>
              <Checkbox
                aria-label="Select all leads on this page"
                checked={headerState}
                onCheckedChange={() => selection.setMany(ids, headerState !== true)}
              />
            </TH>
            <SortableTH
              field="firstName"
              {...sort}
              className={pinned('left-10', { header: true, edge: true })}
            >
              Name
            </SortableTH>
            <TH>Company</TH>
            <TH>Status</TH>
            <TH>Source</TH>
            <SortableTH field="aiScore" {...sort}>
              AI score
            </SortableTH>
            <TH>Owner</TH>
            <SortableTH field="lastActivityAt" {...sort}>
              Last activity
            </SortableTH>
            <SortableTH field="createdAt" {...sort}>
              Created
            </SortableTH>
          </tr>
        </THead>
        <TBody>
          {leads.map((lead) => {
            const name = personName(lead);
            const selected = selection.isSelected(lead.id);
            return (
              <TR key={lead.id} data-selected={selected}>
                <TD className={pinned('left-0')}>
                  <Checkbox
                    aria-label={`Select ${name}`}
                    checked={selected}
                    onCheckedChange={(c) => selection.toggle(lead.id, c === true)}
                  />
                </TD>
                <TD className={cn('max-w-64 min-w-48', pinned('left-10', { edge: true }))}>
                  <Link
                    to={`/leads/${lead.id}`}
                    className="block truncate font-medium text-fg hover:text-primary-text hover:underline"
                  >
                    {name}
                  </Link>
                  {lead.email && <p className="truncate type-small text-fg-muted">{lead.email}</p>}
                </TD>
                <TD className="max-w-48 truncate text-fg-muted">{lead.company ?? '—'}</TD>
                <TD>
                  <LeadStatusControl lead={lead} />
                </TD>
                <TD className="whitespace-nowrap type-small text-fg-muted">
                  {leadSourceLabels[lead.source]}
                </TD>
                <TD>
                  <ScoreBadge score={lead.aiScore} />
                </TD>
                <TD className="max-w-44">
                  <OwnerCell user={lead.assignedTo} />
                </TD>
                <TD className="whitespace-nowrap type-small text-fg-muted">
                  <RelativeTime date={lead.lastActivityAt} />
                </TD>
                <TD className="whitespace-nowrap type-small text-fg-muted">
                  <RelativeTime date={lead.createdAt} />
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </TableContainer>
  );
}

/** Stacked cards (below md). */
export function LeadCards({ leads, selection }: Pick<LeadsTableProps, 'leads' | 'selection'>) {
  return (
    <ul className="flex flex-col divide-y divide-border md:hidden">
      {leads.map((lead) => {
        const name = personName(lead);
        return (
          <li
            key={lead.id}
            className="flex gap-3 px-4 py-3"
            data-selected={selection.isSelected(lead.id)}
          >
            <Checkbox
              className="mt-1"
              aria-label={`Select ${name}`}
              checked={selection.isSelected(lead.id)}
              onCheckedChange={(c) => selection.toggle(lead.id, c === true)}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    to={`/leads/${lead.id}`}
                    className="block truncate font-medium text-fg hover:underline"
                  >
                    {name}
                  </Link>
                  <p className="truncate type-small text-fg-muted">
                    {[lead.company, lead.email].filter(Boolean).join(' · ') ||
                      leadSourceLabels[lead.source]}
                  </p>
                </div>
                <ScoreBadge score={lead.aiScore} />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <LeadStatusControl lead={lead} />
                <OwnerCell user={lead.assignedTo} />
                <span className="type-caption text-fg-subtle">
                  Active <RelativeTime date={lead.lastActivityAt} />
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function LeadsSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <LoadingRegion label="Loading leads…" className="divide-y divide-border">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className="size-4 shrink-0" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="hidden h-5 w-20 rounded-full md:block" />
          <Skeleton className="hidden h-4 w-24 md:block" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="hidden h-4 w-28 lg:block" />
        </div>
      ))}
    </LoadingRegion>
  );
}
