import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/config/env.js';
import { decryptSecret } from '../src/lib/crypto.js';
import { GraphError, sandboxAdapter } from '../src/modules/instagram/instagram.adapter.js';
import { refreshTokenIfNeeded, simulatedIgsid } from '../src/modules/instagram/index.js';
import { connectFromEnv } from '../src/modules/instagram/instagram.account.js';
import { api, createMember, flush, prisma, setupAdmin, testApp, type Session } from './helpers.js';
import {
  OUR_ID,
  commentPayload,
  connectTestAccount,
  deliver,
  dmPayload,
  instagramTestEnv,
  sign,
} from './instagram-helpers.js';

const app = testApp();
let admin: Session;
let member: Session;

beforeAll(async () => {
  instagramTestEnv();
  admin = await setupAdmin(app);
  member = await createMember(app, admin, 'Sales');
  await api(app, admin).patch('/settings', { aiScoringAuto: false }).expect(200);
  await connectTestAccount(app, admin);
});

beforeEach(() => instagramTestEnv());
afterEach(async () => {
  vi.restoreAllMocks();
  await flush();
});

const conversationFor = (igsid: string) =>
  prisma.igConversation.findUniqueOrThrow({ where: { igsid } });

describe('webhook endpoint', () => {
  it('answers Meta verification only with the right token', async () => {
    const ok = await request(app)
      .get('/api/webhooks/instagram')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-me', 'hub.challenge': '12345' })
      .expect(200);
    expect(ok.text).toBe('12345');
    expect(ok.headers['content-type']).toMatch(/text\/plain/);
    await request(app)
      .get('/api/webhooks/instagram')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': '1' })
      .expect(403);
  });

  it('shows the callback URL and verify token in the status', async () => {
    const status = (await api(app, member).get('/instagram/status').expect(200)).body.data;
    expect(status).toMatchObject({
      connected: true,
      testMode: true,
      appSecretConfigured: true,
      account: { username: 'leados_test', status: 'ACTIVE', igUserId: OUR_ID },
      webhook: {
        callbackUrl: 'http://localhost:5173/api/webhooks/instagram',
        verifyToken: 'verify-me',
        isPublicUrl: false,
      },
    });
    expect(JSON.stringify(status)).not.toContain('IGAA-test-token');
  });

  it('checks the HMAC signature of the raw body', async () => {
    const raw = JSON.stringify(dmPayload('100', 'hello'));
    const post = () =>
      request(app).post('/api/webhooks/instagram').set('content-type', 'application/json');
    await post().send(raw).expect(401); // missing
    await post().set('x-hub-signature-256', sign(raw, 'other-secret')).send(raw).expect(401);
    // Re-serialised JSON (different bytes) must not verify either.
    await post()
      .set('x-hub-signature-256', sign(raw))
      .send(JSON.stringify(JSON.parse(raw), null, 2))
      .expect(401);
    const res = await post().set('x-hub-signature-256', sign(raw)).send(raw).expect(200);
    expect(res.text).toBe('EVENT_RECEIVED');
    await flush();
    expect(await prisma.igConversation.count({ where: { igsid: '100' } })).toBe(1);
  });

  it('accepts unsigned requests only in test mode without an app secret', async () => {
    env.META_APP_SECRET = undefined;
    const raw = JSON.stringify(dmPayload('101', 'unsigned'));
    const post = () =>
      request(app).post('/api/webhooks/instagram').set('content-type', 'application/json');
    await post().send(raw).expect(200);
    env.INSTAGRAM_TEST_MODE = false;
    await post().send(raw).expect(401);
  });
});

