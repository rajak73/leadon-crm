import { Prisma, type IgConversation } from '@prisma/client';
import type { IgAttachment } from '@leados/shared';
import { decryptSecret } from '../../lib/crypto.js';
import { logger } from '../../lib/logger.js';
import { withLock } from '../../lib/lock.js';
import { prisma } from '../../lib/prisma.js';
import { enqueue } from '../../lib/queue.js';
import { notifyAdmins } from '../notifications/index.js';
import { getAutoReplySettings } from './autoreply.settings.js';
import { ACCOUNT_ID, getAccount } from './instagram.account.js';
import { getAdapter } from './instagram.adapter.js';
import {
  cancelDmAutoReply,
  scheduleCommentAutoReply,
  scheduleDmAutoReply,
} from './instagram.autoreply.js';
import {
  ensureLeadFor,
  existingLeadFor,
  handleOf,
  logIgActivity,
  previewOf,
  quote,
  userLock,
} from './instagram.common.js';

// ─── Webhook payload types (Instagram API with Instagram Login) ──────────────

export interface MessagingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    is_deleted?: boolean;
    is_unsupported?: boolean;
    attachments?: Array<{ type?: string; payload?: { url?: string } }>;
  };
  // read, reaction, postback, … are ignored
}

export interface CommentValue {
  id?: string;
  text?: string;
  parent_id?: string;
  from?: { id?: string; username?: string };
  media?: { id?: string; media_product_type?: string };
}

export interface WebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    messaging?: MessagingEvent[];
    changes?: Array<{ field?: string; value?: CommentValue }>;
  }>;
}

/** Meta sends ms for messaging timestamps and seconds for entry.time. Never in the future. */
function toDate(ts: number | undefined, now = new Date()): Date {
  if (typeof ts !== 'number' || !Number.isFinite(ts) || ts <= 0) return now;
  const ms = ts < 1e12 ? ts * 1000 : ts;
  return ms > now.getTime() ? now : new Date(ms);
}

const ATTACHMENT_MAP: Record<string, IgAttachment['type']> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  file: 'file',
  share: 'share',
  story_mention: 'story_mention',
  ig_reel: 'reel',
  reel: 'reel',
  animated_image_share: 'image',
};

