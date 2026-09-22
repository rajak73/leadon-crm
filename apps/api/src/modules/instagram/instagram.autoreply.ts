import type { CommentReplyMode } from '@leados/shared';
import { logger } from '../../lib/logger.js';
import { withLock } from '../../lib/lock.js';
import { prisma } from '../../lib/prisma.js';
import { cancelDebounce, cancelDebouncePrefix, debounce } from '../../lib/queue.js';
import { REPLY_WINDOW_MS } from '../../lib/serializers.js';
import { resolveProvider } from '../ai/index.js';
import { notifyAdmins } from '../notifications/index.js';
import { getSettings } from '../settings/index.js';
import { getAutoReplySettings } from './autoreply.settings.js';
import { activeAccount, getAccount } from './instagram.account.js';
import { generateCommentReply, generateDmReply } from './instagram.ai.js';
import { conversationLock, fillLeadContact, handleOf, quote } from './instagram.common.js';
import type { PromptSettings, TranscriptLine } from './instagram.prompt.js';
import { deliverCommentReply, deliverMessage } from './instagram.send.js';

const DAY = 24 * 60 * 60 * 1000;
const TRANSCRIPT_LENGTH = 20;

const dmKey = (conversationId: string) => `ig-dm-reply:${conversationId}`;
const commentKey = (commentId: string) => `ig-comment-reply:${commentId}`;

export type SkipReason =
  | 'disabled'
  | 'no_provider'
  | 'account'
  | 'paused'
  | 'window_closed'
  | 'no_inbound'
  | 'already_answered'
  | 'daily_limit'
  | 'ai_failed'
  | 'stale';

export async function promptSettings(): Promise<PromptSettings> {
  const [app, auto] = await Promise.all([getSettings(), getAutoReplySettings()]);
  return {
    companyName: app.companyName,
    businessInfo: auto.businessInfo,
    tone: auto.tone,
    collectContactDetails: auto.collectContactDetails,
  };
}

// ─── Scheduling ──────────────────────────────────────────────────────────────

/**
 * Debounced per conversation: each new inbound message restarts the timer, so a burst of
 * messages gets one reply `replyDelaySeconds` after the last one.
 */
export async function scheduleDmAutoReply(conversationId: string): Promise<void> {
  const settings = await getAutoReplySettings();
  if (!settings.dmEnabled) return;
  debounce(
    dmKey(conversationId),
    settings.replyDelaySeconds * 1000,
    'instagram.dm-auto-reply',
    () => runDmAutoReply(conversationId),
  );
}

export const cancelDmAutoReply = (conversationId: string) => cancelDebounce(dmKey(conversationId));

/** A short, human-looking pause (1–5 s) before answering a comment. */
export async function scheduleCommentAutoReply(commentDbId: string): Promise<void> {
  const settings = await getAutoReplySettings();
  if (!settings.commentsEnabled) return;
  const delay = 1000 + Math.floor(Math.random() * 4000);
  debounce(commentKey(commentDbId), delay, 'instagram.comment-auto-reply', () =>
    runCommentAutoReply(commentDbId),
  );
}

export function cancelAllAutoReplies(which: { dms: boolean; comments: boolean }): void {
  if (which.dms) cancelDebouncePrefix('ig-dm-reply:');
  if (which.comments) cancelDebouncePrefix('ig-comment-reply:');
}

// ─── DMs ─────────────────────────────────────────────────────────────────────

async function latestInbound(conversationId: string) {
  return prisma.igMessage.findFirst({
    where: { conversationId, direction: 'INBOUND' },
    orderBy: { createdAt: 'desc' },
  });
}

/** Something already answers the latest inbound message: a sent/sending reply or a newer draft. */
async function answeredSince(conversationId: string, since: Date): Promise<boolean> {
  const n = await prisma.igMessage.count({
    where: {
      conversationId,
      direction: 'OUTBOUND',
      createdAt: { gte: since },
      status: { in: ['SENT', 'SENDING', 'DRAFT'] },
    },
  });
  return n > 0;
}

export async function transcriptFor(conversationId: string): Promise<TranscriptLine[]> {
  const rows = await prisma.igMessage.findMany({
    where: { conversationId, status: { in: ['RECEIVED', 'SENT', 'SENDING'] } },
    orderBy: { createdAt: 'desc' },
    take: TRANSCRIPT_LENGTH,
  });
  return rows.reverse().map((m) => ({
    from: m.direction === 'INBOUND' ? 'customer' : 'business',
    text: m.text?.trim() || '[sent an attachment]',
    at: m.createdAt,
  }));
}

export async function knownLeadFor(conv: {
  leadId: string | null;
  name: string | null;
  username: string | null;
}) {
  const lead = conv.leadId
    ? await prisma.lead.findFirst({ where: { id: conv.leadId, deletedAt: null } })
    : null;
  return {
    name: conv.name ?? (lead ? [lead.firstName, lead.lastName].filter(Boolean).join(' ') : null),
    username: conv.username,
    email: lead?.email ?? null,
    phone: lead?.phone ?? null,
  };
}

