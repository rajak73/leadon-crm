import { useId, useState, type FormEvent } from 'react';
import { ChevronDown, Tag, Trash2, UserPlus, X } from 'lucide-react';
import type { BulkLeadsInput } from '@leados/shared';
import { useActiveUsers } from '@/api/account';
import { useBulkLeads } from '@/api/leads';
import { useSession } from '@/providers/session';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { leadStatusLabels } from '@/lib/labels';
import { formatNumber, personName, pluralize } from '@/lib/format';
import { notify } from '@/lib/toast';
import { SELECTABLE_LEAD_STATUSES } from './lead-status-control';
import type { Selection } from './use-selection';

type BulkAction = BulkLeadsInput extends infer U
  ? U extends { ids: string[] }
    ? Omit<U, 'ids'>
    : never
  : never;

function TagPopover({
  onAdd,
  disabled,
}: {
  onAdd: (tag: string) => Promise<boolean>;
  disabled?: boolean;
}) {
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [tag, setTag] = useState('');
  const [error, setError] = useState<string>();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = tag.trim();
    if (!value) return setError('Enter a tag');
    if (value.length > 40) return setError('Tags must be 40 characters or fewer');
    if (await onAdd(value)) {
      setTag('');
      setOpen(false);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setError(undefined);
      }}
    >
      <PopoverTrigger asChild>
        <Button size="sm" icon={<Tag aria-hidden />} disabled={disabled}>
          Add tag
        </Button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-64">
        <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-2">
          <FormField label="Tag" error={error}>
            <Input
              value={tag}
              maxLength={40}
              autoFocus
              placeholder="e.g. vip"
              onChange={(e) => {
                setTag(e.target.value);
                setError(undefined);
              }}
            />
          </FormField>
          <Button type="submit" size="sm" variant="primary">
            Add tag
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/** Actions for the selected leads. Sticks to the bottom of the viewport while visible. */
export function BulkBar({ selection }: { selection: Selection }) {
  const { isAdmin } = useSession();
  const { data: users = [] } = useActiveUsers();
  const bulk = useBulkLeads();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const count = selection.count;
  if (count === 0) return null;

  async function run(action: BulkAction, done: (n: number) => string): Promise<boolean> {
    try {
      const { affected } = await bulk.mutateAsync({
        ...action,
        ids: selection.ids,
      } as BulkLeadsInput);
      notify.success(done(affected));
      selection.clear();
      return true;
    } catch (err) {
      notify.error(err, "We couldn't update those leads.");
      return false;
    }
  }
  const updated = (n: number) => `Updated ${pluralize(n, 'lead')}`;

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="sticky bottom-4 z-20 mx-auto mt-4 flex w-fit max-w-full flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-raised px-3 py-2 shadow-lg"
    >
      <p className="px-1 type-body font-medium text-fg tabular-nums" aria-live="polite">
        {formatNumber(count)} selected
      </p>
      <Button
        size="sm"
        variant="ghost"
        iconOnly
        aria-label="Clear selection"
        icon={<X aria-hidden />}
        onClick={selection.clear}
      />
      <span aria-hidden className="mx-1 hidden h-5 w-px bg-border sm:block" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" icon={<UserPlus aria-hidden />} disabled={bulk.isPending}>
            Assign
            <ChevronDown aria-hidden className="text-fg-subtle" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="max-h-72 overflow-y-auto">
          <DropdownMenuLabel>Assign to</DropdownMenuLabel>
          <DropdownMenuItem
            onSelect={() => void run({ action: 'assign', assignedToId: null }, updated)}
          >
            Unassigned
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {users.map((u) => (
            <DropdownMenuItem
              key={u.id}
              onSelect={() => void run({ action: 'assign', assignedToId: u.id }, updated)}
            >
              {personName(u)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" disabled={bulk.isPending}>
            Change status
            <ChevronDown aria-hidden className="text-fg-subtle" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          <DropdownMenuLabel>Set status to</DropdownMenuLabel>
          {SELECTABLE_LEAD_STATUSES.map((s) => (
            <DropdownMenuItem
              key={s}
              onSelect={() => void run({ action: 'status', status: s }, updated)}
            >
              {leadStatusLabels[s]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <TagPopover disabled={bulk.isPending} onAdd={(tag) => run({ action: 'tag', tag }, updated)} />
      {isAdmin && (
        <Button
          size="sm"
          variant="danger"
          icon={<Trash2 aria-hidden />}
          disabled={bulk.isPending}
          onClick={() => setConfirmDelete(true)}
        >
          Delete
        </Button>
      )}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${pluralize(count, 'lead')}?`}
        description="This can't be undone."
        confirmLabel={`Delete ${pluralize(count, 'lead')}`}
        onConfirm={async () => {
          const { affected } = await bulk.mutateAsync({ action: 'delete', ids: selection.ids });
          notify.success(`Deleted ${pluralize(affected, 'lead')}`);
          selection.clear();
        }}
      />
    </div>
  );
}
