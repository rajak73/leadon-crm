import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type {
  AiReplyPreview,
  CommentListQuery,
  CommentReplyInput,
  CommentReplyMode,
  CommentReplyPreview,
  ConversationListQuery,
  DraftActionInput,
  IgComment,
  IgCommentPost,
  IgConversation,
  IgConversationDetail,
  IgMessage,
  InboxCounts,
  PageMeta,
  SendMessageInput,
  SimulateInstagramInput,
  TestAutoReplyInput,
  UpdateConversationInput,
} from '@leados/shared';
import type { Actor } from '../../lib/auth.js';
import { conflict, notFound } from '../../lib/errors.js';
import { pageMeta } from '../../lib/http.js';
import { fullName } from '../../lib/labels.js';
import { withLock } from '../../lib/lock.js';
import { prisma } from '../../lib/prisma.js';
import {
  REPLY_WINDOW_MS,
  igCommentInclude,
  igConversationInclude,
  loadUserRefs,
  toIgComment,
  toIgConversation,
  toIgMessage,
} from '../../lib/serializers.js';
import { getAutoReplySettings } from './autoreply.settings.js';
import { requireActiveAccount } from './instagram.account.js';
import { sandboxAdapter } from './instagram.adapter.js';
import { generateCommentReply, generateDmReply, orUnavailable } from './instagram.ai.js';
import {
  cancelDmAutoReply,
  knownLeadFor,
  promptSettings,
  transcriptFor,
} from './instagram.autoreply.js';
import { conversationLock, ensureLeadFor, userLock } from './instagram.common.js';
import { handleCommentChange, handleMessagingEvent } from './instagram.pipeline.js';
import { deliverCommentReply, deliverMessage } from './instagram.send.js';

const DAY = 24 * 60 * 60 * 1000;
const WINDOW_CLOSED =
  'The 24-hour reply window has closed. Instagram only allows replies within 24 hours of the customer’s last message.';

async function userName(userId: string | null): Promise<string> {
  if (!userId) return 'someone';
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true },
  });
  return u ? fullName(u) : 'someone';
}

// ─── Conversations ───────────────────────────────────────────────────────────

async function loadConversation(id: string) {
  const conv = await prisma.igConversation.findUnique({
    where: { id },
    include: igConversationInclude,
  });
  if (!conv) throw notFound('conversation');
  return conv;
}

export async function getConversationDto(id: string): Promise<IgConversation> {
  return toIgConversation(await loadConversation(id));
}

