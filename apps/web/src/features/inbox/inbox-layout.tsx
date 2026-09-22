import { Link, Outlet, useLocation } from 'react-router';
import { MessageCircle, MessageSquare, type LucideIcon } from 'lucide-react';
import { useInboxCounts } from '@/api/instagram';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/cn';

function SectionLink({
  to,
  active,
  icon: Icon,
  label,
  count,
}: {
  to: string;
  active: boolean;
  icon: LucideIcon;
  label: string;
  count?: number;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={cn(
        '-mb-px inline-flex h-10 items-center gap-2 border-b-2 px-3 type-body font-medium whitespace-nowrap transition-colors',
        active ? 'border-primary text-fg' : 'border-transparent text-fg-muted hover:text-fg',
      )}
    >
      <Icon aria-hidden className="size-4" />
      {label}
      {count ? (
        <span className="rounded-full bg-primary-subtle px-1.5 type-caption text-primary-subtle-fg tabular-nums">
          <span className="sr-only">(</span>
          {count}
          <span className="sr-only"> waiting)</span>
        </span>
      ) : null}
    </Link>
  );
}

/** Inbox shell: the page heading plus Messages / Comments tabs. */
export default function InboxLayout() {
  const { pathname } = useLocation();
  const onComments = pathname.startsWith('/inbox/comments');
  const { data: counts } = useInboxCounts();
  const messages = counts ? counts.unreadConversations + counts.needsAttention : 0;
  const comments = counts ? counts.commentsUnanswered + counts.commentDrafts : 0;
  return (
    <div className="flex flex-col">
      <PageHeader
        className="mb-3"
        title="Inbox"
        description="Instagram messages and comments, with AI help to answer them."
      />
      <nav aria-label="Inbox sections" className="mb-4 flex gap-1 border-b border-border">
        <SectionLink
          to="/inbox"
          icon={MessageCircle}
          label="Messages"
          count={messages}
          active={!onComments}
        />
        <SectionLink
          to="/inbox/comments"
          icon={MessageSquare}
          label="Comments"
          count={comments}
          active={onComments}
        />
      </nav>
      <Outlet />
    </div>
  );
}