describe('incoming DMs', () => {
  it('creates a conversation, a lead, a timeline entry and a notification', async () => {
    sandboxAdapter.registerProfile('200', { username: 'asha.designs', name: 'Asha Rao' });
    await deliver(app, dmPayload('200', 'Hi, price kya hai for a 2BHK modular kitchen?'));

    const conv = await conversationFor('200');
    expect(conv).toMatchObject({
      username: 'asha.designs',
      name: 'Asha Rao',
      unreadCount: 1,
      aiEnabled: true,
      lastMessagePreview: 'Hi, price kya hai for a 2BHK modular kitchen?',
    });
    expect(conv.lastInboundAt).not.toBeNull();

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: conv.leadId! } });
    expect(lead).toMatchObject({
      firstName: 'Asha Rao',
      source: 'INSTAGRAM',
      createdById: admin.userId,
    });
    expect(lead.tags).toEqual(['instagram']);

    const timeline = (await api(app, member).get(`/activities?leadId=${lead.id}`).expect(200)).body
      .data;
    expect(timeline.map((a: { type: string }) => a.type)).toEqual(
      expect.arrayContaining(['LEAD_CREATED', 'INSTAGRAM_MESSAGE_RECEIVED']),
    );
    expect(
      timeline.find((a: { type: string }) => a.type === 'INSTAGRAM_MESSAGE_RECEIVED').description,
    ).toBe('Instagram message from @asha.designs: “Hi, price kya hai for a 2BHK modular kitchen?”');

    const notes = await prisma.notification.findMany({
      where: { type: 'INSTAGRAM_MESSAGE', entityId: conv.id },
    });
    expect(notes.map((n) => n.userId)).toEqual([admin.userId]); // admins only
    expect(notes[0]).toMatchObject({
      title: 'New Instagram message from @asha.designs',
      entityType: 'ig_conversation',
    });

    // A second message: same lead, one collapsed notification, unread count grows.
    await deliver(app, dmPayload('200', 'Also wardrobes?'));
    expect((await conversationFor('200')).unreadCount).toBe(2);
    expect(await prisma.lead.count({ where: { source: 'INSTAGRAM', firstName: 'Asha Rao' } })).toBe(
      1,
    );
    const collapsed = await prisma.notification.findMany({
      where: { type: 'INSTAGRAM_MESSAGE', entityId: conv.id },
    });
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]!.body).toBe('Also wardrobes?');
  });

  it('serialises the conversation for the inbox', async () => {
    const conv = await conversationFor('200');
    const list = (await api(app, member).get('/instagram/conversations?search=asha').expect(200))
      .body;
    expect(list.meta.total).toBe(1);
    expect(list.data[0]).toMatchObject({
      id: conv.id,
      igsid: '200',
      username: 'asha.designs',
      lead: { firstName: 'Asha Rao', status: 'NEW' },
      hasDraft: false,
      canReply: true,
      unreadCount: 2,
    });
    expect(Date.parse(list.data[0].replyWindowEndsAt)).toBeGreaterThan(Date.now());

    const detail = (await api(app, member).get(`/instagram/conversations/${conv.id}`).expect(200))
      .body.data;
    expect(detail.messages.map((m: { text: string }) => m.text)).toEqual([
      'Hi, price kya hai for a 2BHK modular kitchen?',
      'Also wardrobes?',
    ]);
    expect(detail.messages[0]).toMatchObject({
      direction: 'INBOUND',
      author: 'CUSTOMER',
      status: 'RECEIVED',
      sentBy: null,
      attachments: [],
    });

    expect((await api(app, member).get('/instagram/counts').expect(200)).body.data).toMatchObject({
      unreadConversations: expect.any(Number),
    });
    const read = await api(app, member)
      .patch(`/instagram/conversations/${conv.id}`, { markRead: true })
      .expect(200);
    expect(read.body.data.unreadCount).toBe(0);
  });

  it('ignores duplicate deliveries of the same message id', async () => {
    const payload = dmPayload('300', 'duplicate me', { mid: 'mid_dupe_1' });
    await deliver(app, payload);
    await deliver(app, payload);
    const conv = await conversationFor('300');
    expect(await prisma.igMessage.count({ where: { conversationId: conv.id } })).toBe(1);
    expect(conv.unreadCount).toBe(1);
  });

  it('ignores read receipts, deleted messages and events from our own account', async () => {
    const before = await prisma.igMessage.count();
    const lastRead = {
      object: 'instagram',
      entry: [
        {
          id: OUR_ID,
          time: Date.now(),
          messaging: [
            { sender: { id: '300' }, recipient: { id: OUR_ID }, read: { mid: 'mid_dupe_1' } },
            {
              sender: { id: '300' },
              recipient: { id: OUR_ID },
              message: { mid: 'mid_deleted', is_deleted: true },
            },
          ],
        },
      ],
    };
    await deliver(app, lastRead);
    expect(await prisma.igMessage.count()).toBe(before);
    const msg = await prisma.igMessage.findUniqueOrThrow({ where: { mid: 'mid_dupe_1' } });
    expect(msg.status).toBe('RECEIVED'); // a read receipt never touches messages
  });

  it('stores echoes from the Instagram app as ours and pauses the AI', async () => {
    await deliver(app, dmPayload('400', 'Is the showroom open on Sunday?'));
    await deliver(app, dmPayload('400', 'Yes, 11 to 6!', { echo: true, mid: 'mid_from_phone' }));
    const conv = await conversationFor('400');
    expect(conv).toMatchObject({
      aiEnabled: false,
      aiPausedReason: 'You replied from the Instagram app',
      lastMessagePreview: 'Yes, 11 to 6!',
    });
    const echo = await prisma.igMessage.findUniqueOrThrow({ where: { mid: 'mid_from_phone' } });
    expect(echo).toMatchObject({ direction: 'OUTBOUND', author: 'INSTAGRAM_APP', status: 'SENT' });

    // Turning AI back on clears the reason.
    const res = await api(app, member)
      .patch(`/instagram/conversations/${conv.id}`, { aiEnabled: true })
      .expect(200);
    expect(res.body.data).toMatchObject({ aiEnabled: true, aiPausedReason: null });
  });

  it('does not pause the AI for echoes of messages we sent through the API', async () => {
    await deliver(app, dmPayload('410', 'Hello there'));
    const conv = await conversationFor('410');
    const sent = await api(app, member)
      .post(`/instagram/conversations/${conv.id}/messages`, { text: 'Hi! How can we help?' })
      .expect(200);
    const mid = (await prisma.igMessage.findUniqueOrThrow({ where: { id: sent.body.data.id } }))
      .mid!;
    await deliver(app, dmPayload('410', 'Hi! How can we help?', { echo: true, mid }));
    expect((await conversationFor('410')).aiEnabled).toBe(true);
    expect(await prisma.igMessage.count({ where: { conversationId: conv.id } })).toBe(2);
  });
});

