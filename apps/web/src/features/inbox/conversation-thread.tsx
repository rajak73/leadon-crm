import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { SearchX } from 'lucide-react';
import type { IgMessage } from '@leados/shared';
import { useConversation, useSendMessage, useUpdateConversation } from '@/api/instagram';
import { igDisplayName } from '@/components/domain/ig-avatar';
import { buttonClasses } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { errorMessage, isApiError } from '@/lib/api-client';
import { notify } from '@/lib/toast';
import { useSession } from '@/providers/session';
import { Composer } from './composer';
import { DraftCard, pendingDraft } from './draft-card';
import { MessageList } from './message-list';
import { ThreadHeader } from './thread-header';

function ThreadSkeleton() {
  return (
    <LoadingRegion label="Loading conversation…" className="flex flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-border p-4">
        <Skeleton className="size-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <Skeleton className="h-10 w-2/3 rounded-2xl" />
        <Skeleton className="h-10 w-1/2 self-end rounded-2xl" />
        <Skeleton className="h-16 w-3/5 rounded-2xl" />
      </div>
    </LoadingRegion>
  );
}

/** Right pane: one conversation with its draft card and composer. */
export function ConversationThread({ id }: { id: string }) {
  const { user } = useSession();
  const { data, isLoading, error, refetch, isRefetching } = useConversation(id);
  const markRead = useUpdateConversation(id);
  const retry = useSendMessage(id);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const unread = data?.unreadCount ?? 0;

  // Opening a thread (or a new message arriving while it's open) marks it read.
  const { mutate: mark } = markRead;
  useEffect(() => {
    if (unread > 0) mark({ markRead: true });
  }, [id, unread, mark]);

  if (isLoading) return <ThreadSkeleton />;
  if (!data) {
    if (isApiError(error) && error.status === 404)
      return (
        <EmptyState
          icon={SearchX}
          title="This conversation isn't available"
          text="It may have been removed, or the link is wrong."
          action={
            <Link to="/inbox" className={buttonClasses({ variant: 'secondary' })}>
              Back to inbox
            </Link>
          }
        />
      );
    return (
      <ErrorState
        message={errorMessage(error)}
        onRetry={() => void refetch()}
        retrying={isRefetching}
      />
    );
  }

  const draft = pendingDraft(data.messages);
  const onRetry = (m: IgMessage) => {
    if (!m.text) return;
    setRetryingId(m.id);
    retry.mutate(m.text, {
      onError: (e) => notify.error(e, "We couldn't send the message."),
      onSettled: () => setRetryingId(null),
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ThreadHeader conversation={data} />
      <MessageList
        messages={data.messages}
        customerName={igDisplayName(data)}
        currentUserId={user?.id}
        onRetry={onRetry}
        retryingId={retryingId}
      />
      {draft && <DraftCard conversationId={id} draft={draft} canReply={data.canReply} />}
      <Composer key={id} conversationId={id} canReply={data.canReply} />
    </div>
  );
}
