import type { IgComment, IgCommentPost } from '@leados/shared';

export type CommentFilter = 'needs-reply' | 'draft' | 'all';

export const needsReply = (c: IgComment) => c.replyStatus === 'NONE' || c.replyStatus === 'FAILED';
export const hasDraft = (c: IgComment) => c.replyStatus === 'DRAFT';

const MATCHES: Record<CommentFilter, (c: IgComment) => boolean> = {
  'needs-reply': needsReply,
  draft: hasDraft,
  all: () => true,
};

export interface CommentThread {
  comment: IgComment;
  /** Replies inside the Instagram thread, oldest first. */
  replies: IgComment[];
}

const time = (c: IgComment) => Date.parse(c.commentedAt);

/**
 * Groups a post's comments into threads: top-level comments newest first, each with its
 * replies (matched by `parentCommentId`) oldest first. A reply whose parent isn't loaded
 * becomes its own thread.
 */
export function buildThreads(comments: IgComment[]): CommentThread[] {
  const byCommentId = new Map(comments.map((c) => [c.commentId, c]));
  const rootOf = (c: IgComment): IgComment => {
    const seen = new Set<string>();
    let cur = c;
    while (cur.parentCommentId && !seen.has(cur.commentId)) {
      seen.add(cur.commentId);
      const parent = byCommentId.get(cur.parentCommentId);
      if (!parent) break;
      cur = parent;
    }
    return cur;
  };
  const threads = new Map<string, CommentThread>();
  for (const c of comments) {
    const root = rootOf(c);
    const thread = threads.get(root.commentId) ?? { comment: root, replies: [] };
    threads.set(root.commentId, thread);
    if (root !== c) thread.replies.push(c);
  }
  const list = [...threads.values()];
  for (const t of list) t.replies.sort((a, b) => time(a) - time(b));
  return list.sort((a, b) => time(b.comment) - time(a.comment));
}

/** Threads where the comment or one of its replies matches the filter. */
export function filterThreads(threads: CommentThread[], filter: CommentFilter): CommentThread[] {
  const match = MATCHES[filter];
  return threads.filter((t) => match(t.comment) || t.replies.some(match));
}

export function countByFilter(comments: IgComment[]): Record<CommentFilter, number> {
  return {
    'needs-reply': comments.filter(needsReply).length,
    draft: comments.filter(hasDraft).length,
    all: comments.length,
  };
}

/** Short status line for a post in the list. */
export function postSummary(p: Pick<IgCommentPost, 'needsReplyCount' | 'draftCount'>): {
  tone: 'needs-reply' | 'draft' | 'done';
  text: string;
} {
  if (p.needsReplyCount > 0)
    return {
      tone: 'needs-reply',
      text: `${p.needsReplyCount} ${p.needsReplyCount === 1 ? 'needs' : 'need'} reply`,
    };
  if (p.draftCount > 0)
    return {
      tone: 'draft',
      text: `${p.draftCount} ${p.draftCount === 1 ? 'draft' : 'drafts'} ready`,
    };
  return { tone: 'done', text: 'All answered' };
}

/** The post to open when none is chosen: the first with pending work, else the first. */
export function defaultPostId(posts: IgCommentPost[]): string | undefined {
  return (posts.find((p) => p.needsReplyCount + p.draftCount > 0) ?? posts[0])?.mediaId;
}

/** First line of a caption, or a friendly fallback. */
export function captionLine(caption: string | null | undefined): string {
  return caption?.trim().split('\n')[0]?.trim() || 'Post without a caption';
}
