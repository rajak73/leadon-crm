import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const create = vi.hoisted(() => vi.fn());
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

import { env } from '../src/config/env.js';
import { api, createMember, flush, prisma, setupAdmin, testApp, type Session } from './helpers.js';

const app = testApp();
let admin: Session;
let member: Session;

beforeAll(async () => {
  admin = await setupAdmin(app);
  member = await createMember(app, admin, 'Sales');
});

afterEach(() => {
  env.OPENAI_API_KEY = undefined;
  create.mockReset();
});

const aiReply = (payload: object) => ({
  choices: [{ message: { content: JSON.stringify(payload) } }],
});

describe('lead scoring', () => {
  it('uses the rules scorer when no API key is set, without calling OpenAI', async () => {
    const lead = (
      await api(app, admin)
        .post('/leads', { firstName: 'Rules', email: 'r@example.com', source: 'REFERRAL' })
        .expect(201)
    ).body.data;
    const res = await api(app, admin).post(`/leads/${lead.id}/score`).expect(200);
    expect(res.body.data).toMatchObject({
      leadId: lead.id,
      modelVersion: 'rules-v1',
      triggeredBy: 'manual',
      score: 20 + 15 - 5 + 10 + 10,
    }); // email, no phone, referral, active today
    expect(create).not.toHaveBeenCalled();
    const detail = (await api(app, admin).get(`/leads/${lead.id}`).expect(200)).body.data;
    expect(detail.aiScore).toBe(50);
    expect(detail.latestScore.id).toBe(res.body.data.id);
  });

  it('calls OpenAI in JSON mode when a key is set, and clamps the score', async () => {
    env.OPENAI_API_KEY = 'sk-test';
    create.mockResolvedValueOnce(
      aiReply({
        score: 140,
        factors: [{ type: 'POSITIVE', description: 'Asked for pricing' }],
        recommendation: 'Call today.',
      }),
    );
    const lead = (
      await api(app, admin).post('/leads', { firstName: 'Openai', company: 'Razorpay' }).expect(201)
    ).body.data;
    await api(app, admin)
      .post('/notes', { content: 'Asked for pricing for 20 seats', relatedLeadId: lead.id })
      .expect(201);
    const res = await api(app, admin).post(`/leads/${lead.id}/score`).expect(200);
    expect(res.body.data).toMatchObject({
      score: 100,
      modelVersion: 'gpt-4o-mini',
      recommendation: 'Call today.',
      factors: [{ type: 'POSITIVE', description: 'Asked for pricing' }],
    });

    const [body, opts] = create.mock.calls[0]!;
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[0].content).toContain('JSON');
    expect(body.messages[1].content).toContain('Company: Razorpay');
    expect(body.messages[1].content).toContain('Asked for pricing for 20 seats');
    expect(opts.timeout).toBe(20_000);
  });

  it('falls back to the rules scorer when OpenAI fails or returns junk', async () => {
    env.OPENAI_API_KEY = 'sk-test';
    const lead = (await api(app, admin).post('/leads', { firstName: 'Fallback' }).expect(201)).body
      .data;
    create.mockRejectedValueOnce(new Error('timeout'));
    expect(
      (await api(app, admin).post(`/leads/${lead.id}/score`).expect(200)).body.data.modelVersion,
    ).toBe('rules-v1');
    create.mockResolvedValueOnce({ choices: [{ message: { content: 'not json' } }] });
    expect(
      (await api(app, admin).post(`/leads/${lead.id}/score`).expect(200)).body.data.modelVersion,
    ).toBe('rules-v1');
    const history = (await api(app, admin).get(`/leads/${lead.id}/scores`).expect(200)).body.data;
    expect(history).toHaveLength(2);
  });

  it('notifies the assignee the first time a lead becomes hot', async () => {
    env.OPENAI_API_KEY = 'sk-test';
    const lead = (
      await api(app, admin)
        .post('/leads', { firstName: 'Hot', assignedToId: member.userId })
        .expect(201)
    ).body.data;
    create.mockResolvedValue(aiReply({ score: 85, factors: [], recommendation: 'Call now.' }));
    await api(app, admin).post(`/leads/${lead.id}/score`).expect(200);
    await api(app, admin).post(`/leads/${lead.id}/score`).expect(200);
    const n = await prisma.notification.findMany({
      where: { userId: member.userId, type: 'LEAD_SCORED' },
    });
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({
      title: 'Hot is a hot lead (85)',
      body: 'Call now.',
      entityId: lead.id,
    });
    // Scoring shows on the timeline but doesn't count as engagement.
    const timeline = (await api(app, admin).get(`/activities?leadId=${lead.id}`).expect(200)).body
      .data;
    expect(timeline[0]).toMatchObject({
      type: 'LEAD_SCORED',
      description: 'AI score changed from 85 to 85',
      performedBy: null,
    });
  });

  it('rescores automatically (debounced) after create, status change and notes', async () => {
    await flush();
    const lead = (await api(app, member).post('/leads', { firstName: 'Auto' }).expect(201)).body
      .data;
    await api(app, member).patch(`/leads/${lead.id}`, { status: 'CONTACTED' }).expect(200);
    await api(app, member)
      .post('/notes', { content: 'Spoke today', relatedLeadId: lead.id })
      .expect(201);
    expect(await prisma.aiScore.count({ where: { leadId: lead.id } })).toBe(0); // not yet: debounced 10 s
    await flush();
    const scores = await prisma.aiScore.findMany({ where: { leadId: lead.id } });
    expect(scores).toHaveLength(1); // three triggers, one score
    expect(scores[0]!.triggeredBy).toBe('auto');

    await api(app, admin).patch('/settings', { aiScoringAuto: false }).expect(200);
    const manual = (await api(app, member).post('/leads', { firstName: 'Manual only' }).expect(201))
      .body.data;
    await flush();
    expect(await prisma.aiScore.count({ where: { leadId: manual.id } })).toBe(0);
  });

  it('reports the AI provider in settings', async () => {
    expect((await api(app, member).get('/settings').expect(200)).body.data.aiProvider).toBe(
      'rules',
    );
    env.OPENAI_API_KEY = 'sk-test';
    expect((await api(app, member).get('/settings').expect(200)).body.data.aiProvider).toBe(
      'openai',
    );
  });
});

describe('cleanName', () => {
  it('keeps real names in any script and rejects usernames and junk', async () => {
    const { cleanName } = await import('../src/modules/instagram/instagram.ai.js');
    expect(cleanName('rahul sharma')).toBe('Rahul Sharma');
    expect(cleanName('राहुल')).toBe('राहुल');
    expect(cleanName("D'Souza")).toBe("D'Souza");
    expect(cleanName('@rahul_s')).toBeNull();
    expect(cleanName('rahul_123')).toBeNull();
    expect(cleanName('a')).toBeNull();
    expect(cleanName('one two three four five')).toBeNull();
  });
});
