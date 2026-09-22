import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { LEAD_STATUSES, type Lead, type LeadStatus } from '@leados/shared';
import { useUpdateLead } from '@/api/leads';
import { LeadStatusBadge } from '@/components/domain/badges';
import { LostReasonDialog } from '@/components/domain/lost-reason-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { leadStatusLabels } from '@/lib/labels';
import { personName } from '@/lib/format';
import { notify } from '@/lib/toast';

/** Statuses a person can pick directly. Won is only reachable by converting the lead. */
export const SELECTABLE_LEAD_STATUSES = LEAD_STATUSES.filter(
  (s): s is Exclude<LeadStatus, 'WON'> => s !== 'WON',
);

type LeadLike = Pick<Lead, 'id' | 'firstName' | 'lastName' | 'status'>;

/** Status badge that doubles as a menu to change the status (asks for a reason when marking Lost). */
export function LeadStatusControl({ lead }: { lead: LeadLike }) {
  const update = useUpdateLead({ optimistic: true });
  const [lostOpen, setLostOpen] = useState(false);
  const name = personName(lead);

  if (lead.status === 'WON') {
    // Converted leads stay Won.
    return <LeadStatusBadge status="WON" />;
  }

  function change(value: string) {
    const status = value as Exclude<LeadStatus, 'WON'>;
    if (status === lead.status) return;
    if (status === 'LOST') {
      setLostOpen(true);
      return;
    }
    update.mutate(
      { id: lead.id, status },
      { onSuccess: () => notify.success(`${name} moved to ${leadStatusLabels[status]}`) },
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Status: ${leadStatusLabels[lead.status]}. Change status of ${name}`}
          className="inline-flex items-center gap-0.5 rounded-full hover:opacity-80"
        >
          <LeadStatusBadge status={lead.status} />
          <ChevronDown aria-hidden className="size-3.5 text-fg-subtle" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-44">
          <DropdownMenuLabel>Change status</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={lead.status} onValueChange={change}>
            {SELECTABLE_LEAD_STATUSES.map((s) => (
              <DropdownMenuRadioItem key={s} value={s}>
                {leadStatusLabels[s]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <LostReasonDialog
        open={lostOpen}
        onOpenChange={setLostOpen}
        name={name}
        kind="lead"
        onConfirm={async (reason) => {
          try {
            await update.mutateAsync({ id: lead.id, status: 'LOST', lostReason: reason });
            notify.success(`${name} marked as lost`);
          } catch {
            // The mutation already rolled back and explained what went wrong.
          }
        }}
      />
    </>
  );
}
