import { useSearchParams } from 'react-router';
import { BellOff, CheckCheck } from 'lucide-react';
import { useMarkAllNotificationsRead, useNotifications, useUnreadCount } from '@/api/notifications';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { errorMessage } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { notify } from '@/lib/toast';
import { NotificationItem } from './notification-item';

const PAGE_SIZE = 25;

function NotificationList({
  unreadOnly,
  page,
  onPageChange,
}: {
  unreadOnly: boolean;
  page: number;
  onPageChange: (p: number) => void;
}) {
  const { data, isLoading, error, refetch, isPlaceholderData } = useNotifications({
    page,
    unreadOnly,
    limit: PAGE_SIZE,
  });

  if (isLoading)
    return (
      <LoadingRegion label="Loading notifications…">
        <Card className="divide-y divide-border">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex gap-3 px-4 py-3">
              <Skeleton className="size-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          ))}
        </Card>
      </LoadingRegion>
    );
  if (error && !data)
    return <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />;

  const items = data?.data ?? [];
  if (items.length === 0)
    return (
      <Card>
        <EmptyState
          icon={BellOff}
          title="You're all caught up"
          text={
            unreadOnly
              ? 'No unread notifications.'
              : "When something needs your attention, you'll see it here."
          }
        />
      </Card>
    );

  return (
    <div className={cn('transition-opacity', isPlaceholderData && 'opacity-60')}>
      <Card className="overflow-hidden">
        <ul className="divide-y divide-border">
          {items.map((n) => (
            <li key={n.id}>
              <NotificationItem notification={n} />
            </li>
          ))}
        </ul>
      </Card>
      <Pagination meta={data?.meta} onPageChange={onPageChange} noun="notifications" />
    </div>
  );
}

export default function NotificationsPage() {
  useDocumentTitle('Notifications');
  const [params, setParams] = useSearchParams();
  const unreadOnly = params.get('unread') === '1';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const { data: unreadCount = 0 } = useUnreadCount();
  const markAll = useMarkAllNotificationsRead();

  function update(changes: Record<string, string | null>) {
    setParams((p) => {
      const next = new URLSearchParams(p);
      for (const [k, v] of Object.entries(changes)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      return next;
    });
  }

  const list = (
    <NotificationList
      unreadOnly={unreadOnly}
      page={page}
      onPageChange={(p) => update({ page: p > 1 ? String(p) : null })}
    />
  );

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Assignments, reminders and automation updates."
        actions={
          <Button
            icon={<CheckCheck aria-hidden />}
            disabled={unreadCount === 0}
            loading={markAll.isPending}
            onClick={() =>
              markAll.mutate(undefined, {
                onSuccess: () => notify.success('All notifications marked as read'),
                onError: (e) => notify.error(e, "We couldn't mark your notifications as read."),
              })
            }
          >
            Mark all as read
          </Button>
        }
      />
      <Tabs
        value={unreadOnly ? 'unread' : 'all'}
        onValueChange={(v) => update({ unread: v === 'unread' ? '1' : null, page: null })}
      >
        <TabsList label="Filter notifications">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread" count={unreadCount}>
            Unread
          </TabsTrigger>
        </TabsList>
        <TabsContent value="all">{list}</TabsContent>
        <TabsContent value="unread">{list}</TabsContent>
      </Tabs>
    </>
  );
}
