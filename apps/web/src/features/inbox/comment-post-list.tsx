import { useState } from 'react';
import { Link } from 'react-router';
import { Check, Image as ImageIcon, MessageSquare } from 'lucide-react';
import type { IgCommentPost } from '@leados/shared';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import { captionLine, postSummary } from './comment-threads';

/** Post thumbnail with a neutral icon when there is none or it fails to load. */
export function PostThumb({ src, className }: { src: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  const box = cn('size-10 shrink-0 rounded-md bg-muted', className);
  if (!src || failed)
    return (
      <span className={cn(box, 'flex items-center justify-center text-fg-subtle')}>
        <ImageIcon aria-hidden className="size-4" />
      </span>
    );
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn(box, 'object-cover')}
    />
  );
}

function PostSummary({ post }: { post: IgCommentPost }) {
  const s = postSummary(post);
  return (
    <span
      className={cn(
        'flex min-w-0 items-center gap-1.5 type-caption',
        s.tone === 'needs-reply' ? 'font-medium text-fg' : 'text-fg-muted',
      )}
    >
      {s.tone === 'needs-reply' && <span aria-hidden className="size-2 rounded-full bg-accent" />}
      <span className="truncate">{s.text}</span>
      {s.tone === 'done' && <Check aria-hidden className="size-3.5 shrink-0 text-success-fg" />}
    </span>
  );
}

function PostRow({ post, active }: { post: IgCommentPost; active: boolean }) {
  return (
    <Link
      to={`/inbox/comments/${encodeURIComponent(post.mediaId)}`}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex gap-3 px-3 py-2.5 transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
        active && 'bg-primary-subtle/60 hover:bg-primary-subtle/60',
      )}
    >
      <PostThumb src={post.thumbnailUrl} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate type-small font-medium text-fg">
            {captionLine(post.caption)}
          </span>
          <time
            dateTime={post.latestCommentAt}
            className="ml-auto shrink-0 type-caption text-fg-subtle"
          >
            {formatRelative(post.latestCommentAt)}
          </time>
        </span>
        <PostSummary post={post} />
      </span>
    </Link>
  );
}

interface CommentPostListProps {
  posts: IgCommentPost[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  activeId?: string;
}

/** Left pane: one row per post, pending work first (the server sorts). */
export function CommentPostList({
  posts,
  loading,
  error,
  onRetry,
  activeId,
}: CommentPostListProps) {
  if (loading)
    return (
      <LoadingRegion label="Loading posts…">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex gap-3 px-3 py-2.5">
            <Skeleton className="size-10" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </LoadingRegion>
    );
  if (error && !posts)
    return <ErrorState compact message={errorMessage(error)} onRetry={onRetry} />;
  if (!posts?.length)
    return (
      <EmptyState
        compact
        icon={MessageSquare}
        title="No comments yet"
        text="Comments on your posts will show up here."
      />
    );
  return (
    <ul aria-label="Posts" className="divide-y divide-border">
      {posts.map((p) => (
        <li key={p.mediaId}>
          <PostRow post={p} active={p.mediaId === activeId} />
        </li>
      ))}
    </ul>
  );
}