/** Stores `text` as the conversation's single pending AI draft (older drafts are discarded). */
async function saveDraft(conversationId: string, text: string): Promise<void> {
  await prisma.$transaction([
    prisma.igMessage.updateMany({
      where: { conversationId, status: 'DRAFT' },
      data: { status: 'DISCARDED' },
    }),
    prisma.igMessage.create({
      data: { conversationId, direction: 'OUTBOUND', author: 'AI', status: 'DRAFT', text },
    }),
    prisma.igConversation.update({
      where: { id: conversationId },
      data: { needsAttention: true },
    }),
  ]);
}

/**
 * The debounced DM auto-reply. Every guard is re-checked here (settings may have changed since
 * scheduling) and again after the AI call, just before anything is stored or sent.
 * Returns why nothing was sent, or null when a reply/draft/handoff was produced.
 */
export async function runDmAutoReply(conversationId: string): Promise<SkipReason | null> {
  const settings = await getAutoReplySettings();
  if (!settings.dmEnabled) return 'disabled';
  if (resolveProvider().provider === 'rules') return 'no_provider';
  const acc = await activeAccount();
  if (!acc) return 'account';

  const conv = await prisma.igConversation.findUnique({ where: { id: conversationId } });
  if (!conv) return 'stale';
  if (!conv.aiEnabled) return 'paused';
  const now = new Date();
  if (!conv.lastInboundAt || conv.lastInboundAt.getTime() + REPLY_WINDOW_MS <= now.getTime())
    return 'window_closed';
  const inbound = await latestInbound(conversationId);
  if (!inbound) return 'no_inbound';
  if (await answeredSince(conversationId, inbound.createdAt)) return 'already_answered';

  const aiRepliesToday = await prisma.igMessage.count({
    where: {
      conversationId,
      author: 'AI',
      status: 'SENT',
      sentAt: { gte: new Date(now.getTime() - DAY) },
    },
  });
  if (aiRepliesToday >= settings.maxRepliesPerDay) {
    await prisma.igConversation.update({
      where: { id: conversationId },
      data: {
        aiEnabled: false,
        aiPausedReason: 'Daily auto-reply limit reached',
        needsAttention: true,
      },
    });
    await notifyAdmins(
      {
        type: 'AI_HANDOFF',
        title: `AI paused for ${handleOf(conv)}`,
        body: `The daily auto-reply limit (${settings.maxRepliesPerDay}) was reached. Reply yourself or turn AI back on.`,
        entityType: 'ig_conversation',
        entityId: conversationId,
      },
      { collapse: true },
    );
    return 'daily_limit';
  }

  let result;
  try {
    result = await generateDmReply(
      await promptSettings(),
      await transcriptFor(conversationId),
      await knownLeadFor(conv),
    );
  } catch (err) {
    logger.error({ err, conversationId }, 'AI reply failed; nothing was sent');
    await prisma.igConversation.update({
      where: { id: conversationId },
      data: { needsAttention: true },
    });
    return 'ai_failed';
  }

  await fillLeadContact(conv.leadId, result.extracted, conv);

  // Decide and store under the conversation lock; send afterwards (network outside the lock).
  const outcome = await withLock(conversationLock(conversationId), async () => {
    const fresh = await prisma.igConversation.findUnique({ where: { id: conversationId } });
    const newest = await latestInbound(conversationId);
    if (!fresh?.aiEnabled || newest?.id !== inbound.id) return null; // a newer message will get its own run
    if (await answeredSince(conversationId, inbound.createdAt)) return null;
    const current = await getAutoReplySettings();
    if (!current.dmEnabled) return null;

    if (result.handoff) {
      await prisma.igConversation.update({
        where: { id: conversationId },
        data: {
          aiEnabled: false,
          aiPausedReason: result.handoffReason ?? 'Needs a person',
          needsAttention: true,
        },
      });
      const text = current.handoffMessage.trim();
      let sendId: string | null = null;
      if (text && current.mode === 'AUTO') {
        sendId = (
          await prisma.igMessage.create({
            data: { conversationId, direction: 'OUTBOUND', author: 'AI', status: 'SENDING', text },
          })
        ).id;
      } else if (text) {
        await saveDraft(conversationId, text);
      }
      return { kind: 'handoff' as const, sendId };
    }

    const reply = result.reply!;
    if (current.mode === 'AUTO') {
      const msg = await prisma.igMessage.create({
        data: {
          conversationId,
          direction: 'OUTBOUND',
          author: 'AI',
          status: 'SENDING',
          text: reply,
        },
      });
      return { kind: 'reply' as const, sendId: msg.id };
    }
    await saveDraft(conversationId, reply);
    return { kind: 'draft' as const, sendId: null };
  });
  if (!outcome) return 'stale';

  if (outcome.sendId) await deliverMessage(outcome.sendId, acc.token);

  if (outcome.kind === 'handoff') {
    await notifyAdmins(
      {
        type: 'AI_HANDOFF',
        title: `${handleOf(conv)} needs a person`,
        body: `${result.handoffReason ?? 'The AI handed this conversation to your team.'} Last message: ${quote(inbound.text, 120) || '[attachment]'}`,
        entityType: 'ig_conversation',
        entityId: conversationId,
      },
      { collapse: true },
    );
  } else if (outcome.kind === 'draft') {
    await notifyAdmins(
      {
        type: 'AI_DRAFT_READY',
        title: `AI reply ready for ${handleOf(conv)}`,
        body: `Review and send: ${quote(result.reply, 120)}`,
        entityType: 'ig_conversation',
        entityId: conversationId,
      },
      { collapse: true },
    );
  }
  return null;
}