describe('sending', () => {
  it('sends a manual reply, discarding any draft and clearing attention', async () => {
    await deliver(app, dmPayload('500', 'Do you do false ceilings?'));
    const conv = await conversationFor('500');
    await prisma.igMessage.create({
      data: {
        conversationId: conv.id,
        direction: 'OUTBOUND',
        author: 'AI',
        status: 'DRAFT',
        text: 'old draft',
      },
    });
    await prisma.igConversation.update({ where: { id: conv.id }, data: { needsAttention: true } });

    const res = await api(app, member)
      .post(`/instagram/conversations/${conv.id}/messages`, { text: 'Yes we do!' })
      .expect(200);
    expect(res.body.data).toMatchObject({
      direction: 'OUTBOUND',
      author: 'USER',
      status: 'SENT',
      text: 'Yes we do!',
      sentBy: { id: member.userId, firstName: 'Sales' },
      error: null,
    });
    expect(res.body.data.sentAt).not.toBeNull();
    const after = (await api(app, member).get(`/instagram/conversations/${conv.id}`).expect(200))
      .body.data;
    expect(after).toMatchObject({ needsAttention: false, hasDraft: false });
    expect(after.messages.map((m: { text: string }) => m.text)).toEqual([
      'Do you do false ceilings?',
      'Yes we do!',
    ]);
    const timeline = (await api(app, member).get(`/activities?leadId=${conv.leadId}`).expect(200))
      .body.data;
    expect(timeline[0]).toMatchObject({
      type: 'INSTAGRAM_MESSAGE_SENT',
      performedBy: { id: member.userId },
    });
  });

  it('refuses to send once the 24-hour window has closed', async () => {
    await deliver(app, dmPayload('510', 'old message'));
    const conv = await conversationFor('510');
    await prisma.igConversation.update({
      where: { id: conv.id },
      data: { lastInboundAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    });
    const res = await api(app, member)
      .post(`/instagram/conversations/${conv.id}/messages`, { text: 'Sorry for the delay' })
      .expect(409);
    expect(res.body.error.message).toMatch(/24-hour reply window has closed/);
    const list = (await api(app, member).get('/instagram/conversations').expect(200)).body.data;
    expect(list.find((c: { id: string }) => c.id === conv.id)).toMatchObject({ canReply: false });
  });

  it('marks the message failed and the account expired on a token error', async () => {
    await deliver(app, dmPayload('520', 'hello?'));
    const conv = await conversationFor('520');
    vi.spyOn(sandboxAdapter, 'sendMessage').mockRejectedValueOnce(
      new GraphError('Instagram access has expired.', 'auth', 190),
    );
    const res = await api(app, member)
      .post(`/instagram/conversations/${conv.id}/messages`, { text: 'Hi' })
      .expect(200);
    expect(res.body.data).toMatchObject({
      status: 'FAILED',
      error: 'Instagram access has expired.',
    });
    const status = (await api(app, member).get('/instagram/status').expect(200)).body.data;
    expect(status.account).toMatchObject({ status: 'EXPIRED' });
    expect(status.account.statusMessage).toMatch(/Reconnect/);
    expect(
      await prisma.notification.count({
        where: { type: 'INSTAGRAM_CONNECTION', userId: admin.userId },
      }),
    ).toBe(1);
    // While expired, sends are refused with a friendly message.
    const blocked = await api(app, member)
      .post(`/instagram/conversations/${conv.id}/messages`, { text: 'Hi again' })
      .expect(409);
    expect(blocked.body.error.message).toMatch(/Reconnect/);
    await connectTestAccount(app, admin); // reconnect for the other tests
  });
});

describe('comments', () => {
  it('stores comments with media info, links the DM lead and ignores our own', async () => {
    const convLead = (await conversationFor('200')).leadId;
    await deliver(
      app,
      commentPayload({ id: '200', username: 'asha.designs' }, 'Love this kitchen! Price?', {
        id: 'cmt_1',
      }),
    );
    await deliver(app, commentPayload({ id: OUR_ID, username: 'leados_test' }, 'Thank you!'));
    await deliver(
      app,
      commentPayload({ id: '200', username: 'asha.designs' }, 'dupe', { id: 'cmt_1' }),
    );

    expect(await prisma.igComment.count()).toBe(1);
    const list = (await api(app, member).get('/instagram/comments').expect(200)).body;
    expect(list.data[0]).toMatchObject({
      commentId: 'cmt_1',
      text: 'Love this kitchen! Price?',
      fromUsername: 'asha.designs',
      replyStatus: 'NONE',
      lead: { id: convLead },
      media: {
        id: 'media_1',
        permalink: 'https://www.instagram.com/p/media_1/',
        caption: 'Test post',
      },
      repliedBy: null,
    });
    expect(
      await prisma.notification.count({
        where: { type: 'INSTAGRAM_COMMENT', userId: admin.userId },
      }),
    ).toBe(1);
    const timeline = (await api(app, member).get(`/activities?leadId=${convLead}`).expect(200)).body
      .data;
    expect(timeline[0]).toMatchObject({
      type: 'INSTAGRAM_COMMENT_RECEIVED',
      description: 'Instagram comment from @asha.designs: “Love this kitchen! Price?”',
    });
  });

  it('replies manually (public + private) and skips', async () => {
    const [c] = (await api(app, member).get('/instagram/comments?status=NONE').expect(200)).body
      .data;
    const res = await api(app, member)
      .post(`/instagram/comments/${c.id}/reply`, {
        publicReply: 'Thanks! Sent you a DM 😊',
        privateReply: 'Hi Asha! Our kitchens start at ₹1.5 lakh.',
      })
      .expect(200);
    expect(res.body.data).toMatchObject({
      replyStatus: 'REPLIED',
      publicReply: 'Thanks! Sent you a DM 😊',
      privateReplySent: true,
      repliedBy: { id: member.userId },
    });
    const again = await api(app, member)
      .post(`/instagram/comments/${c.id}/reply`, { privateReply: 'another' })
      .expect(409);
    expect(again.body.error.message).toMatch(/only one/);
    await api(app, member).post(`/instagram/comments/${c.id}/skip`).expect(409);

    await deliver(
      app,
      commentPayload({ id: '700', username: 'spammer' }, 'follow me for followers'),
    );
    const spam = (await api(app, member).get('/instagram/comments?search=spammer').expect(200)).body
      .data[0];
    const skipped = await api(app, member).post(`/instagram/comments/${spam.id}/skip`).expect(200);
    expect(skipped.body.data).toMatchObject({
      replyStatus: 'SKIPPED',
      skipReason: 'Skipped by Sales',
    });
    await api(app, member)
      .post(`/instagram/comments/${spam.id}/reply`, { publicReply: '' })
      .expect(422);
  });
});

describe('test mode tools and settings', () => {
  it('simulates DMs and comments through the real pipeline (admins, test mode only)', async () => {
    await api(app, member)
      .post('/instagram/simulate', { kind: 'dm', username: 'ravi_k', text: 'hello' })
      .expect(403);
    const dm = await api(app, admin)
      .post('/instagram/simulate', { kind: 'dm', username: 'ravi_k', text: 'Kitchen ka rate?' })
      .expect(200);
    const conv = (
      await api(app, admin).get(`/instagram/conversations/${dm.body.data.conversationId}`)
    ).body.data;
    expect(conv).toMatchObject({ igsid: simulatedIgsid('ravi_k'), username: 'ravi_k' });
    expect(conv.lead.firstName).toBe('@ravi_k');

    const cm = await api(app, admin)
      .post('/instagram/simulate', { kind: 'comment', username: 'ravi_k', text: 'Nice!' })
      .expect(200);
    const comment = await prisma.igComment.findUniqueOrThrow({
      where: { id: cm.body.data.commentId },
    });
    expect(comment.leadId).toBe(conv.lead.id); // same person → same lead

    env.INSTAGRAM_TEST_MODE = false;
    await api(app, admin)
      .post('/instagram/simulate', { kind: 'dm', username: 'ravi_k', text: 'hello' })
      .expect(404);
  });

  it('refuses to enable AI replies without an AI key', async () => {
    const s = (await api(app, member).get('/auto-reply/settings').expect(200)).body.data;
    expect(s).toMatchObject({
      dmEnabled: false,
      mode: 'DRAFT',
      replyDelaySeconds: 20,
      aiProvider: 'rules',
      aiModel: null,
    });
    await api(app, member).patch('/auto-reply/settings', { tone: 'x' }).expect(403);
    const res = await api(app, admin)
      .patch('/auto-reply/settings', { dmEnabled: true })
      .expect(409);
    expect(res.body.error.message).toBe(
      'Add a Gemini, Groq or OpenAI API key to turn on AI replies.',
    );
    await api(app, admin)
      .patch('/auto-reply/settings', { businessInfo: 'We make kitchens.', createLeads: false })
      .expect(200);
    const test = await api(app, member)
      .post('/auto-reply/test', { kind: 'dm', text: 'price?' })
      .expect(503);
    expect(test.body.error.code).toBe('AI_UNAVAILABLE');
    const settings = (await api(app, member).get('/settings').expect(200)).body.data;
    expect(settings).toMatchObject({ aiProvider: 'rules', aiModel: null });
    await api(app, admin).patch('/auto-reply/settings', { createLeads: true }).expect(200);
  });

  it('connects with the token encrypted at rest and disconnects keeping the inbox', async () => {
    const row = await prisma.igAccount.findUniqueOrThrow({ where: { id: 1 } });
    expect(row.accessTokenEnc).not.toContain('IGAA');
    expect(decryptSecret(row.accessTokenEnc)).toBe('IGAA-test-token-that-is-long-enough');
    await api(app, member).post('/instagram/disconnect').expect(403);
    const res = await api(app, admin).post('/instagram/disconnect').expect(200);
    expect(res.body.data).toMatchObject({ connected: false, account: null });
    expect(await prisma.igConversation.count()).toBeGreaterThan(0);
    await api(app, admin).post('/instagram/connect', { accessToken: 'short' }).expect(422);
    await connectTestAccount(app, admin);
  });

  it('refreshes the token when it expires within 10 days, and expires it when too late', async () => {
    const DAY = 24 * 60 * 60 * 1000;
    await prisma.igAccount.update({
      where: { id: 1 },
      data: { tokenExpiresAt: new Date(Date.now() + 30 * DAY) },
    });
    expect(await refreshTokenIfNeeded()).toBe(false); // not due yet
    await prisma.igAccount.update({
      where: { id: 1 },
      data: { tokenExpiresAt: new Date(Date.now() + 5 * DAY) },
    });
    expect(await refreshTokenIfNeeded()).toBe(true);
    const refreshed = await prisma.igAccount.findUniqueOrThrow({ where: { id: 1 } });
    expect(refreshed.tokenExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 59 * DAY);

    await prisma.igAccount.update({
      where: { id: 1 },
      data: { tokenExpiresAt: new Date(Date.now() - DAY) },
    });
    expect(await refreshTokenIfNeeded()).toBe(false);
    expect((await prisma.igAccount.findUniqueOrThrow({ where: { id: 1 } })).status).toBe('EXPIRED');
    await connectTestAccount(app, admin);
  });
});

describe('connecting from INSTAGRAM_ACCESS_TOKEN', () => {
  afterEach(() => {
    env.INSTAGRAM_ACCESS_TOKEN = undefined;
    vi.restoreAllMocks();
  });

  it('connects on start-up when no account is connected, then leaves a healthy one alone', async () => {
    await prisma.igAccount.deleteMany({});
    expect(await connectFromEnv()).toBe('skipped'); // no token set

    env.INSTAGRAM_TEST_MODE = false;
    env.INSTAGRAM_ACCESS_TOKEN = 'IGAA-live-token-from-env-0123456789';
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      calls.push(url);
      const body = url.includes('subscribed_apps')
        ? { success: true }
        : { user_id: '17840000000000001', username: 'sharma.interiors', name: 'Sharma Interiors' };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    expect(await connectFromEnv()).toBe('connected');
    expect(calls.some((u) => u.startsWith('https://graph.instagram.com/'))).toBe(true);
    const account = await prisma.igAccount.findUniqueOrThrow({ where: { id: 1 } });
    expect(account).toMatchObject({ username: 'sharma.interiors', status: 'ACTIVE' });
    expect(decryptSecret(account.accessTokenEnc)).toBe('IGAA-live-token-from-env-0123456789');

    const status = await api(app, admin).get('/instagram/status').expect(200);
    expect(status.body.data.managedByServer).toBe(true);

    calls.length = 0;
    expect(await connectFromEnv()).toBe('skipped'); // healthy account: no calls
    expect(calls).toHaveLength(0);

    await prisma.igAccount.update({ where: { id: 1 }, data: { status: 'EXPIRED' } });
    expect(await connectFromEnv()).toBe('connected'); // reconnects a broken one
  });

  it('never auto-connects in test mode', async () => {
    env.INSTAGRAM_TEST_MODE = true;
    env.INSTAGRAM_ACCESS_TOKEN = 'IGAA-live-token-from-env-0123456789';
    expect(await connectFromEnv()).toBe('skipped');
  });
});
