import { useState } from 'react';
import { Link } from 'react-router';
import { Briefcase, Plus } from 'lucide-react';
import type { DealSummary } from '@leados/shared';
import { DealStatusBadge } from '@/components/domain/badges';
import type { RecordRef } from '@/components/domain/record-picker';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { DealFormDialog } from '@/features/pipeline/deal-form-dialog';
import { formatMoney } from '@/lib/format';

interface RecordDealsProps {
  deals: DealSummary[];
  /** The lead or contact new deals are linked to. */
  record: RecordRef;
}

/** Deals linked to a lead or contact, with an "Add deal" shortcut. */
export function RecordDeals({ deals, record }: RecordDealsProps) {
  const [open, setOpen] = useState(false);
  const [defaults] = useState(() => ({
    lead: record.kind === 'lead' ? record : null,
    contact: record.kind === 'contact' ? record : null,
  }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button size="sm" icon={<Plus aria-hidden />} onClick={() => setOpen(true)}>
          Add deal
        </Button>
      </div>
      {deals.length === 0 ? (
        <EmptyState
          compact
          icon={Briefcase}
          title="No deals yet"
          text="Add a deal to track what this could be worth."
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {deals.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3"
            >
              <div className="min-w-0">
                <Link
                  to={`/deals/${d.id}`}
                  className="block truncate font-medium text-fg hover:text-primary-text hover:underline"
                >
                  {d.title}
                </Link>
                <p className="type-small text-fg-muted">{d.stageName}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="type-body font-medium text-fg tabular-nums">
                  {formatMoney(d.value, d.currency)}
                </span>
                <DealStatusBadge status={d.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <DealFormDialog
        open={open}
        onOpenChange={setOpen}
        defaultLead={defaults.lead}
        defaultContact={defaults.contact}
      />
    </div>
  );
}
