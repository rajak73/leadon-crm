import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { IgComment, IgCommentPost } from '@leados/shared';
import { api, createMember, prisma, setupAdmin, testApp, type Session } from './helpers.js';
import { connectTestAccount, instagramTestEnv } from './instagram-helpers.js';

const app = testApp();
let member: Session;

const HOUR = 60 * 60 * 1000;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR);
let seq = 0;

function comment(
  mediaId: string,
  hoursAgo: number,
  replyStatus: string,
  extra: { caption?: string | null; thumb?: string | null; parentCommentId?: string } = {},
) {
  seq += 1;
  return prisma.igComment.create({
    data: {
      commentId: `c_${seq}`,
      mediaId,
      mediaPermalink: `https://www.instagram.com/p/${mediaId}/`,
      mediaCaption: extra.caption === undefined ? `Caption ${mediaId}` : extra.caption,
      mediaThumbnail: extra.thumb === undefined ? `https://cdn.test/${mediaId}.jpg` : extra.thumb,
      fromIgId: `u_${seq}`,
      fromUsername: `user${seq}`,
      text: `Comment ${seq}`,
      replyStatus,
      publicReply: replyStatus === 'DRAFT' ? 'Draft reply' : null,
      parentCommentId: extra.parentCommentId ?? null,
      commentedAt: ago(hoursAgo),
    },
  });
}

beforeAll(async () => {
  instagramTestEnv();
  const admin = await setupAdmin(app);
  member = await createMember(app, admin, 'Sales');
  await connectTestAccount(app, admin);

  // answered: newest comment overall, nothing pending
  await comment('answered', 1, 'REPLIED');
  await comment('answered', 5, 'SKIPPED');
  // drafty: one draft (pending 3h ago)
  await comment('drafty', 3, 'DRAFT');
  await comment('drafty', 30, 'REPLIED', { caption: 'Old caption', thumb: null });
  // busy: two need reply (one failed), newest pending 2h ago
  await comment('busy', 2, 'NONE');
  await comment('busy', 10, 'FAILED');
  await comment('busy', 20, 'REPLIED');
  // old: pending but older than the others
  await comment('old', 48, 'NONE', { caption: null, thumb: null });
});

beforeEach(() => instagramTestEnv());

describe('GET /instagram/comments/posts', () => {
  it('counts comments per post and puts posts with pending work first', async () => {
    const posts: IgCommentPost[] = (
      await api(app, member).get('/instagram/comments/posts').expect(200)
    ).body.data;
    expect(posts.map((p) => p.mediaId)).toEqual(['busy', 'drafty', 'old', 'answered']);
    const byId = Object.fromEntries(posts.map((p) => [p.mediaId, p]));
    expect(byId.busy).toMatchObject({
      permalink: 'https://www.instagram.com/p/busy/',
      caption: 'Caption busy',
      thumbnailUrl: 'https://cdn.test/busy.jpg',
      commentCount: 3,
      needsReplyCount: 2,
      draftCount: 0,
    });
    expect(byId.drafty).toMatchObject({
      commentCount: 2,
      needsReplyCount: 0,
      draftCount: 1,
      caption: 'Caption drafty', // newest comment's media info wins
      thumbnailUrl: 'https://cdn.test/drafty.jpg',
    });
    expect(byId.old).toMatchObject({ caption: null, thumbnailUrl: null, needsReplyCount: 1 });
    expect(byId.answered).toMatchObject({
      commentCount: 2,
      needsReplyCount: 0,
      draftCount: 0,
      latestPendingAt: null,
    });
    expect(Date.parse(byId.answered!.latestCommentAt)).toBeGreaterThan(
      Date.parse(byId.busy!.latestCommentAt),
    );
    expect(byId.busy!.latestPendingAt).toBe(byId.busy!.latestCommentAt);
  });

  it('needs a signed-in user', async () => {
    await api(app, { ...member, token: 'nope' })
      .get('/instagram/comments/posts')
      .expect(401);
  });
});

describe('GET /instagram/comments for one post', () => {
  it('lists a post oldest first with up to 100 per page, including thread replies', async () => {
    const parent = await comment('thread', 5, 'REPLIED');
    await comment('thread', 1, 'NONE', { parentCommentId: parent.commentId });
    const res = await api(app, member)
      .get('/instagram/comments?mediaId=thread&sortOrder=asc&limit=100')
      .expect(200);
    const list: IgComment[] = res.body.data;
    expect(list.map((c) => c.parentCommentId)).toEqual([null, parent.commentId]);
    expect(res.body.meta).toMatchObject({ limit: 100, total: 2 });
  });
});

describe('POST /instagram/comments/:id/discard', () => {
  it('drops the draft and puts the comment back to needing a reply', async () => {
    const draft = await prisma.igComment.findFirstOrThrow({ where: { replyStatus: 'DRAFT' } });
    const res = await api(app, member).post(`/instagram/comments/${draft.id}/discard`).expect(200);
    expect(res.body.data).toMatchObject({
      replyStatus: 'NONE',
      publicReply: null,
      privateReply: null,
    });
    await api(app, member).post(`/instagram/comments/${draft.id}/discard`).expect(409);
  });
});
