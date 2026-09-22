import { useParams } from 'react-router';
import { MessageCircle } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { cn } from '@/lib/cn';
import { ConversationList } from './conversation-list';
import { ConversationThread } from './conversation-thread';

/**
 * Two panes on desktop (list + thread). On small screens only one pane shows:
 * the list at /inbox, the thread (with a back button) at /inbox/:id.
 */
export default function MessagesPage() {
  const { id } = useParams();
  useDocumentTitle('Inbox');

  return (
    <div className="flex h-[calc(100dvh-14rem)] min-h-[30rem] overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <section
        aria-label="Conversations"
        className={cn(
          'min-h-0 w-full flex-col border-border md:flex md:w-[360px] md:shrink-0 md:border-r',
          id ? 'hidden' : 'flex',
        )}
      >
        <ConversationList activeId={id} />
      </section>
      <section
        aria-label="Conversation"
        className={cn('min-h-0 min-w-0 flex-1 flex-col md:flex', id ? 'flex' : 'hidden')}
      >
        {id ? (
          <ConversationThread key={id} id={id} />
        ) : (
          <EmptyState
            className="flex-1"
            icon={MessageCircle}
            title="Pick a conversation"
            text="Choose a chat on the left to read it and reply."
          />
        )}
      </section>
    </div>
  );
}
