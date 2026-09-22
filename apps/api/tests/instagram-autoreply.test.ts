import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Fake AI provider: the `openai` SDK is mocked; answers depend on which prompt is sent.
const ai = vi.hoisted(() => ({
  create: vi.fn(),
  clients: [] as Array<{ apiKey?: string; baseURL?: string; timeout?: number }>,
}));
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: ai.create } };
    constructor(opts: { apiKey?: string; baseURL?: string; timeout?: number }) {
      ai.clients.push(opts);
    }
  },
}));

import { env } from '../src/config/env.js';
import { idle } from '../src/lib/queue.js';
import { api, flush, prisma, setupAdmin, testApp, type Session } from './helpers.js';
import {
  commentPayload,
  connectTestAccount,
  deliver,
  dmPayload,
  instagramTestEnv,
} from './instagram-helpers.js';

type Body = { model: string; messages: Array<{ role: string; content: string }> };
const json = (payload: object) => ({
  choices: [{ message: { content: JSON.stringify(payload) } }],
});

let dmAnswer: object = {
  reply: 'Hello!',
  handoff: false,
  handoffReason: null,
  email: null,
  phone: null,
};
let commentAnswer: object = {
  skip: false,
  skipReason: null,
  publicReply: 'Thanks!',
  privateReply: null,
};

const kindOf = (body: Body) => {
  const system = body.messages[0]?.content ?? '';
  if (system.includes('Instagram DM assistant')) return 'dm';
  if (system.includes('reply to comments')) return 'comment';
  return 'score';
};
const callsOf = (kind: string) =>
  ai.create.mock.calls.filter(([body]) => kindOf(body as Body) === kind);

const app = testApp();
let admin: Session;

beforeAll(async () => {
  instagramTestEnv();
  admin = await setupAdmin(app);
  await api(app, admin).patch('/settings', { aiScoringAuto: false }).expect(200);
  await connectTestAccount(app, admin);
});

beforeEach(async () => {
  instagramTestEnv();
  env.GEMINI_API_KEY = 'fake-gemini-key';
  ai.create.mockReset();
  ai.create.mockImplementation(async (body: Body) => {
    const kind = kindOf(body);
    if (kind === 'dm') return json(dmAnswer);
    if (kind === 'comment') return json(commentAnswer);
    return json({ score: 50, factors: [], recommendation: 'Follow up.' });
  });
  dmAnswer = { reply: 'Hello!', handoff: false, handoffReason: null, email: null, phone: null };
  commentAnswer = { skip: false, skipReason: null, publicReply: 'Thanks!', privateReply: null };
  await api(app, admin)
    .patch('/auto-reply/settings', {
      dmEnabled: true,
      commentsEnabled: true,
      mode: 'AUTO',
      commentReplyMode: 'PUBLIC',
      replyDelaySeconds: 20,
      maxRepliesPerDay: 20,
      businessInfo: 'Sharma Interiors. Modular kitchens from ₹1.5 lakh. Free site visit.',
      handoffMessage: 'Thanks! Someone from our team will reply shortly.',
      collectContactDetails: true,
    })
    .expect(200);
});

afterEach(async () => {
  await flush();
  vi.restoreAllMocks();
});

const conv = (igsid: string) => prisma.igConversation.findUniqueOrThrow({ where: { igsid } });
const outbound = async (igsid: string) =>
  prisma.igMessage.findMany({
    where: { conversation: { igsid }, direction: 'OUTBOUND' },
    orderBy: { createdAt: 'asc' },
  });

