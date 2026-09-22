import { Prisma, type IgMessage } from '@prisma/client';
import { logger } from '../../lib/logger.js';
import { withLock } from '../../lib/lock.js';
import { prisma } from '../../lib/prisma.js';
import { handleGraphFailure } from './instagram.account.js';
import { GraphError, getAdapter } from './instagram.adapter.js';
import { commentLock, handleOf, logIgActivity, previewOf, quote } from './instagram.common.js';

const PRIVATE_REPLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const friendlyError = (err: unknown, fallback = 'Instagram rejected the message.') =>
  err instanceof GraphError ? err.message : fallback;

/**
 * Sends a message row that is in status SENDING. Idempotent: a row that is not SENDING or
 * already has a `mid` is never sent again. Network I/O happens outside any DB transaction.
 */
export async function deliverMessage(messageId: string, token: string): Promise<IgMessage> {
  const msg = await prisma.igMessage.findUniqueOrThrow({
    where: { id: messageId },
    include: { conversation: true },
  });
  if (msg.status !== 'SENDING' || msg.mid || !msg.text) return msg;
  const conv = msg.conversation;

  let mid: string;
  try {
    mid = (await getAdapter().sendMessage(token, conv.igsid, msg.text)).mid;
  } catch (err) {
    logger.warn({ err, messageId }, 'Instagram send failed');
    await handleGraphFailure(err);
    const [failed] = await prisma.$transaction([
      prisma.igMessage.update({
        where: { id: messageId },
        data: { status: 'FAILED', error: friendlyError(err) },
      }),
      prisma.igConversation.update({ where: { id: conv.id }, data: { needsAttention: true } }),
    ]);
    return failed;
  }

  const now = new Date();
  const markSent = () =>
    prisma.igMessage.update({
      where: { id: messageId },
      data: { status: 'SENT', mid, sentAt: now, error: null },
    });
  let sent: IgMessage;
  try {
    sent = await markSent();
  } catch (err) {
    // The echo webhook beat us and stored this mid as its own row: drop that duplicate.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    await prisma.igMessage.deleteMany({ where: { mid, id: { not: messageId } } });
    sent = await markSent();
  }
  await prisma.igConversation.update({
    where: { id: conv.id },
    data: { lastMessageAt: now, lastMessagePreview: previewOf(msg.text) },
  });
  await logIgActivity({
    type: 'INSTAGRAM_MESSAGE_SENT',
    leadId: conv.leadId,
    performedById: msg.sentById,
    description:
      msg.author === 'AI' && !msg.sentById
        ? `AI replied on Instagram to ${handleOf(conv)}: ${quote(msg.text)}`
        : `Instagram reply to ${handleOf(conv)}: ${quote(msg.text)}`,
    metadata: { conversationId: conv.id, messageId, author: msg.author },
  });
  return sent;
}

export interface CommentReplyParts {
  publicReply: string | null;
  privateReply: string | null;
}

/**
 * Sends a public reply and/or a private reply to a comment. Parts that were already delivered
 * (after a partial failure) are not sent again. Serialised per comment.
 */
export function deliverCommentReply(
  commentDbId: string,
  parts: CommentReplyParts,
  token: string,
  userId: string | null,
) {
  return withLock(commentLock(commentDbId), async () => {
    const c = await prisma.igComment.findUniqueOrThrow({ where: { id: commentDbId } });
    const retrying = c.replyStatus === 'FAILED';
    // Save the texts first so the echo of a private reply can be recognised as ours.
    // Texts not given replace a draft, but keep what was already sent.
    const keepSent = c.replyStatus === 'REPLIED' || retrying;
    await prisma.igComment.update({
      where: { id: c.id },
      data: {
        publicReply: parts.publicReply ?? (keepSent ? c.publicReply : null),
        privateReply: parts.privateReply ?? (keepSent ? c.privateReply : null),
      },
    });

    const adapter = getAdapter();
    const errors: string[] = [];
    let replyCommentId = c.replyCommentId;
    let privateReplySent = c.privateReplySent;
    let sentSomething = false;

    if (parts.publicReply && !(retrying && c.replyCommentId)) {
      try {
        replyCommentId = (await adapter.replyToComment(token, c.commentId, parts.publicReply)).id;
        sentSomething = true;
      } catch (err) {
        logger.warn({ err, commentId: c.id }, 'Instagram public comment reply failed');
        await handleGraphFailure(err);
        errors.push(friendlyError(err, 'Instagram rejected the reply.'));
      }
    }
    if (parts.privateReply && !privateReplySent) {
      if (Date.now() - c.commentedAt.getTime() > PRIVATE_REPLY_WINDOW_MS) {
        errors.push('Private replies are only possible within 7 days of the comment.');
      } else {
        try {
          await adapter.sendPrivateReply(token, c.commentId, parts.privateReply);
          privateReplySent = true;
          sentSomething = true;
        } catch (err) {
          logger.warn({ err, commentId: c.id }, 'Instagram private reply failed');
          await handleGraphFailure(err);
          errors.push(friendlyError(err, 'Instagram rejected the private message.'));
        }
      }
    }

    const updated = await prisma.igComment.update({
      where: { id: c.id },
      data: {
        replyStatus: errors.length ? 'FAILED' : 'REPLIED',
        replyError: errors.length ? errors.join(' ') : null,
        replyCommentId,
        privateReplySent,
        skipReason: null,
        repliedById: userId,
      },
    });
    if (sentSomething) {
      const what = [parts.publicReply && 'publicly', parts.privateReply && 'by DM']
        .filter(Boolean)
        .join(' and ');
      await logIgActivity({
        type: 'INSTAGRAM_COMMENT_REPLIED',
        leadId: c.leadId,
        performedById: userId,
        description: `${userId ? 'Replied' : 'AI replied'} ${what} to ${handleOf({ username: c.fromUsername })}'s Instagram comment: ${quote(parts.publicReply ?? parts.privateReply)}`,
        metadata: { commentId: c.id },
      });
    }
    return updated;
  });
}
