import { useParams } from 'react-router';
import { MessageSquare } from 'lucide-react';
import { useCommentPosts } from '@/api/instagram';
import { EmptyState } from '@/components/ui/empty-state';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { cn } from '@/lib/cn';
import { CommentPostList } from './comment-post-list';
import { defaultPostId } from './comment-threads';
import { PostComments } from './post-comments';

/**
 * Two panes like Messages: posts on the left, the chosen post's comments on the right.
 * /inbox/comments opens the first post with pending work (desktop); on small screens only one
 * pane shows — the posts at /inbox/comments, a post (with a back button) at /inbox/comments/:mediaId.
 */
export default function CommentsPage() {
  useDocumentTitle('Instagram comments');
  const { mediaId } = useParams();
  const { data: posts, isLoading, error, refetch } = useCommentPosts();
  const selected = mediaId ?? (posts ? defaultPostId(posts) : undefined);
  const post = posts?.find((p) => p.mediaId === selected);

  return (
    <div className="flex h-[calc(100dvh-14rem)] min-h-[30rem] overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <section
        aria-label="Posts"
        className={cn(
          'min-h-0 w-full flex-col overflow-y-auto border-border md:flex md:w-[340px] md:shrink-0 md:border-r',
          mediaId ? 'hidden' : 'flex',
        )}
      >
        <CommentPostList
          posts={posts}
          loading={isLoading}
          error={error}
          onRetry={() => void refetch()}
          activeId={selected}
        />
      </section>
      <section
        aria-label="Post comments"
        className={cn('min-h-0 min-w-0 flex-1 flex-col md:flex', mediaId ? 'flex' : 'hidden')}
      >
        {selected ? (
          <PostComments key={selected} mediaId={selected} post={post} />
        ) : (
          <EmptyState
            className="flex-1"
            icon={MessageSquare}
            title={isLoading ? 'Loading…' : 'No comments yet'}
            text={isLoading ? undefined : 'Comments on your posts will show up here.'}
          />
        )}
      </section>
    </div>
  );
}