describe('DM auto-reply', () => {
  it('waits for the burst to end and sends one reply (AUTO)', async () => {
    dmAnswer = { reply: 'Kitchens start at ₹1.5 lakh. Free site visit?', handoff: false };
    await deliver(app, dmPayload('1001', 'hi'));
    await deliver(app, dmPayload('1001', 'price kya hai'));
    await deliver(app, dmPayload('1001', 'modular kitchen ka'));
    await idle();
    expect(callsOf('dm')).toHaveLength(0); // debounced: nothing yet
    await flush();

    expect(callsOf('dm')).toHaveLength(1);
    const [body] = callsOf('dm')[0]! as [Body, { timeout: number }];
    expect(body.model).toBe('gemini-2.5-flash');
    expect(body.messages[0]!.content).toContain('Free site visit');
    expect(body.messages[1]!.content).toContain('Customer: modular kitchen ka');
    expect((callsOf('dm')[0]![1] as { timeout: number }).timeout).toBe(20_000);
    expect(ai.clients.at(-1)).toMatchObject({
      apiKey: 'fake-gemini-key',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    });

    const sent = await outbound('1001');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      author: 'AI',
      status: 'SENT',
      text: 'Kitchens start at ₹1.5 lakh. Free site visit?',
      sentById: null,
    });
    expect(sent[0]!.mid).toMatch(/^sandbox_mid_/);
    const c = await conv('1001');
    const timeline = await prisma.activity.findMany({
      where: { relatedLeadId: c.leadId!, type: 'INSTAGRAM_MESSAGE_SENT' },
    });
    expect(timeline[0]!.description).toMatch(/^AI replied on Instagram/);

    // Re-running (e.g. a duplicate timer) never answers the same message twice.
    await flush();
    expect(await outbound('1001')).toHaveLength(1);
  });

  it('stores a single draft in DRAFT mode and lets a person approve or discard it', async () => {
    await api(app, admin).patch('/auto-reply/settings', { mode: 'DRAFT' }).expect(200);
    dmAnswer = { reply: 'First draft', handoff: false };
    await deliver(app, dmPayload('1002', 'hello'));
    await flush();
    dmAnswer = { reply: 'Second draft', handoff: false };
    await deliver(app, dmPayload('1002', 'are you there?'));
    await flush();

    const c = await conv('1002');
    const drafts = await prisma.igMessage.findMany({
      where: { conversationId: c.id, status: 'DRAFT' },
    });
    expect(drafts.map((d) => d.text)).toEqual(['Second draft']);
    const dto = (await api(app, admin).get(`/instagram/conversations/${c.id}`).expect(200)).body
      .data;
    expect(dto).toMatchObject({ needsAttention: true, hasDraft: true });
    expect(
      await prisma.notification.count({ where: { type: 'AI_DRAFT_READY', entityId: c.id } }),
    ).toBe(1);
    const attention = (
      await api(app, admin).get('/instagram/conversations?filter=attention').expect(200)
    ).body.data;
    expect(attention.map((x: { id: string }) => x.id)).toContain(c.id);

    const approved = await api(app, admin)
      .post(`/instagram/messages/${drafts[0]!.id}/draft`, { action: 'send', text: 'Edited reply' })
      .expect(200);
    expect(approved.body.data).toMatchObject({
      status: 'SENT',
      author: 'AI',
      text: 'Edited reply',
      sentBy: { id: admin.userId },
    });
    await api(app, admin)
      .post(`/instagram/messages/${drafts[0]!.id}/draft`, { action: 'discard' })
      .expect(409);
    expect((await conv('1002')).needsAttention).toBe(false);

    dmAnswer = { reply: 'Third draft', handoff: false };
    await deliver(app, dmPayload('1002', 'one more thing'));
    await flush();
    const third = await prisma.igMessage.findFirstOrThrow({
      where: { conversationId: c.id, status: 'DRAFT' },
    });
    const discarded = await api(app, admin)
      .post(`/instagram/messages/${third.id}/draft`, { action: 'discard' })
      .expect(200);
    expect(discarded.body.data.status).toBe('DISCARDED');
  });

  it('hands off to a person: pauses AI, sends the handoff message and notifies', async () => {
    dmAnswer = {
      reply: null,
      handoff: true,
      handoffReason: 'Wants to book a site visit',
      email: 'Priya@Example.com',
      phone: '+91 98765 43210',
    };
    await deliver(
      app,
      dmPayload('1003', 'Book a visit for Saturday. priya@example.com, 9876543210'),
    );
    await flush();
    const c = await conv('1003');
    expect(c).toMatchObject({
      aiEnabled: false,
      aiPausedReason: 'Wants to book a site visit',
      needsAttention: true,
    });
    expect((await outbound('1003')).map((m) => [m.author, m.status, m.text])).toEqual([
      ['AI', 'SENT', 'Thanks! Someone from our team will reply shortly.'],
    ]);
    expect(await prisma.notification.count({ where: { type: 'AI_HANDOFF', entityId: c.id } })).toBe(
      1,
    );
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: c.leadId! } });
    expect(lead).toMatchObject({ email: 'priya@example.com', phone: '+91 98765 43210' });

    // Paused: further messages get no AI reply.
    await deliver(app, dmPayload('1003', 'hello?'));
    await flush();
    expect(callsOf('dm')).toHaveLength(1);
  });

  it('never overwrites contact details the lead already has', async () => {
    await deliver(app, dmPayload('1004', 'hi'));
    await idle();
    const c = await conv('1004');
    await prisma.lead.update({ where: { id: c.leadId! }, data: { email: 'kept@example.com' } });
    dmAnswer = { reply: 'Noted!', handoff: false, email: 'new@example.com', phone: 'not a phone' };
    await flush();
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: c.leadId! } });
    expect(lead).toMatchObject({ email: 'kept@example.com', phone: null });
  });

  it('asks for name and phone, then saves what the customer shares', async () => {
    dmAnswer = {
      reply: 'Kitchens start at ₹1.5 lakh. Aapka naam aur phone number share kar dijiye?',
      handoff: false,
    };
    await deliver(app, dmPayload('1010', 'price kya hai?'));
    await flush();
    const [first] = callsOf('dm')[0]! as [Body];
    expect(first.messages[0]!.content).toContain('Collecting contact details');
    expect(first.messages[1]!.content).toContain('Phone on file: none');

    dmAnswer = {
      reply: 'Thanks Rahul! Hamari team aapko jaldi call karegi.',
      handoff: false,
      name: 'rahul sharma',
      phone: '+91 98765 43210',
    };
    await deliver(app, dmPayload('1010', 'mera naam Rahul Sharma hai, 98765 43210'));
    await flush();
    const c = await conv('1010');
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: c.leadId! } });
    expect(lead).toMatchObject({
      firstName: 'Rahul',
      lastName: 'Sharma',
      phone: '+91 98765 43210',
    });
    const activity = await prisma.activity.findFirst({
      where: { relatedLeadId: lead.id, type: 'LEAD_UPDATED' },
    });
    expect(activity?.description).toBe(
      'Name and phone number added from the Instagram conversation',
    );
  });

  it('keeps a name someone typed by hand and skips the ask when turned off', async () => {
    await api(app, admin)
      .patch('/auto-reply/settings', { collectContactDetails: false })
      .expect(200);
    await deliver(app, dmPayload('1011', 'hi'));
    await idle();
    const c = await conv('1011');
    await prisma.lead.update({
      where: { id: c.leadId! },
      data: { firstName: 'Neha', lastName: 'K' },
    });
    dmAnswer = { reply: 'Hello!', handoff: false, name: 'Someone Else' };
    await flush();
    const [body] = callsOf('dm')[0]! as [Body];
    expect(body.messages[0]!.content).not.toContain('Collecting contact details');
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: c.leadId! } });
    expect(lead).toMatchObject({ firstName: 'Neha', lastName: 'K' });
    const settings = await api(app, admin).get('/auto-reply/settings').expect(200);
    expect(settings.body.data.collectContactDetails).toBe(false);
  });

  it('pauses AI at the daily limit', async () => {
    await api(app, admin).patch('/auto-reply/settings', { maxRepliesPerDay: 1 }).expect(200);
    await deliver(app, dmPayload('1005', 'first'));
    await flush();
    await deliver(app, dmPayload('1005', 'second'));
    await flush();
    expect(callsOf('dm')).toHaveLength(1);
    expect(await conv('1005')).toMatchObject({
      aiEnabled: false,
      aiPausedReason: 'Daily auto-reply limit reached',
      needsAttention: true,
    });
    expect((await outbound('1005')).filter((m) => m.status === 'SENT')).toHaveLength(1);
  });

  it('skips when a person already replied, when AI is paused or when the provider fails', async () => {
    // Person replied from the app before the timer fired.
    await deliver(app, dmPayload('1006', 'hi'));
    await deliver(app, dmPayload('1006', 'Hello from the phone', { echo: true }));
    await flush();
    expect(callsOf('dm')).toHaveLength(0);

    // Provider failure: nothing sent, flagged for attention.
    ai.create.mockRejectedValue(new Error('503 from provider'));
    await deliver(app, dmPayload('1007', 'hi'));
    await flush();
    expect(await outbound('1007')).toHaveLength(0);
    expect((await conv('1007')).needsAttention).toBe(true);

    // Invalid JSON is retried once, then given up.
    ai.create.mockReset();
    ai.create.mockResolvedValue({ choices: [{ message: { content: 'not json' } }] });
    await deliver(app, dmPayload('1008', 'hi'));
    await flush();
    expect(ai.create).toHaveBeenCalledTimes(2);
    expect(await outbound('1008')).toHaveLength(0);
  });

  it('does nothing when DM replies are off', async () => {
    await api(app, admin).patch('/auto-reply/settings', { dmEnabled: false }).expect(200);
    await deliver(app, dmPayload('1009', 'hi'));
    await flush();
    expect(callsOf('dm')).toHaveLength(0);
  });
});

