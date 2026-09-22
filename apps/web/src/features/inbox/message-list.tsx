import { Fragment, useEffect, useLayoutEffect, useRef } from 'react';
import { MessageCircle } from 'lucide-react';
import type { IgMessage } from '@leados/shared';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, isSameDay } from '@/lib/format';
import { MessageBubble } from './message-bubble';

/** "Today", "Yesterday" or a short date for the separators between days. */
export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (isSameDay(d, now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, yesterday)) return 'Yesterday';
  return formatDate(d);
}

/** Messages shown as bubbles. Drafts live in the draft card; discarded ones are hidden. */
export function visibleMessages(messages: IgMessage[]): IgMessage[] {
  return messages.filter((m) => m.status !== 'DRAFT' && m.status !== 'DISCARDED');
}

interface MessageListProps {
  messages: IgMessage[];
  customerName: string;
  currentUserId?: string;
  onRetry: (m: IgMessage) => void;
  retryingId?: string | null;
}

export function MessageList({
  messages,
  customerName,
  currentUserId,
  onRetry,
  retryingId,
}: MessageListProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const shown = visibleMessages(messages);
  const lastId = shown[shown.length - 1]?.id;

  // Follow new messages only when the reader is already at the bottom.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && nearBottom.current) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => {
      nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div
      ref={scroller}
      role="log"
      aria-label="Messages"
      // Scrollable region: must be reachable by keyboard so it can be scrolled.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      className="min-h-0 flex-1 overflow-y-auto px-3 py-4 focus-visible:outline-offset-[-2px] sm:px-5"
    >
      {shown.length === 0 ? (
        <EmptyState
          compact
          icon={MessageCircle}
          title="No messages yet"
          text="Messages in this conversation will show up here."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((m, i) => {
            const prev = shown[i - 1];
            const newDay = !prev || !isSameDay(new Date(prev.createdAt), new Date(m.createdAt));
            return (
              <Fragment key={m.id}>
                {newDay && (
                  <div className="flex items-center gap-3 py-1">
                    <span aria-hidden className="h-px flex-1 bg-border" />
                    <span className="type-caption font-medium text-fg-subtle">
                      {dayLabel(m.createdAt)}
                    </span>
                    <span aria-hidden className="h-px flex-1 bg-border" />
                  </div>
                )}
                <MessageBubble
                  message={m}
                  customerName={customerName}
                  currentUserId={currentUserId}
                  onRetry={onRetry}
                  retrying={retryingId === m.id}
                />
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
