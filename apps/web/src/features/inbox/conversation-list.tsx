import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { BotOff, Inbox, Search, SearchX } from 'lucide-react';
import type { IgConversation } from '@leados/shared';
import { useConversations, useInstagramStatus, type ConversationFilter } from '@/api/instagram';
import { IgAvatar, igDisplayName } from '@/components/domain/ig-avatar';
import { Badge } from '@/components/ui/badge';
import { buttonClasses } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { SegmentedControl } from '@/features/tasks/segmented-control';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { errorMessage } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import { useSession } from '@/providers/session';

const FILTERS: ReadonlyArray<{ value: ConversationFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'attention', label: 'Needs attention' },
];

function isFilter(v: string | null): v is ConversationFilter {
  return v === 'all' || v === 'unread' || v === 'attention';
}

function ConversationRow({
  conversation: c,
  active,
  search,
}: {
  conversation: IgConversation;
  active: boolean;
  search: string;
}) {
  const name = igDisplayName(c);
  const unread = c.unreadCount > 0;
  const needsYou = c.needsAttention || c.hasDraft;
  return (
    <Link
      to={`/inbox/${c.id}${search}`}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex gap-3 px-4 py-3 transition-colors hover:bg-muted/60',
        active && 'bg-primary-subtle/60 hover:bg-primary-subtle/60',
      )}
    >
      <IgAvatar name={name} src={c.profilePictureUrl} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span
            className={cn('truncate type-body text-fg', unread ? 'font-semibold' : 'font-medium')}
          >
            {name}
          </span>
          {c.lastMessageAt && (
            <time
              dateTime={c.lastMessageAt}
              className="ml-auto shrink-0 type-caption text-fg-subtle"
            >
              {formatRelative(c.lastMessageAt)}
            </time>
          )}
        </span>
        {c.name && c.username && (
          <span className="block truncate type-caption text-fg-subtle">@{c.username}</span>
        )}
        <span className="mt-0.5 flex items-center gap-2">
          <span
            className={cn(
              'min-w-0 flex-1 truncate type-small',
              unread ? 'text-fg' : 'text-fg-muted',
            )}
          >
            {c.lastMessagePreview || 'No messages yet'}
          </span>
          {!c.aiEnabled && (
            <span className="flex shrink-0 text-fg-subtle" title="Auto-reply paused">
              <BotOff aria-hidden className="size-3.5" />
              <span className="sr-only">Auto-reply paused</span>
            </span>
          )}
          {needsYou && <Badge tone="warning">Needs you</Badge>}
          {unread && (
            <span className="flex items-center">
              <span aria-hidden className="size-2 rounded-full bg-accent" />
              <span className="sr-only">Unread</span>
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}

function ListSkeleton() {
  return (
    <LoadingRegion label="Loading conversations…">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex gap-3 px-4 py-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </LoadingRegion>
  );
}

function NoConversations() {
  const { isAdmin } = useSession();
  const { data: status } = useInstagramStatus();
  const notConnected = status && !status.connected;
  return (
    <EmptyState
      compact
      icon={Inbox}
      title={notConnected ? 'Instagram isn’t connected yet' : 'No conversations yet'}
      text={
        notConnected
          ? 'Connect your Instagram account and new direct messages will show up here.'
          : 'When someone sends your Instagram account a message, it shows up here.'
      }
      action={
        notConnected && isAdmin ? (
          <Link to="/settings/instagram" className={buttonClasses({ variant: 'primary' })}>
            Connect Instagram
          </Link>
        ) : undefined
      }
    />
  );
}

/** Left pane: filter tabs, search and the conversation list. */
export function ConversationList({ activeId }: { activeId?: string }) {
  const [params, setParams] = useSearchParams();
  const filterParam = params.get('filter');
  const filter: ConversationFilter = isFilter(filterParam) ? filterParam : 'all';
  const [search, setSearch] = useState(params.get('search') ?? '');
  const debounced = useDebouncedValue(search.trim(), 300);

  // Keep the URL in sync so links like /inbox?search=@name work and survive reloads.
  useEffect(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (debounced) next.set('search', debounced);
        else next.delete('search');
        return next;
      },
      { replace: true },
    );
  }, [debounced, setParams]);

  const { data, isLoading, error, refetch } = useConversations({
    filter,
    search: debounced.replace(/^@/, '') || undefined,
  });
  const qs = params.toString() ? `?${params.toString()}` : '';
  const items = data?.data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 border-b border-border p-3">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle"
          />
          <Input
            type="search"
            aria-label="Search conversations"
            placeholder="Search by name or @username"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <SegmentedControl
          label="Show conversations"
          value={filter}
          options={FILTERS}
          className="self-start"
          onChange={(v) =>
            setParams((prev) => {
              const next = new URLSearchParams(prev);
              if (v === 'all') next.delete('filter');
              else next.set('filter', v);
              return next;
            })
          }
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <ListSkeleton />
        ) : error && !data ? (
          <ErrorState compact message={errorMessage(error)} onRetry={() => void refetch()} />
        ) : items.length === 0 ? (
          debounced || filter !== 'all' ? (
            <EmptyState
              compact
              icon={SearchX}
              title="Nothing matches"
              text={
                debounced
                  ? `No conversations match “${debounced}”.`
                  : filter === 'unread'
                    ? 'You’ve read everything.'
                    : 'Nothing needs your attention right now.'
              }
            />
          ) : (
            <NoConversations />
          )
        ) : (
          <ul aria-label="Conversations" className="divide-y divide-border">
            {items.map((c) => (
              <li key={c.id}>
                <ConversationRow conversation={c} active={c.id === activeId} search={qs} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
