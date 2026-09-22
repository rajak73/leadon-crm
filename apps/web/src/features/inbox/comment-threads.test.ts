import { describe, expect, it } from 'vitest';
import type { IgComment, IgCommentPost } from '@leados/shared';
import {
  buildThreads,
  captionLine,
  countByFilter,
  defaultPostId,
  filterThreads,
  postSummary,
} from './comment-threads';

const base: IgComment = {
  id: 'k0',
  commentId: 'c0',
  parentCommentId: null,
  media: { id: 'm1', permalink: null, caption: null, thumbnailUrl: null },
  fromUsername: 'someone',
  text: 'Hi',
  lead: null,
  replyStatus: 'NONE',
  publicReply: null,
  privateReply: null,
  privateReplySent: false,
  replyError: null,
  skipReason: null,
  repliedBy: null,
  commentedAt: '2026-09-22T10:00:00.000Z',
};

const c = (id: string, at: string, extra: Partial<IgComment> = {}): IgComment => ({
  ...base,
  id,
  commentId: `ig_${id}`,
  commentedAt: `2026-09-22T${at}:00.000Z`,
  ...extra,
});

const post = (mediaId: string, needsReplyCount: number, draftCount: number): IgCommentPost => ({
  mediaId,
  permalink: null,
  caption: null,
  thumbnailUrl: null,
  commentCount: 3,
  needsReplyCount,
  draftCount,
  latestCommentAt: '2026-09-22T10:00:00.000Z',
  latestPendingAt: null,
});

describe('comment threads', () => {
  const comments = [
    c('a', '08:00', { replyStatus: 'REPLIED' }),
    c('b', '09:00', { replyStatus: 'DRAFT' }),
    c('r2', '11:00', { parentCommentId: 'ig_a' }),
    c('r1', '10:00', { parentCommentId: 'ig_a', replyStatus: 'SKIPPED' }),
    c('orphan', '07:00', { parentCommentId: 'ig_missing' }),
  ];

  it('nests replies under their parent, newest threads first and replies oldest first', () => {
    const threads = buildThreads(comments);
    expect(threads.map((t) => t.comment.id)).toEqual(['b', 'a', 'orphan']);
    expect(threads[1]!.replies.map((r) => r.id)).toEqual(['r1', 'r2']);
  });

  it('filters whole threads when a comment or a reply matches', () => {
    const threads = buildThreads(comments);
    expect(filterThreads(threads, 'needs-reply').map((t) => t.comment.id)).toEqual(['a', 'orphan']);
    expect(filterThreads(threads, 'draft').map((t) => t.comment.id)).toEqual(['b']);
    expect(filterThreads(threads, 'all')).toHaveLength(3);
    expect(countByFilter(comments)).toEqual({ 'needs-reply': 2, draft: 1, all: 5 });
  });

  it('summarises posts and picks the first one with work', () => {
    expect(postSummary(post('x', 2, 1)).text).toBe('2 need reply');
    expect(postSummary(post('x', 1, 0)).text).toBe('1 needs reply');
    expect(postSummary(post('x', 0, 1))).toEqual({ tone: 'draft', text: '1 draft ready' });
    expect(postSummary(post('x', 0, 0))).toEqual({ tone: 'done', text: 'All answered' });
    expect(defaultPostId([post('done', 0, 0), post('work', 0, 2)])).toBe('work');
    expect(defaultPostId([post('done', 0, 0)])).toBe('done');
    expect(defaultPostId([])).toBeUndefined();
    expect(captionLine('Sliding wardrobe\n#interiors')).toBe('Sliding wardrobe');
    expect(captionLine('  ')).toBe('Post without a caption');
  });
});