function attachmentsOf(event: MessagingEvent): IgAttachment[] {
  return (event.message?.attachments ?? []).map((a) => ({
    type: ATTACHMENT_MAP[a.type ?? ''] ?? 'unknown',
    url: typeof a.payload?.url === 'string' ? a.payload.url : null,
  }));
}

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Queues every event of a verified webhook delivery. Each event is its own job (a failure is
 * logged with its id and doesn't stop the others) and events of one Instagram user run in
 * order under a per-user lock.
 */
export function processWebhookPayload(payload: WebhookPayload): void {
  if (payload.object !== 'instagram' || !Array.isArray(payload.entry)) return;
  enqueue('instagram.webhook-seen', () =>
    prisma.igAccount.updateMany({ where: { id: ACCOUNT_ID }, data: { lastWebhookAt: new Date() } }),
  );
  for (const entry of payload.entry) {
    for (const event of entry.messaging ?? []) {
      if (!event.message) continue; // read receipts, reactions, postbacks: ignored
      const customer = event.message.is_echo ? event.recipient?.id : event.sender?.id;
      if (!customer) continue;
      enqueue('instagram.message', async () => {
        try {
          await withLock(userLock(customer), () => handleMessagingEvent(event));
        } catch (err) {
          logger.error({ err, mid: event.message?.mid }, 'Instagram message processing failed');
          throw err;
        }
      });
    }
    for (const change of entry.changes ?? []) {
      if (change.field !== 'comments' || !change.value) continue;
      const value = change.value;
      const from = value.from?.id;
      if (!from) continue;
      enqueue('instagram.comment', async () => {
        try {
          await withLock(userLock(from), () => handleCommentChange(value, entry.time));
        } catch (err) {
          logger.error({ err, commentId: value.id }, 'Instagram comment processing failed');
          throw err;
        }
      });
    }
  }
}

// ─── Conversations ───────────────────────────────────────────────────────────

/** Finds or creates the thread with `igsid`, looking up the profile once (network outside any tx). */
async function upsertConversation(igsid: string, token: string | null): Promise<IgConversation> {
  const existing = await prisma.igConversation.findUnique({ where: { igsid } });
  if (existing && (existing.username || existing.name)) return existing;
  let profile = {
    username: null as string | null,
    name: null as string | null,
    profilePictureUrl: null as string | null,
  };
  if (token) {
    try {
      profile = await getAdapter().getUserProfile(token, igsid);
    } catch (err) {
      logger.warn({ err, igsid }, 'Instagram profile lookup failed');
    }
  }
  if (existing) {
    if (!profile.username && !profile.name) return existing;
    return prisma.igConversation.update({ where: { id: existing.id }, data: profile });
  }
  const leadId = await existingLeadFor(igsid);
  return prisma.igConversation.upsert({
    where: { igsid },
    create: { igsid, ...profile, leadId },
    update: {},
  });
}

async function tokenOrNull(): Promise<string | null> {
  const account = await getAccount();
  if (!account) return null;
  try {
    return decryptSecret(account.accessTokenEnc);
  } catch {
    return null;
  }
}

/** Handles one `messaging[]` item. Returns the conversation id when something was stored. */
export async function handleMessagingEvent(event: MessagingEvent): Promise<string | null> {
  const message = event.message;
  if (!message || message.is_deleted) return null;
  const mid = message.mid;
  if (!mid) return null;
  if (await prisma.igMessage.findUnique({ where: { mid }, select: { id: true } })) return null; // duplicate delivery

  const account = await getAccount();
  if (!account) {
    logger.warn('Instagram webhook received but no account is connected; ignored');
    return null;
  }
  const token = await tokenOrNull();
  const at = toDate(event.timestamp);
  const text = message.text?.trim() || null;
  const attachments = attachmentsOf(event);
  if (!text && attachments.length === 0 && !message.is_unsupported) return null;

  if (message.is_echo) return handleEcho(event.recipient!.id!, mid, text, attachments, at, token);

  const igsid = event.sender!.id!;
  if (igsid === account.igUserId) return null;
  const conv = await upsertConversation(igsid, token);
  const preview = previewOf(text, attachments as unknown as Prisma.JsonValue);
  try {
    await prisma.$transaction([
      prisma.igMessage.create({
        data: {
          conversationId: conv.id,
          direction: 'INBOUND',
          author: 'CUSTOMER',
          status: 'RECEIVED',
          mid,
          text: text ?? (message.is_unsupported ? '[Unsupported message]' : null),
          attachments: attachments as unknown as Prisma.InputJsonValue,
          createdAt: at,
        },
      }),
      prisma.igConversation.update({
        where: { id: conv.id },
        data: {
          unreadCount: { increment: 1 },
          lastInboundAt: !conv.lastInboundAt || conv.lastInboundAt < at ? at : conv.lastInboundAt,
          ...(!conv.lastMessageAt || conv.lastMessageAt <= at
            ? { lastMessageAt: at, lastMessagePreview: preview }
            : {}),
        },
      }),
    ]);
  } catch (err) {
    if (isUniqueViolation(err)) return null; // same mid stored concurrently: duplicate
    throw err;
  }

  const settings = await getAutoReplySettings();
  let leadId = conv.leadId;
  if (settings.createLeads && !leadId) {
    leadId = await ensureLeadFor({ igsid, username: conv.username, name: conv.name });
  }
  await logIgActivity({
    type: 'INSTAGRAM_MESSAGE_RECEIVED',
    leadId,
    description: `Instagram message from ${handleOf(conv)}: ${quote(text) || `[${preview.replace(/[[\]]/g, '')}]`}`,
    metadata: { conversationId: conv.id, mid },
  });
  await notifyAdmins(
    {
      type: 'INSTAGRAM_MESSAGE',
      title: `New Instagram message from ${handleOf(conv)}`,
      body: preview,
      entityType: 'ig_conversation',
      entityId: conv.id,
    },
    { collapse: true },
  );
  await scheduleDmAutoReply(conv.id);
  return conv.id;
}

/**
 * A message the business sent. Our own API sends are recognised by mid (or, if the echo beats
 * the API response, by the matching SENDING row / private comment reply); anything else was
 * typed in the Instagram app, so the AI steps back for this thread.
 */
async function handleEcho(
  igsid: string,
  mid: string,
  text: string | null,
  attachments: IgAttachment[],
  at: Date,
  token: string | null,
): Promise<string | null> {
  const existingConv = await prisma.igConversation.findUnique({ where: { igsid } });
  if (existingConv && text) {
    const sending = await prisma.igMessage.findFirst({
      where: { conversationId: existingConv.id, status: 'SENDING', mid: null, text },
      orderBy: { createdAt: 'desc' },
    });
    if (sending) {
      await prisma.igMessage.updateMany({ where: { id: sending.id, mid: null }, data: { mid } });
      return existingConv.id;
    }
  }

  // A private reply to a comment shows up as the first message of a DM thread.
  const privateReply = text
    ? await prisma.igComment.findFirst({
        where: {
          fromIgId: igsid,
          privateReply: text,
          commentedAt: { gte: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { updatedAt: 'desc' },
      })
    : null;

  const conv = existingConv ?? (await upsertConversation(igsid, token));
  const preview = previewOf(text, attachments as unknown as Prisma.JsonValue);
  try {
    await prisma.igMessage.create({
      data: {
        conversationId: conv.id,
        direction: 'OUTBOUND',
        author: privateReply ? (privateReply.repliedById ? 'USER' : 'AI') : 'INSTAGRAM_APP',
        sentById: privateReply?.repliedById ?? null,
        status: 'SENT',
        mid,
        text,
        attachments: attachments as unknown as Prisma.InputJsonValue,
        createdAt: at,
        sentAt: at,
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) return null;
    throw err;
  }
  const newest = !conv.lastMessageAt || conv.lastMessageAt <= at;
  if (privateReply) {
    await prisma.igConversation.update({
      where: { id: conv.id },
      data: newest ? { lastMessageAt: at, lastMessagePreview: preview } : {},
    });
    return conv.id;
  }

  // A person answered from the phone: pause the AI and drop any pending AI draft/timer.
  cancelDmAutoReply(conv.id);
  await prisma.$transaction([
    prisma.igMessage.updateMany({
      where: { conversationId: conv.id, status: 'DRAFT' },
      data: { status: 'DISCARDED' },
    }),
    prisma.igConversation.update({
      where: { id: conv.id },
      data: {
        aiEnabled: false,
        aiPausedReason: 'You replied from the Instagram app',
        needsAttention: false,
        ...(newest ? { lastMessageAt: at, lastMessagePreview: preview } : {}),
      },
    }),
  ]);
  await logIgActivity({
    type: 'INSTAGRAM_MESSAGE_SENT',
    leadId: conv.leadId,
    description: `Replied from the Instagram app to ${handleOf(conv)}: ${quote(text) || `[${preview.replace(/[[\]]/g, '')}]`}`,
    metadata: { conversationId: conv.id, mid },
  });
  return conv.id;
}

// ─── Comments ────────────────────────────────────────────────────────────────

const mediaCache = new Map<
  string,
  { permalink: string | null; caption: string | null; thumbnailUrl: string | null }
>();

async function mediaInfo(mediaId: string, token: string | null) {
  const cached = mediaCache.get(mediaId);
  if (cached) return cached;
  const known = await prisma.igComment.findFirst({
    where: { mediaId, mediaPermalink: { not: null } },
    select: { mediaPermalink: true, mediaCaption: true, mediaThumbnail: true },
  });
  if (known) {
    const info = {
      permalink: known.mediaPermalink,
      caption: known.mediaCaption,
      thumbnailUrl: known.mediaThumbnail,
    };
    mediaCache.set(mediaId, info);
    return info;
  }
  if (!token) return { permalink: null, caption: null, thumbnailUrl: null };
  try {
    const info = await getAdapter().getMedia(token, mediaId);
    if (mediaCache.size > 500) mediaCache.clear();
    mediaCache.set(mediaId, info);
    return info;
  } catch (err) {
    logger.warn({ err, mediaId }, 'Instagram media lookup failed');
    return { permalink: null, caption: null, thumbnailUrl: null };
  }
}

/** Handles one `changes[]` item with field "comments". Returns the IgComment id if stored. */
export async function handleCommentChange(
  value: CommentValue,
  entryTime?: number,
): Promise<string | null> {
  const commentId = value.id;
  const fromId = value.from?.id;
  const mediaId = value.media?.id;
  if (!commentId || !fromId || !mediaId || typeof value.text !== 'string') return null;

  const account = await getAccount();
  if (!account) return null;
  const username = value.from?.username ?? null;
  if (fromId === account.igUserId || (username && username === account.username)) return null; // our own comment
  if (await prisma.igComment.findUnique({ where: { commentId }, select: { id: true } }))
    return null;

  const token = await tokenOrNull();
  const media = await mediaInfo(mediaId, token);
  let comment;
  try {
    comment = await prisma.igComment.create({
      data: {
        commentId,
        parentCommentId: value.parent_id ?? null,
        mediaId,
        mediaPermalink: media.permalink,
        mediaCaption: media.caption,
        mediaThumbnail: media.thumbnailUrl,
        fromIgId: fromId,
        fromUsername: username,
        text: value.text,
        commentedAt: toDate(entryTime),
        leadId: await existingLeadFor(fromId),
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) return null;
    throw err;
  }

  const settings = await getAutoReplySettings();
  let leadId = comment.leadId;
  if (settings.createLeads && !leadId) {
    const conv = await prisma.igConversation.findUnique({ where: { igsid: fromId } });
    leadId = await ensureLeadFor({ igsid: fromId, username, name: conv?.name ?? null });
  }
  const who = handleOf({ username });
  await logIgActivity({
    type: 'INSTAGRAM_COMMENT_RECEIVED',
    leadId,
    description: `Instagram comment from ${who}: ${quote(value.text)}`,
    metadata: { commentId: comment.id, mediaId, permalink: media.permalink },
  });
  await notifyAdmins(
    {
      type: 'INSTAGRAM_COMMENT',
      title: `New Instagram comment from ${who}`,
      body: value.text.slice(0, 300),
      entityType: 'ig_comment',
      entityId: null,
    },
    { collapse: true },
  );
  await scheduleCommentAutoReply(comment.id);
  return comment.id;
}
