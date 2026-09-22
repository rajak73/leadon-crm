import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Command } from 'cmdk';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  Briefcase,
  MessageSquare,
  Plus,
  Search,
  User,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useSearch } from '@/api/misc';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { Spinner } from '@/components/ui/spinner';
import { formatMoney } from '@/lib/format';
import { leadStatusLabels } from '@/lib/labels';
import { mainNav, settingsNav } from './nav-items';

const groupClass =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:type-caption [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-subtle';

function Item({
  icon: Icon,
  children,
  hint,
  onSelect,
  value,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  hint?: string | null;
  onSelect: () => void;
  value: string;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 type-body text-fg data-[selected=true]:bg-muted"
    >
      <Icon aria-hidden className="size-4 shrink-0 text-fg-subtle" />
      <span className="truncate">{children}</span>
      {hint && <span className="ml-auto shrink-0 truncate type-small text-fg-subtle">{hint}</span>}
    </Command.Item>
  );
}

/** ⌘K / Ctrl+K palette: search records and jump around. Radix Dialog handles the focus trap. */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 250);
  const { data, isFetching } = useSearch(open ? debounced : '', 5);

  const go = (to: string) => {
    onOpenChange(false);
    setQuery('');
    navigate(to);
  };
  const term = query.trim().toLowerCase();
  const matches = (label: string) => !term || label.toLowerCase().includes(term);
  const actions = [
    { label: 'New lead', to: '/leads?new=1', icon: Plus },
    { label: 'New task', to: '/tasks?new=1', icon: Plus },
    { label: 'New deal', to: '/pipeline?new=1', icon: Plus },
  ].filter((a) => matches(a.label));
  const pages = [
    ...mainNav,
    { to: '/inbox/comments', label: 'Comments', icon: MessageSquare },
    settingsNav,
  ].filter((p) => matches(`Go to ${p.label}`));
  const hasResults = Boolean(
    data && (data.leads.length || data.contacts.length || data.deals.length),
  );

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setQuery('');
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay animate-fade-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface-raised shadow-lg animate-scale-in"
        >
          <DialogPrimitive.Title className="sr-only">
            Search and quick actions
          </DialogPrimitive.Title>
          <Command shouldFilter={false} label="Search and quick actions" loop>
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search aria-hidden className="size-4 shrink-0 text-fg-subtle" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Search leads, contacts and deals…"
                className="h-12 flex-1 bg-transparent type-body text-fg outline-none placeholder:text-fg-subtle"
              />
              {isFetching && <Spinner className="text-fg-subtle" label="Searching…" />}
            </div>
            <Command.List className="max-h-[min(24rem,60vh)] overflow-y-auto p-1.5">
              {term && !isFetching && !hasResults && !actions.length && !pages.length && (
                <Command.Empty className="px-3 py-8 text-center type-body text-fg-muted">
                  No results for “{query.trim()}”.
                </Command.Empty>
              )}
              {data && debounced.trim() && (
                <>
                  {data.leads.length > 0 && (
                    <Command.Group heading="Leads" className={groupClass}>
                      {data.leads.map((l) => (
                        <Item
                          key={l.id}
                          value={`lead-${l.id}`}
                          icon={User}
                          hint={leadStatusLabels[l.status]}
                          onSelect={() => go(`/leads/${l.id}`)}
                        >
                          {l.name}
                          {l.email && (
                            <span className="ml-2 type-small text-fg-subtle">{l.email}</span>
                          )}
                        </Item>
                      ))}
                    </Command.Group>
                  )}
                  {data.contacts.length > 0 && (
                    <Command.Group heading="Contacts" className={groupClass}>
                      {data.contacts.map((c) => (
                        <Item
                          key={c.id}
                          value={`contact-${c.id}`}
                          icon={UserRound}
                          hint={c.company}
                          onSelect={() => go(`/contacts/${c.id}`)}
                        >
                          {c.name}
                        </Item>
                      ))}
                    </Command.Group>
                  )}
                  {data.deals.length > 0 && (
                    <Command.Group heading="Deals" className={groupClass}>
                      {data.deals.map((d) => (
                        <Item
                          key={d.id}
                          value={`deal-${d.id}`}
                          icon={Briefcase}
                          hint={d.value !== null ? formatMoney(d.value, d.currency) : null}
                          onSelect={() => go(`/deals/${d.id}`)}
                        >
                          {d.title}
                        </Item>
                      ))}
                    </Command.Group>
                  )}
                </>
              )}
              {actions.length > 0 && (
                <Command.Group heading="Quick actions" className={groupClass}>
                  {actions.map((a) => (
                    <Item key={a.label} value={a.label} icon={a.icon} onSelect={() => go(a.to)}>
                      {a.label}
                    </Item>
                  ))}
                </Command.Group>
              )}
              {pages.length > 0 && (
                <Command.Group heading="Go to" className={groupClass}>
                  {pages.map((p) => (
                    <Item key={p.to} value={`go-${p.to}`} icon={p.icon} onSelect={() => go(p.to)}>
                      {p.label}
                    </Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