export async function listConversations(
  q: ConversationListQuery,
): Promise<{ data: IgConversation[]; meta: PageMeta }> {
  const and: Prisma.IgConversationWhereInput[] = [];
  if (q.filter === 'unread') and.push({ unreadCount: { gt: 0 } });
  if (q.filter === 'attention')
    and.push({ OR: [{ needsAttention: true }, { messages: { some: { status: 'DRAFT' } } }] });
  for (const word of (q.search ?? '').split(/\s+/).filter(Boolean).slice(0, 5)) {
    const w = word.replace(/^@/, '');
    and.push({
      OR: [
        { username: { contains: w, mode: 'insensitive' } },
        { name: { contains: w, mode: 'insensitive' } },
      ],
    });
  }
  const where: Prisma.IgConversationWhereInput = and.length ? { AND: and } : {};
  const [rows, total] = await Promise.all([
    prisma.igConversation.findMany({
      where,
      include: igConversationInclude,
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
    prisma.igConversation.count({ where }),
  ]);
  const now = new Date();
  return {
    data: rows.map((r) => toIgConversation(r, now)),
    meta: pageMeta(q.page, q.limit, total),
  };
}

export async function getConversationDetail(id: string): Promise<IgConversationDetail> {
  const conv = await loadConversation(id);
  const messages = (
    await prisma.igMessage.findMany({
      where: { conversationId: id, status: { not: 'DISCARDED' } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
  ).reverse();
  const users = await loadUserRefs(
    prisma,
    messages.map((m) => m.sentById),
  );
  return { ...toIgConversation(conv), messages: messages.map((m) => toIgMessage(m, users)) };
}

export async function updateConversation(
  actor: Actor,
  id: string,
  input: UpdateConversationInput,
): Promise<IgConversation> {
  const conv = await loadConversation(id);
  const data: Prisma.IgConversationUncheckedUpdateInput = {};
  if (input.aiEnabled === true) {
    data.aiEnabled = true;
    data.aiPausedReason = null;
    if (conv.messages.length === 0) data.needsAttention = false;
  } else if (input.aiEnabled === false) {
    data.aiEnabled = false;
    data.aiPausedReason = `Turned off by ${await userName(actor.userId)}`;
    cancelDmAutoReply(id);
  }
  if (input.leadId !== undefined) {
    if (input.leadId) {
      const lead = await prisma.lead.findFirst({
        where: { id: input.leadId, deletedAt: null },
        select: { id: true },
      });
      if (!lead) throw notFound('lead');
    }
    data.leadId = input.leadId;
  }
  if (input.markRead) data.unreadCount = 0;
  await prisma.igConversation.update({ where: { id }, data });
  return getConversationDto(id);
}

function assertWindowOpen(lastInboundAt: Date | null): void {
  if (!lastInboundAt || lastInboundAt.getTime() + REPLY_WINDOW_MS <= Date.now())
    throw conflict(WINDOW_CLOSED);
}

async function toMessageDto(id: string): Promise<IgMessage> {
  const m = await prisma.igMessage.findUniqueOrThrow({ where: { id } });
  return toIgMessage(m, await loadUserRefs(prisma, [m.sentById]));
}

/** A person replies: any pending AI draft is discarded and the attention flag is cleared. */
export async function sendManualMessage(
  actor: Actor,
  conversationId: string,
  input: SendMessageInput,
): Promise<IgMessage> {
  const conv = await loadConversation(conversationId);
  assertWindowOpen(conv.lastInboundAt);
  const { token } = await requireActiveAccount();
  cancelDmAutoReply(conversationId);
  const msg = await withLock(conversationLock(conversationId), async () => {
    const [, , created] = await prisma.$transaction([
      prisma.igMessage.updateMany({
        where: { conversationId, status: 'DRAFT' },
        data: { status: 'DISCARDED' },
      }),
      prisma.igConversation.update({
        where: { id: conversationId },
        data: { needsAttention: false, unreadCount: 0 },
      }),
      prisma.igMessage.create({
        data: {
          conversationId,
          direction: 'OUTBOUND',
          author: 'USER',
          sentById: actor.userId,
          status: 'SENDING',
          text: input.text,
        },
      }),
    ]);
    return created;
  });
  await deliverMessage(msg.id, token);
  return toMessageDto(msg.id);
}

export async function draftAction(
  actor: Actor,
  messageId: string,
  input: DraftActionInput,
): Promise<IgMessage> {
  const draft = await prisma.igMessage.findUnique({
    where: { id: messageId },
    include: { conversation: true },
  });
  if (!draft) throw notFound('message');
  if (draft.status !== 'DRAFT') throw conflict('This draft was already sent or discarded.');
  const conversationId = draft.conversationId;

  if (input.action === 'discard') {
    const claimed = await prisma.igMessage.updateMany({
      where: { id: messageId, status: 'DRAFT' },
      data: { status: 'DISCARDED' },
    });
    if (!claimed.count) throw conflict('This draft was already sent or discarded.');
    await prisma.igConversation.update({
      where: { id: conversationId },
      data: { needsAttention: false },
    });
    return toMessageDto(messageId);
  }

  assertWindowOpen(draft.conversation.lastInboundAt);
  const { token } = await requireActiveAccount();
  cancelDmAutoReply(conversationId);
  const claimed = await prisma.igMessage.updateMany({
    where: { id: messageId, status: 'DRAFT' },
    data: {
      status: 'SENDING',
      text: input.text ?? draft.text,
      sentById: actor.userId,
      createdAt: new Date(), // it's sent now, so it belongs at the end of the thread
    },
  });
  if (!claimed.count) throw conflict('This draft was already sent or discarded.');
  await prisma.igConversation.update({
    where: { id: conversationId },
    data: { needsAttention: false },
  });
  await deliverMessage(messageId, token);
  return toMessageDto(messageId);
}

export async function createLeadForConversation(id: string): Promise<IgConversation> {
  const conv = await loadConversation(id);
  if (!conv.lead) {
    await withLock(userLock(conv.igsid), () =>
      ensureLeadFor({ igsid: conv.igsid, username: conv.username, name: conv.name }),
    );
  }
  return getConversationDto(id);
}

export async function suggestReply(conversationId: string): Promise<AiReplyPreview> {
  const conv = await loadConversation(conversationId);
  const lines = await transcriptFor(conversationId);
  if (!lines.some((l) => l.from === 'customer'))
    throw conflict('There is no message from the customer to reply to yet.');
  return orUnavailable(async () =>
    generateDmReply(await promptSettings(), lines, await knownLeadFor(conv)),
  );
}

// ─── Comments ────────────────────────────────────────────────────────────────

async function loadComment(id: string) {
  const c = await prisma.igComment.findUnique({ where: { id }, include: igCommentInclude });
  if (!c) throw notFound('comment');
  return c;
}

async function toCommentDto(id: string): Promise<IgComment> {
  const c = await loadComment(id);
  return toIgComment(c, await loadUserRefs(prisma, [c.repliedById]));
}

export async function listComments(
  q: CommentListQuery,
): Promise<{ data: IgComment[]; meta: PageMeta }> {
  const and: Prisma.IgCommentWhereInput[] = [];
  if (q.status?.length) and.push({ replyStatus: { in: q.status } });
  if (q.mediaId) and.push({ mediaId: q.mediaId });
  for (const word of (q.search ?? '').split(/\s+/).filter(Boolean).slice(0, 5)) {
    const w = word.replace(/^@/, '');
    and.push({
      OR: [
        { text: { contains: w, mode: 'insensitive' } },
        { fromUsername: { contains: w, mode: 'insensitive' } },
      ],
    });
  }
  const where: Prisma.IgCommentWhereInput = and.length ? { AND: and } : {};
  const [rows, total] = await Promise.all([
    prisma.igComment.findMany({
      where,
      include: igCommentInclude,
      orderBy: [{ commentedAt: q.sortOrder }, { id: q.sortOrder }],
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
    prisma.igComment.count({ where }),
  ]);
  const users = await loadUserRefs(
    prisma,
    rows.map((r) => r.repliedById),
  );
  return { data: rows.map((r) => toIgComment(r, users)), meta: pageMeta(q.page, q.limit, total) };
}

const PENDING = new Set(['NONE', 'FAILED', 'DRAFT']);
const later = (a: Date | null, b: Date | null) => (!a ? b : !b ? a : a > b ? a : b);

/**
 * One row per post with comment counts. A single groupBy (per post, status and media fields)
 * feeds everything; media fields come from the newest comment that has them.
 */
export async function listCommentPosts(): Promise<IgCommentPost[]> {
  const groups = await prisma.igComment.groupBy({
    by: ['mediaId', 'replyStatus', 'mediaPermalink', 'mediaCaption', 'mediaThumbnail'],
    _count: { _all: true },
    _max: { commentedAt: true },
  });
  type Acc = Omit<IgCommentPost, 'latestCommentAt' | 'latestPendingAt'> & {
    latest: Date | null;
    pending: Date | null;
    mediaAt: { permalink?: Date; caption?: Date; thumbnailUrl?: Date };
  };
  const posts = new Map<string, Acc>();
  for (const g of groups) {
    const at = g._max.commentedAt;
    let p = posts.get(g.mediaId);
    if (!p) {
      p = {
        mediaId: g.mediaId,
        permalink: null,
        caption: null,
        thumbnailUrl: null,
        commentCount: 0,
        needsReplyCount: 0,
        draftCount: 0,
        latest: null,
        pending: null,
        mediaAt: {},
      };
      posts.set(g.mediaId, p);
    }
    const n = g._count._all;
    p.commentCount += n;
    if (g.replyStatus === 'NONE' || g.replyStatus === 'FAILED') p.needsReplyCount += n;
    if (g.replyStatus === 'DRAFT') p.draftCount += n;
    p.latest = later(p.latest, at);
    if (PENDING.has(g.replyStatus)) p.pending = later(p.pending, at);
    const media = {
      permalink: g.mediaPermalink,
      caption: g.mediaCaption,
      thumbnailUrl: g.mediaThumbnail,
    } as const;
    for (const key of ['permalink', 'caption', 'thumbnailUrl'] as const) {
      const value = media[key];
      const seen = p.mediaAt[key];
      if (value && at && (!seen || at > seen)) {
        p[key] = value;
        p.mediaAt[key] = at;
      }
    }
  }
  const time = (d: Date | null) => d?.getTime() ?? 0;
  return [...posts.values()]
    .sort(
      (a, b) =>
        Number(Boolean(b.pending)) - Number(Boolean(a.pending)) ||
        time(b.pending) - time(a.pending) ||
        time(b.latest) - time(a.latest) ||
        a.mediaId.localeCompare(b.mediaId),
    )
    .map(({ latest, pending, mediaAt: _mediaAt, ...p }) => ({
      ...p,
      latestCommentAt: (latest ?? new Date(0)).toISOString(),
      latestPendingAt: pending ? pending.toISOString() : null,
    }));
}

export async function replyToCommentManually(
  actor: Actor,
  id: string,
  input: CommentReplyInput,
): Promise<IgComment> {
  const c = await loadComment(id);
  if (input.privateReply && c.privateReplySent && c.replyStatus !== 'FAILED')
    throw conflict('You already sent a private reply to this comment. Instagram allows only one.');
  if (input.privateReply && Date.now() - c.commentedAt.getTime() > 7 * DAY)
    throw conflict('Private replies are only possible within 7 days of the comment.');
  const { token } = await requireActiveAccount();
  await deliverCommentReply(
    id,
    { publicReply: input.publicReply ?? null, privateReply: input.privateReply ?? null },
    token,
    actor.userId,
  );
  return toCommentDto(id);
}

export async function skipComment(actor: Actor, id: string): Promise<IgComment> {
  const c = await loadComment(id);
  if (c.replyStatus === 'REPLIED') throw conflict('This comment already has a reply.');
  await prisma.igComment.update({
    where: { id },
    data: {
      replyStatus: 'SKIPPED',
      skipReason: `Skipped by ${await userName(actor.userId)}`,
      replyError: null,
      ...(c.replyStatus === 'DRAFT' ? { publicReply: null, privateReply: null } : {}),
    },
  });
  return toCommentDto(id);
}

/** Drops an AI draft; the comment goes back to needing a reply. */
export async function discardCommentDraft(id: string): Promise<IgComment> {
  const c = await loadComment(id);
  if (c.replyStatus !== 'DRAFT') throw conflict('This comment has no draft to discard.');
  await prisma.igComment.update({
    where: { id },
    data: { replyStatus: 'NONE', publicReply: null, privateReply: null, replyError: null },
  });
  return toCommentDto(id);
}

export async function suggestCommentReply(id: string): Promise<CommentReplyPreview> {
  const c = await loadComment(id);
  const settings = await getAutoReplySettings();
  return orUnavailable(async () =>
    generateCommentReply(await promptSettings(), settings.commentReplyMode as CommentReplyMode, {
      caption: c.mediaCaption,
      username: c.fromUsername,
      text: c.text,
    }),
  );
}

// ─── Counts, test, simulate ──────────────────────────────────────────────────

export async function inboxCounts(): Promise<InboxCounts> {
  const [unreadConversations, needsAttention, commentDrafts, commentsUnanswered] =
    await Promise.all([
      prisma.igConversation.count({ where: { unreadCount: { gt: 0 } } }),
      prisma.igConversation.count({
        where: { OR: [{ needsAttention: true }, { messages: { some: { status: 'DRAFT' } } }] },
      }),
      prisma.igComment.count({ where: { replyStatus: 'DRAFT' } }),
      prisma.igComment.count({
        where: {
          replyStatus: { in: ['NONE', 'FAILED'] },
          commentedAt: { gte: new Date(Date.now() - 7 * DAY) },
        },
      }),
    ]);
  return { unreadConversations, needsAttention, commentDrafts, commentsUnanswered };
}

export async function testAutoReply(
  input: TestAutoReplyInput,
): Promise<AiReplyPreview | CommentReplyPreview> {
  if (input.kind === 'comment') {
    const settings = await getAutoReplySettings();
    return orUnavailable(async () =>
      generateCommentReply(await promptSettings(), settings.commentReplyMode as CommentReplyMode, {
        caption: null,
        username: 'customer',
        text: input.text,
      }),
    );
  }
  return orUnavailable(async () =>
    generateDmReply(
      await promptSettings(),
      [{ from: 'customer', text: input.text, at: new Date() }],
      { name: null, username: null, email: null, phone: null },
    ),
  );
}

/** Stable, numeric-looking fake Instagram id for a simulated username. */
export function simulatedIgsid(username: string): string {
  const hex = crypto.createHash('sha256').update(username.toLowerCase()).digest('hex');
  return `9${BigInt(`0x${hex.slice(0, 13)}`)
    .toString()
    .padStart(15, '0')
    .slice(0, 15)}`;
}

export const SIMULATED_MEDIA_ID = 'sim_post_1';

/** Test mode only: pushes a fake DM or comment through the real webhook pipeline. */
export async function simulateInstagram(
  input: SimulateInstagramInput,
): Promise<{ conversationId: string } | { commentId: string }> {
  const { account } = await requireActiveAccount();
  const igsid = simulatedIgsid(input.username);
  sandboxAdapter.registerProfile(igsid, { username: input.username });
  const lock = userLock(igsid);
  if (input.kind === 'dm') {
    const conversationId = await withLock(lock, () =>
      handleMessagingEvent({
        sender: { id: igsid },
        recipient: { id: account.igUserId },
        timestamp: Date.now(),
        message: { mid: `sim_mid_${crypto.randomUUID()}`, text: input.text },
      }),
    );
    if (!conversationId) throw conflict('The message could not be simulated.');
    return { conversationId };
  }
  const commentId = await withLock(lock, () =>
    handleCommentChange(
      {
        id: `sim_comment_${crypto.randomUUID()}`,
        text: input.text,
        from: { id: igsid, username: input.username },
        media: { id: SIMULATED_MEDIA_ID, media_product_type: 'FEED' },
      },
      Math.floor(Date.now() / 1000),
    ),
  );
  if (!commentId) throw conflict('The comment could not be simulated.');
  return { commentId };
}
