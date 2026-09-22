import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { api, createMember, prisma, setupAdmin, testApp, type Session } from './helpers.js';

const app = testApp();
let admin: Session;
let member: Session;
const DAY = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  admin = await setupAdmin(app);
  member = await createMember(app, admin, 'Top');
  await api(app, admin).patch('/settings', { timezone: 'UTC', aiScoringAuto: false }).expect(200);
});

describe('dashboard analytics', () => {
  beforeAll(async () => {
    const now = Date.now();
    const lead = (d: number, status = 'NEW', source = 'WEBSITE', deleted = false) =>
      prisma.lead.create({
        data: {
          firstName: 'L',
          status,
          source,
          createdById: admin.userId,
          createdAt: new Date(now - d * DAY),
          deletedAt: deleted ? new Date() : null,
        },
      });
    // Current 7-day period: 4 live leads (1 won, 1 lost) + 1 deleted.
    await lead(0, 'NEW');
    await lead(1, 'WON', 'REFERRAL');
    await lead(2, 'LOST');
    await lead(6, 'CONTACTED', 'REFERRAL');
    await lead(3, 'NEW', 'WEBSITE', true);
    // Previous 7-day period: 2 leads, both won.
    await lead(8, 'WON');
    await lead(12, 'WON');

    const pipeline = await prisma.pipeline.findFirstOrThrow({
      include: { stages: { orderBy: { order: 'asc' } } },
    });
    const [first, , , , won] = pipeline.stages;
    const deal = (
      value: number,
      status: string,
      stageId: string,
      closedDaysAgo: number | null,
      extra = {},
    ) =>
      prisma.deal.create({
        data: {
          title: 'D',
          value,
          status,
          stageId,
          pipelineId: pipeline.id,
          createdById: admin.userId,
          currency: 'INR',
          closedAt: closedDaysAgo === null ? null : new Date(now - closedDaysAgo * DAY),
          ...extra,
        },
      });
    await deal(1000, 'OPEN', first!.id, null);
    await deal(500, 'OPEN', first!.id, null, { currency: 'USD' }); // other currency: counted, not valued
    await deal(9999, 'OPEN', first!.id, null, { deletedAt: new Date() }); // deleted: ignored
    await deal(3000, 'WON', won!.id, 2, { assignedToId: member.userId });
    await deal(2000, 'WON', won!.id, 9, { assignedToId: member.userId }); // previous period

    await prisma.task.create({
      data: { title: 'late', dueDate: new Date(now - DAY), createdById: admin.userId },
    });
    await prisma.task.create({ data: { title: 'open', createdById: admin.userId } });
    await prisma.task.create({
      data: { title: 'done', status: 'COMPLETED', createdById: admin.userId },
    });
    await prisma.task.create({
      data: { title: 'deleted', createdById: admin.userId, deletedAt: new Date() },
    });
  });

  it('computes KPIs against the previous period, excluding deleted records', async () => {
    const d = (await api(app, member).get('/analytics/dashboard?range=7d').expect(200)).body.data;
    expect(d.range).toBe('7d');
    expect(d.currency).toBe('INR');
    expect(d.kpis).toEqual({
      newLeads: { value: 4, previous: 2 },
      conversionRate: { value: 0.5, previous: 1 },
      openPipelineValue: { value: 1000 },
      wonValue: { value: 3000, previous: 2000 },
      openTasks: { value: 2, overdue: 1 },
    });
  });

  it('zero-fills leads over time and breaks down by status, source, stage and owner', async () => {
    const d = (await api(app, admin).get('/analytics/dashboard?range=7d').expect(200)).body.data;
    expect(d.leadsOverTime).toHaveLength(7);
    expect(d.leadsOverTime.at(-1).date).toBe(new Date().toISOString().slice(0, 10));
    expect(d.leadsOverTime.reduce((s: number, x: { count: number }) => s + x.count, 0)).toBe(4);
    expect(d.leadsOverTime.filter((x: { count: number }) => x.count === 0)).toHaveLength(3);
    expect(d.leadsByStatus.find((s: { status: string }) => s.status === 'NEW').count).toBe(1);
    expect(d.leadsByStatus).toHaveLength(7);
    expect(d.leadsBySource).toEqual(
      expect.arrayContaining([
        { source: 'WEBSITE', count: 2 },
        { source: 'REFERRAL', count: 2 },
      ]),
    );
    expect(d.pipelineByStage[0]).toMatchObject({ stageName: 'New', count: 2, value: 1000 });
    expect(
      d.pipelineByStage.find((s: { stageName: string }) => s.stageName === 'Won'),
    ).toMatchObject({ count: 1, value: 3000 });
    expect(d.topPerformers).toEqual([
      { user: expect.objectContaining({ id: member.userId }), wonCount: 1, wonValue: 3000 },
    ]);
    const longer = (await api(app, admin).get('/analytics/dashboard?range=30d').expect(200)).body
      .data;
    expect(longer.leadsOverTime).toHaveLength(30);
    expect(longer.kpis.newLeads.value).toBe(6);
    await api(app, admin).get('/analytics/dashboard?range=2d').expect(422);
  });
});