// ─── Comments ────────────────────────────────────────────────────────────────

/** Replies inside a thread we already answered (or to our own replies) are left to people. */
export async function isInRepliedThread(c: { parentCommentId: string | null }): Promise<boolean> {
  if (!c.parentCommentId) return false;
  const parent = await prisma.igComment.findUnique({
    where: { commentId: c.parentCommentId },
    select: { replyStatus: true },
  });
  if (parent?.replyStatus === 'REPLIED') return true;
  const repliedByUs = await prisma.igComment.count({
    where: { parentCommentId: c.parentCommentId, replyStatus: 'REPLIED' },
  });
  return repliedByUs > 0;
}

const NO_NOTIFY_SKIP = /^(spam|no reply needed)/i;

export async function runCommentAutoReply(commentDbId: string): Promise<SkipReason | null> {
  const settings = await getAutoReplySettings();
  if (!settings.commentsEnabled) return 'disabled';
  if (resolveProvider().provider === 'rules') return 'no_provider';
  const acc = await activeAccount();
  if (!acc) return 'account';
  const c = await prisma.igComment.findUnique({ where: { id: commentDbId } });
  if (!c || c.replyStatus !== 'NONE') return 'already_answered';
  const account = await getAccount();
  if (c.fromIgId === account?.igUserId) return 'already_answered';
  if (await isInRepliedThread(c)) return 'already_answered';

  const mode = settings.commentReplyMode as CommentReplyMode;
  let result;
  try {
    result = await generateCommentReply(await promptSettings(), mode, {
      caption: c.mediaCaption,
      username: c.fromUsername,
      text: c.text,
    });
  } catch (err) {
    logger.error({ err, commentId: c.id }, 'AI comment reply failed; nothing was sent');
    return 'ai_failed';
  }

  // Claim the comment so a manual reply that happened meanwhile wins.
  const current = await getAutoReplySettings();
  if (!current.commentsEnabled) return 'disabled';
  if (result.skip) {
    const claimed = await prisma.igComment.updateMany({
      where: { id: c.id, replyStatus: 'NONE' },
      data: { replyStatus: 'SKIPPED', skipReason: result.skipReason },
    });
    if (claimed.count && !NO_NOTIFY_SKIP.test(result.skipReason ?? '')) {
      await notifyAdmins({
        type: 'AI_HANDOFF',
        title: `Comment from ${handleOf({ username: c.fromUsername })} needs a person`,
        body: `${result.skipReason ?? 'The AI skipped this comment.'} ${quote(c.text, 120)}`,
        entityType: 'ig_comment',
        entityId: c.id,
      });
    }
    return null;
  }

  if (current.mode === 'DRAFT') {
    const claimed = await prisma.igComment.updateMany({
      where: { id: c.id, replyStatus: 'NONE' },
      data: {
        replyStatus: 'DRAFT',
        publicReply: result.publicReply,
        privateReply: result.privateReply,
      },
    });
    if (claimed.count) {
      const waiting = await prisma.igComment.count({ where: { replyStatus: 'DRAFT' } });
      await notifyAdmins(
        {
          type: 'AI_DRAFT_READY',
          title:
            waiting === 1
              ? `AI reply ready for ${handleOf({ username: c.fromUsername })}'s comment`
              : `${waiting} AI comment replies are waiting for approval`,
          body: `Latest: ${quote(c.text, 120)}`,
          entityType: 'ig_comment',
          entityId: null,
        },
        { collapse: true },
      );
    }
    return null;
  }

  const fresh = await prisma.igComment.findUnique({
    where: { id: c.id },
    select: { replyStatus: true },
  });
  if (fresh?.replyStatus !== 'NONE') return 'already_answered';
  await deliverCommentReply(
    c.id,
    { publicReply: result.publicReply, privateReply: result.privateReply },
    acc.token,
    null,
  );
  return null;
}
