import { useState } from 'react';
import { Command } from 'cmdk';
import { Briefcase, ChevronsUpDown, User, UserRound, X } from 'lucide-react';
import { useSearch } from '@/api/misc';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { fieldBase } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/cn';
import { useFieldControl } from '@/components/ui/field-context';

export type RecordKind = 'lead' | 'contact' | 'deal';
export interface RecordRef {
  kind: RecordKind;
  id: string;
  label: string;
}

const kindLabels: Record<RecordKind, string> = { lead: 'Lead', contact: 'Contact', deal: 'Deal' };
const kindIcons = { lead: User, contact: UserRound, deal: Briefcase };

interface RecordPickerProps {
  value: RecordRef | null;
  onChange: (value: RecordRef | null) => void;
  kinds?: RecordKind[];
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

/** Search-as-you-type picker for a lead, contact or deal. */
export function RecordPicker({
  value,
  onChange,
  kinds = ['lead', 'contact', 'deal'],
  placeholder = 'Search records…',
  disabled,
  ...props
}: RecordPickerProps) {
  // aria-required isn't valid on a button; the visible label already says it's required.
  const { id, 'aria-required': _required, ...aria } = useFieldControl(props);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 250);
  const { data, isFetching } = useSearch(debounced, 5);

  const groups: Array<{
    kind: RecordKind;
    items: Array<{ id: string; label: string; hint?: string | null }>;
  }> = [];
  if (data) {
    if (kinds.includes('lead'))
      groups.push({
        kind: 'lead',
        items: data.leads.map((l) => ({ id: l.id, label: l.name, hint: l.email })),
      });
    if (kinds.includes('contact'))
      groups.push({
        kind: 'contact',
        items: data.contacts.map((c) => ({ id: c.id, label: c.name, hint: c.company ?? c.email })),
      });
    if (kinds.includes('deal'))
      groups.push({ kind: 'deal', items: data.deals.map((d) => ({ id: d.id, label: d.title })) });
  }
  const Icon = value ? kindIcons[value.kind] : null;

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            id={id}
            disabled={disabled}
            aria-haspopup="dialog"
            aria-expanded={open}
            className={cn(
              fieldBase,
              'flex h-9 items-center justify-between gap-2 px-3 text-left type-body',
            )}
            {...aria}
          >
            {value && Icon ? (
              <span className="flex min-w-0 items-center gap-2">
                <Icon aria-hidden className="size-4 shrink-0 text-fg-subtle" />
                <span className="truncate">{value.label}</span>
                <span className="type-caption text-fg-subtle">{kindLabels[value.kind]}</span>
              </span>
            ) : (
              <span className="text-fg-subtle">{placeholder}</span>
            )}
            <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-fg-subtle" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(22rem,calc(100vw-2rem))] p-0">
          <Command shouldFilter={false} label="Search records">
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Type a name, email or title…"
                className="h-10 flex-1 bg-transparent type-body text-fg outline-none placeholder:text-fg-subtle"
              />
              {isFetching && <Spinner className="text-fg-subtle" />}
            </div>
            <Command.List className="max-h-72 overflow-y-auto p-1">
              {!debounced.trim() ? (
                <p className="px-3 py-6 text-center type-small text-fg-muted">
                  Start typing to search.
                </p>
              ) : (
                <Command.Empty className="px-3 py-6 text-center type-small text-fg-muted">
                  No matches found.
                </Command.Empty>
              )}
              {groups.map((g) =>
                g.items.length ? (
                  <Command.Group
                    key={g.kind}
                    heading={`${kindLabels[g.kind]}s`}
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:type-caption [&_[cmdk-group-heading]]:text-fg-subtle"
                  >
                    {g.items.map((item) => {
                      const ItemIcon = kindIcons[g.kind];
                      return (
                        <Command.Item
                          key={item.id}
                          value={`${g.kind}:${item.id}`}
                          onSelect={() => {
                            onChange({ kind: g.kind, id: item.id, label: item.label });
                            setOpen(false);
                            setQuery('');
                          }}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 type-body text-fg data-[selected=true]:bg-muted"
                        >
                          <ItemIcon aria-hidden className="size-4 text-fg-subtle" />
                          <span className="truncate">{item.label}</span>
                          {item.hint && (
                            <span className="ml-auto truncate type-caption text-fg-subtle">
                              {item.hint}
                            </span>
                          )}
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                ) : null,
              )}
            </Command.List>
          </Command>
        </PopoverContent>
      </Popover>
      {value && !disabled && (
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Clear related record"
          className="rounded-md p-2 text-fg-subtle hover:bg-muted hover:text-fg"
        >
          <X aria-hidden className="size-4" />
        </button>
      )}
    </div>
  );
}