describe('search', () => {
  it('finds leads, contacts and deals', async () => {
    const a = api(app, admin);
    await a
      .post('/leads', { firstName: 'Farhan', lastName: 'Qureshi', email: 'farhan@lenskart.com' })
      .expect(201);
    await a.post('/contacts', { firstName: 'Gurpreet', company: 'Lenskart' }).expect(201);
    const pipeline = (await a.get('/pipelines').expect(200)).body.data[0];
    await a
      .post('/deals', {
        title: 'Lenskart store fit-out',
        pipelineId: pipeline.id,
        stageId: pipeline.stages[0].id,
      })
      .expect(201);
    const deleted = (
      await a.post('/leads', { firstName: 'Lenskart', lastName: 'Ghost' }).expect(201)
    ).body.data;
    await a.delete(`/leads/${deleted.id}`).expect(200);

    const res = (await a.get('/search?q=lenskart').expect(200)).body.data;
    expect(res.leads).toEqual([
      {
        id: expect.any(String),
        name: 'Farhan Qureshi',
        email: 'farhan@lenskart.com',
        status: 'NEW',
      },
    ]);
    expect(res.contacts).toEqual([
      { id: expect.any(String), name: 'Gurpreet', email: null, company: 'Lenskart' },
    ]);
    expect(res.deals).toEqual([
      {
        id: expect.any(String),
        title: 'Lenskart store fit-out',
        value: null,
        currency: 'INR',
        status: 'OPEN',
      },
    ]);
    await a.get('/search?q=').expect(422);
  });
});

describe('contacts', () => {
  it('supports CRUD, search and ownership filters', async () => {
    const a = api(app, admin);
    const c = (
      await a
        .post('/contacts', {
          firstName: 'Harini',
          jobTitle: 'CTO',
          tags: ['board'],
          assignedToId: member.userId,
        })
        .expect(201)
    ).body.data;
    expect(c).toMatchObject({
      jobTitle: 'CTO',
      tags: ['board'],
      assignedTo: { id: member.userId },
    });
    const updated = (await a.patch(`/contacts/${c.id}`, { phone: '+91 80000 00000' }).expect(200))
      .body.data;
    expect(updated.phone).toBe('+91 80000 00000');
    expect(
      (await api(app, member).get('/contacts?assignedToId=me').expect(200)).body.data.map(
        (x: { id: string }) => x.id,
      ),
    ).toEqual([c.id]);
    expect((await a.get('/contacts?tag=board').expect(200)).body.meta.total).toBe(1);
    const timeline = (await a.get(`/activities?contactId=${c.id}`).expect(200)).body.data.map(
      (x: { description: string }) => x.description,
    );
    expect(timeline).toEqual(['Updated phone', 'Contact created']);
    await a.delete(`/contacts/${c.id}`).expect(200);
    await a.get(`/contacts/${c.id}`).expect(404);
  });
});

describe('misc', () => {
  it('serves health without auth and unknown API routes as 404 envelopes', async () => {
    expect((await request(app).get('/api/health').expect(200)).body).toEqual({
      status: 'ok',
      db: 'ok',
    });
    const res = await request(app)
      .get('/api/nope')
      .set('authorization', `Bearer ${admin.token}`)
      .expect(404);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: expect.any(String) },
    });
  });

  it('turns malformed JSON into a friendly validation error', async () => {
    const res = await request(app)
      .post('/api/leads')
      .set('authorization', `Bearer ${admin.token}`)
      .set('content-type', 'application/json')
      .send('{bad')
      .expect(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
