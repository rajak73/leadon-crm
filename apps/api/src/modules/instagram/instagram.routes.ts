import { Router } from 'express';
import {
  commentListQuerySchema,
  commentReplySchema,
  connectInstagramSchema,
  conversationListQuerySchema,
  draftActionSchema,
  sendMessageSchema,
  simulateInstagramSchema,
  testAutoReplySchema,
  updateAutoReplySettingsSchema,
  updateConversationSchema,
} from '@leados/shared';
import { env } from '../../config/env.js';
import { actor, requireAdmin } from '../../lib/auth.js';
import { AppError } from '../../lib/errors.js';
import { ErrorCode } from '@leados/shared';
import { body, idParam, ok, query } from '../../lib/http.js';
import { getAutoReplySettingsDto, updateAutoReplySettings } from './autoreply.settings.js';
import { connectInstagram, disconnectInstagram, getInstagramStatus } from './instagram.account.js';
import {
  createLeadForConversation,
  discardCommentDraft,
  draftAction,
  getConversationDetail,
  inboxCounts,
  listCommentPosts,
  listComments,
  listConversations,
  replyToCommentManually,
  sendManualMessage,
  simulateInstagram,
  skipComment,
  suggestCommentReply,
  suggestReply,
  testAutoReply,
  updateConversation,
} from './instagram.inbox.js';

export const instagramRouter = Router();

instagramRouter.get('/status', async (_req, res) => ok(res, await getInstagramStatus()));

instagramRouter.post('/connect', requireAdmin, async (req, res) =>
  ok(res, await connectInstagram(body(connectInstagramSchema, req))),
);

instagramRouter.post('/disconnect', requireAdmin, async (_req, res) =>
  ok(res, await disconnectInstagram()),
);

instagramRouter.post('/simulate', requireAdmin, async (req, res) => {
  if (!env.INSTAGRAM_TEST_MODE)
    throw new AppError(ErrorCode.NOT_FOUND, "We couldn't find what you were looking for.");
  ok(res, await simulateInstagram(body(simulateInstagramSchema, req)));
});

instagramRouter.get('/counts', async (_req, res) => ok(res, await inboxCounts()));

instagramRouter.get('/conversations', async (req, res) => {
  const { data, meta } = await listConversations(query(conversationListQuerySchema, req));
  ok(res, data, meta);
});

instagramRouter.get('/conversations/:id', async (req, res) =>
  ok(res, await getConversationDetail(idParam(req, 'conversation'))),
);

instagramRouter.patch('/conversations/:id', async (req, res) =>
  ok(
    res,
    await updateConversation(
      actor(req),
      idParam(req, 'conversation'),
      body(updateConversationSchema, req),
    ),
  ),
);

instagramRouter.post('/conversations/:id/messages', async (req, res) =>
  ok(
    res,
    await sendManualMessage(actor(req), idParam(req, 'conversation'), body(sendMessageSchema, req)),
  ),
);

instagramRouter.post('/conversations/:id/suggest', async (req, res) =>
  ok(res, await suggestReply(idParam(req, 'conversation'))),
);

instagramRouter.post('/conversations/:id/lead', async (req, res) =>
  ok(res, await createLeadForConversation(idParam(req, 'conversation'))),
);

instagramRouter.post('/messages/:id/draft', async (req, res) =>
  ok(res, await draftAction(actor(req), idParam(req, 'message'), body(draftActionSchema, req))),
);

instagramRouter.get('/comments/posts', async (_req, res) => ok(res, await listCommentPosts()));

instagramRouter.get('/comments', async (req, res) => {
  const { data, meta } = await listComments(query(commentListQuerySchema, req));
  ok(res, data, meta);
});

instagramRouter.post('/comments/:id/reply', async (req, res) =>
  ok(
    res,
    await replyToCommentManually(
      actor(req),
      idParam(req, 'comment'),
      body(commentReplySchema, req),
    ),
  ),
);

instagramRouter.post('/comments/:id/skip', async (req, res) =>
  ok(res, await skipComment(actor(req), idParam(req, 'comment'))),
);

instagramRouter.post('/comments/:id/discard', async (req, res) =>
  ok(res, await discardCommentDraft(idParam(req, 'comment'))),
);

instagramRouter.post('/comments/:id/suggest', async (req, res) =>
  ok(res, await suggestCommentReply(idParam(req, 'comment'))),
);

export const autoReplyRouter = Router();

autoReplyRouter.get('/settings', async (_req, res) => ok(res, await getAutoReplySettingsDto()));

autoReplyRouter.patch('/settings', requireAdmin, async (req, res) =>
  ok(res, await updateAutoReplySettings(body(updateAutoReplySettingsSchema, req))),
);

autoReplyRouter.post('/test', async (req, res) =>
  ok(res, await testAutoReply(body(testAutoReplySchema, req))),
);
