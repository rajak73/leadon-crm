import { Link } from 'react-router';
import type { Contact } from '@leados/shared';
import { RelativeTime } from '@/components/domain/relative-time';
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
import { OwnerCell } from '@/features/leads/owner-cell';
import { personName } from '@/lib/format';

interface ContactsTableProps {
  contacts: Contact[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string) => void;
}

export function ContactsTable({ contacts, sortBy, sortOrder, onSort }: ContactsTableProps) {
  const sort = { sortBy, sortOrder, onSort };
  return (
    <TableContainer className="hidden md:block">
      <Table>
        <THead>
          <tr>
            <SortableTH
              field="firstName"
              {...sort}
              className={pinned('left-0', { header: true, edge: true })}
            >
              Name
            </SortableTH>
            <SortableTH field="company" {...sort}>
              Company
            </SortableTH>
            <TH>Phone</TH>
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
          {contacts.map((c) => (
            <TR key={c.id}>
              <TD className={cn('max-w-64 min-w-48', pinned('left-0', { edge: true }))}>
                <Link
                  to={`/contacts/${c.id}`}
                  className="block truncate font-medium text-fg hover:text-primary-text hover:underline"
                >
                  {personName(c)}
                </Link>
                {c.email && <p className="truncate type-small text-fg-muted">{c.email}</p>}
              </TD>
              <TD className="max-w-56">
                <p className="truncate text-fg">{c.company ?? '—'}</p>
                {c.jobTitle && <p className="truncate type-small text-fg-muted">{c.jobTitle}</p>}
              </TD>
              <TD className="whitespace-nowrap type-small text-fg-muted">{c.phone ?? '—'}</TD>
              <TD className="max-w-44">
                <OwnerCell user={c.assignedTo} />
              </TD>
              <TD className="whitespace-nowrap type-small text-fg-muted">
                <RelativeTime date={c.lastActivityAt} />
              </TD>
              <TD className="whitespace-nowrap type-small text-fg-muted">
                <RelativeTime date={c.createdAt} />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </TableContainer>
  );
}

export function ContactCards({ contacts }: { contacts: Contact[] }) {
  return (
    <ul className="flex flex-col divide-y divide-border md:hidden">
      {contacts.map((c) => (
        <li key={c.id} className="flex flex-col gap-1.5 px-4 py-3">
          <Link to={`/contacts/${c.id}`} className="truncate font-medium text-fg hover:underline">
            {personName(c)}
          </Link>
          <p className="truncate type-small text-fg-muted">
            {[c.jobTitle, c.company].filter(Boolean).join(' at ') || c.email || '—'}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <OwnerCell user={c.assignedTo} />
            <span className="type-caption text-fg-subtle">
              Active <RelativeTime date={c.lastActivityAt} />
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ContactsSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <LoadingRegion label="Loading contacts…" className="divide-y divide-border">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="hidden h-4 w-32 md:block" />
          <Skeleton className="hidden h-4 w-24 md:block" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </LoadingRegion>
  );
}
