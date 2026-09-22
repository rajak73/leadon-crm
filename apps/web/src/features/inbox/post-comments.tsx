import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowLeft, CheckCheck, ExternalLink, SearchX } from 'lucide-react';
import type { IgCommentPost } from '@leados/shared';
import { usePostComments } from '@/api/instagram';
import { Button, buttonClasses } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { SegmentedControl } from '@/features/tasks/segmented-control';
import { errorMessage } from '@/lib/api-client';
import { PostThumb } from './comment-post-list';
import { CommentRow } from './comment-row';
import {
  buildThreads,
  captionLine,
  countByFilter,
  filterThreads,
  type CommentFilter,
} from './comment-threads';

const isFilter = (v: string | null): v is CommentFilter =>
  v === 'needs-reply' || v === 'draft' || v === 'all';

function CommentsSkeleton() {
  return (
    <LoadingRegion label="Loading comments…">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex gap-2.5 px-4 py-3">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/4" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      ))}
    </LoadingRegion>
  );
}

/** Right pane: one post's comments as threads, with a status filter. */
export function PostComments({ mediaId, post }: { mediaId: string; post?: IgCommentPost }) {
  const [params, setParams] = useSearchParams();
  const raw = params.get('show');
  const filter: CommentFilter = isFilter(raw) ? raw : 'needs-reply';
  const [pages, setPages] = useState(1);
  useEffect(() => setPages(1), [mediaId]);
  const { data, isLoading, isFetching, error, refetch, isRefetching } = usePostComments(
    mediaId,
    pages,
  );
  const comments = useMemo(() => data?.data ?? [], [data]);
  const threads = useMemo(() => buildThreads(comments), [comments]);
  const shown = filterThreads(threads, filter);
  const loaded = countByFilter(comments);
  // The posts summary counts every comment; the loaded list may be only the newest pages.
  const counts = post
    ? { ...loaded, 'needs-reply': post.needsReplyCount, draft: post.draftCount }
    : loaded;
  const total = data?.meta?.total ?? comments.length;
  const olderLeft = Math.max(0, total - comments.length);
  const media = comments[0]?.media;
  const caption = post?.caption ?? media?.caption ?? null;
  const permalink = post?.permalink ?? media?.permalink ?? null;

  const options = [
    { value: 'needs-reply', label: `Needs reply (${counts['needs-reply']})` },
    { value: 'draft', label: `Draft ready (${counts.draft})` },
    { value: 'all', label: 'All' },
  ] as const;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-col gap-2 border-b border-border px-3 py-2.5 sm:px-4">
        <div className="flex items-start gap-2.5">
          <Link
            to="/inbox/comments"
            aria-label="Back to posts"
            className={buttonClasses({
              variant: 'ghost',
              iconOnly: true,
              className: '-ml-1 shrink-0 md:hidden',
            })}
          >
            <ArrowLeft aria-hidden />
          </Link>
          <PostThumb src={post?.thumbnailUrl ?? media?.thumbnailUrl ?? null} className="size-9" />
          <div className="min-w-0 flex-1">
            <h2
              className="line-clamp-2 type-small font-semibold text-fg"
              title={caption ?? undefined}
            >
              {caption?.trim() || captionLine(caption)}
            </h2>
            {permalink && (
              <a
                href={permalink}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 type-caption text-fg-muted hover:text-fg hover:underline"
              >
                View post
                <ExternalLink aria-hidden className="size-3" />
                <span className="sr-only"> on Instagram (opens in a new tab)</span>
              </a>
            )}
          </div>
        </div>
        <div className="-mx-3 overflow-x-auto px-3 [scrollbar-width:none] sm:-mx-4 sm:px-4">
          <SegmentedControl
            label="Show comments"
            value={filter}
            options={options}
            onChange={(v) =>
              setParams(
                (prev) => {
                  const next = new URLSearchParams(prev);
                  if (v === 'needs-reply') next.delete('show');
                  else next.set('show', v);
                  return next;
                },
                { replace: true },
              )
            }
          />
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {olderLeft > 0 && !isLoading && (
          <div className="flex justify-center border-b border-border p-3">
            <Button
              size="sm"
              loading={isFetching && pages > 1}
              onClick={() => setPages((p) => p + 1)}
            >
              Load older comments ({olderLeft.toLocaleString()} more)
            </Button>
          </div>
        )}
        {isLoading ? (
          <CommentsSkeleton />
        ) : error && !data ? (
          <ErrorState
            compact
            message={errorMessage(error)}
            onRetry={() => void refetch()}
            retrying={isRefetching}
          />
        ) : shown.length === 0 ? (
          filter === 'all' ? (
            <EmptyState compact icon={SearchX} title="No comments on this post" />
          ) : (
            <EmptyState
              compact
              icon={CheckCheck}
              title="All caught up on this post"
              text={
                filter === 'draft'
                  ? 'No AI drafts are waiting here.'
                  : 'Nothing here needs a reply right now.'
              }
            />
          )
        ) : (
          <ul aria-label="Comments" className="divide-y divide-border">
            {shown.map((t) => (
              <li key={t.comment.id}>
                <CommentRow comment={t.comment} />
                {t.replies.length > 0 && (
                  <ul
                    aria-label={`Replies to @${t.comment.fromUsername ?? 'this comment'}`}
                    className="-mt-1 mr-3 mb-3 ml-[3.375rem] border-l-2 border-border pl-3 sm:mr-4 sm:ml-[3.625rem]"
                  >
                    {t.replies.map((r) => (
                      <li key={r.id}>
                        <CommentRow comment={r} nested />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