describe('comment auto-reply', () => {
  const comment = (id: string) => prisma.igComment.findUniqueOrThrow({ where: { commentId: id } });

  it('replies publicly (PUBLIC mode) without personal data', async () => {
    commentAnswer = {
      skip: false,
      publicReply: '**Thanks!** Call us at +91 98765 43210 😊',
      privateReply: 'ignored',
    };
    await deliver(
      app,
      commentPayload({ id: '2001', username: 'neha' }, 'Beautiful! Price?', { id: 'cm_pub' }),
    );
    await flush();
    const c = await comment('cm_pub');
    expect(c).toMatchObject({
      replyStatus: 'REPLIED',
      privateReplySent: false,
      privateReply: null,
    });
    expect(c.publicReply).toBe('Thanks! Call us at 😊');
    expect(c.replyCommentId).toMatch(/^sandbox_comment_/);
  });

  it('sends a private reply (PRIVATE) and both (BOTH)', async () => {
    await api(app, admin)
      .patch('/auto-reply/settings', { commentReplyMode: 'PRIVATE' })
      .expect(200);
    commentAnswer = {
      skip: false,
      publicReply: null,
      privateReply: 'Hi! Kitchens start at ₹1.5 lakh.',
    };
    await deliver(
      app,
      commentPayload({ id: '2002', username: 'kiran' }, 'price?', { id: 'cm_priv' }),
    );
    await flush();
    expect(await comment('cm_priv')).toMatchObject({
      replyStatus: 'REPLIED',
      privateReplySent: true,
      publicReply: null,
      replyCommentId: null,
    });

    await api(app, admin).patch('/auto-reply/settings', { commentReplyMode: 'BOTH' }).expect(200);
    commentAnswer = { skip: false, publicReply: 'Sent you a DM!', privateReply: 'Details here.' };
    await deliver(
      app,
      commentPayload({ id: '2003', username: 'meera' }, 'details pls', { id: 'cm_both' }),
    );
    await flush();
    expect(await comment('cm_both')).toMatchObject({
      replyStatus: 'REPLIED',
      privateReplySent: true,
      publicReply: 'Sent you a DM!',
      privateReply: 'Details here.',
    });
  });

  it('skips spam quietly and flags complaints for a person', async () => {
    commentAnswer = { skip: true, skipReason: 'Spam: promotes another account' };
    await deliver(
      app,
      commentPayload({ id: '2004', username: 'bot' }, 'DM for promo', { id: 'cm_spam' }),
    );
    await flush();
    commentAnswer = { skip: true, skipReason: 'Needs a person: complaint about delay' };
    await deliver(
      app,
      commentPayload({ id: '2005', username: 'angry' }, 'Still waiting!', { id: 'cm_cmp' }),
    );
    await flush();
    expect(await comment('cm_spam')).toMatchObject({ replyStatus: 'SKIPPED' });
    const cmp = await comment('cm_cmp');
    expect(cmp).toMatchObject({
      replyStatus: 'SKIPPED',
      skipReason: 'Needs a person: complaint about delay',
    });
    const handoffs = await prisma.notification.findMany({
      where: { type: 'AI_HANDOFF', entityType: 'ig_comment' },
    });
    expect(handoffs.map((n) => n.entityId)).toEqual([cmp.id]);
  });

  it('stores drafts in DRAFT mode and a person approves them', async () => {
    await api(app, admin).patch('/auto-reply/settings', { mode: 'DRAFT' }).expect(200);
    commentAnswer = { skip: false, publicReply: 'Thank you so much!' };
    await deliver(app, commentPayload({ id: '2006', username: 'fan' }, '😍😍', { id: 'cm_draft' }));
    await flush();
    const c = await comment('cm_draft');
    expect(c).toMatchObject({
      replyStatus: 'DRAFT',
      publicReply: 'Thank you so much!',
      replyCommentId: null,
    });
    expect(
      (await api(app, admin).get('/instagram/counts').expect(200)).body.data.commentDrafts,
    ).toBe(1);
    const res = await api(app, admin)
      .post(`/instagram/comments/${c.id}/reply`, { publicReply: 'Thank you! ❤️' })
      .expect(200);
    expect(res.body.data).toMatchObject({
      replyStatus: 'REPLIED',
      publicReply: 'Thank you! ❤️',
      repliedBy: { id: admin.userId },
    });
  });

  it('leaves replies inside an answered thread and our own comments alone', async () => {
    await deliver(
      app,
      commentPayload({ id: '2007', username: 'neha' }, 'Thanks!!', {
        parentId: 'cm_pub',
        id: 'cm_thread',
      }),
    );
    await deliver(
      app,
      commentPayload({ id: '17841400000000001', username: 'leados_test' }, 'our reply'),
    );
    await flush();
    expect(callsOf('comment')).toHaveLength(0);
    expect(await comment('cm_thread')).toMatchObject({ replyStatus: 'NONE' });
  });
});

describe('previews', () => {
  it('tests the auto-reply and suggests replies without storing anything', async () => {
    dmAnswer = { reply: 'Haan ji, kitchen ₹1.5 lakh se start hota hai.', handoff: false };
    const before = await prisma.igMessage.count();
    const res = await api(app, admin)
      .post('/auto-reply/test', { kind: 'dm', text: 'kitchen ka price kya hai?' })
      .expect(200);
    expect(res.body.data).toEqual({
      reply: 'Haan ji, kitchen ₹1.5 lakh se start hota hai.',
      handoff: false,
      handoffReason: null,
      extracted: { name: null, email: null, phone: null },
      provider: 'gemini',
      model: 'gemini-2.5-flash',
    });
    commentAnswer = { skip: false, publicReply: 'Thanks!' };
    const cm = await api(app, admin)
      .post('/auto-reply/test', { kind: 'comment', text: 'wow' })
      .expect(200);
    expect(cm.body.data).toMatchObject({ skip: false, publicReply: 'Thanks!', provider: 'gemini' });

    await api(app, admin).patch('/auto-reply/settings', { dmEnabled: false }).expect(200);
    await deliver(app, dmPayload('3001', 'hello'));
    const c = await conv('3001');
    const suggestion = await api(app, admin)
      .post(`/instagram/conversations/${c.id}/suggest`)
      .expect(200);
    expect(suggestion.body.data.reply).toBe('Haan ji, kitchen ₹1.5 lakh se start hota hai.');
    expect(await prisma.igMessage.count()).toBe(before + 1); // only the inbound message

    ai.create.mockRejectedValue(new Error('down'));
    const failed = await api(app, admin)
      .post(`/instagram/conversations/${c.id}/suggest`)
      .expect(503);
    expect(failed.body.error.code).toBe('AI_UNAVAILABLE');

    const settings = (await api(app, admin).get('/settings').expect(200)).body.data;
    expect(settings).toMatchObject({ aiProvider: 'gemini', aiModel: 'gemini-2.5-flash' });
  });

  it('falls back to the rules scorer when the provider fails', async () => {
    ai.create.mockRejectedValue(new Error('down'));
    const lead = (await api(app, admin).post('/leads', { firstName: 'Fallback' }).expect(201)).body
      .data;
    const score = await api(app, admin).post(`/leads/${lead.id}/score`).expect(200);
    expect(score.body.data.modelVersion).toBe('rules-v1');
    ai.create.mockResolvedValue(json({ score: 77, factors: [], recommendation: 'Call.' }));
    const good = await api(app, admin).post(`/leads/${lead.id}/score`).expect(200);
    expect(good.body.data).toMatchObject({ score: 77, modelVersion: 'gemini-2.5-flash' });
  });
});
