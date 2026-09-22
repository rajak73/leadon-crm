import { beforeAll, describe, expect, it } from 'vitest';
import { api, createMember, flush, prisma, setupAdmin, testApp, type Session } from './helpers.js';

const app = testApp();
let admin: Session;
let member: Session;
let pipeline: {
  id: string;
  stages: Array<{ id: string; name: string; isWon: boolean; isLost: boolean }>;
};

const stageId = (name: string) => pipeline.stages.find((s) => s.name === name)!.id;

beforeAll(async () => {
  admin = await setupAdmin(app);
  member = await createMember(app, admin, 'Dev');
  pipeline = (await api(app, admin).get('/pipelines').expect(200)).body.data[0];
});

describe('pipelines', () => {
  it('validates stages', async () => {
    const twoWon = await api(app, admin)
      .post('/pipelines', {
        name: 'Bad',
        stages: [
          { name: 'A' },
          { name: 'W1', isWon: true },
          { name: 'W2', isWon: true },
          { name: 'L', isLost: true },
        ],
      })
      .expect(422);
    expect(twoWon.body.error.details.stages).toContain('Mark exactly one stage as Won');
    await api(app, admin)
      .post('/pipelines', {
        name: 'Short',
        stages: [
          { name: 'W', isWon: true },
          { name: 'L', isLost: true },
        ],
      })
      .expect(422);
  });

  it('creates a pipeline, makes it default, and lists the default first', async () => {
    const res = await api(app, admin)
      .post('/pipelines', {
        name: 'Projects',
        isDefault: true,
        stages: [
          { name: 'Brief', color: '#112233' },
          { name: 'Done', isWon: true },
          { name: 'Dropped', isLost: true },
        ],
      })
      .expect(201);
    expect(res.body.data).toMatchObject({ name: 'Projects', isDefault: true });
    expect(res.body.data.stages.map((s: { order: number }) => s.order)).toEqual([0, 1, 2]);
    const list = (await api(app, admin).get('/pipelines').expect(200)).body.data;
    expect(list.map((p: { name: string }) => p.name)).toEqual(['Projects', 'Sales pipeline']);
    // The default pipeline can't be deleted; restore the original default.
    await api(app, admin).delete(`/pipelines/${res.body.data.id}`).expect(409);
    await api(app, admin).patch(`/pipelines/${pipeline.id}`, { isDefault: true }).expect(200);
    await api(app, admin).delete(`/pipelines/${res.body.data.id}`).expect(200);
    await api(app, admin).delete(`/pipelines/${pipeline.id}`).expect(409);
  });

  it('refuses to remove a stage that still has deals, naming the stage', async () => {
    await api(app, admin)
      .post('/deals', { title: 'Blocker', pipelineId: pipeline.id, stageId: stageId('Proposal') })
      .expect(201);
    const withoutProposal = pipeline.stages
      .filter((s) => s.name !== 'Proposal')
      .map(({ id, name, isWon, isLost }) => ({ id, name, isWon, isLost }));
    const res = await api(app, admin)
      .patch(`/pipelines/${pipeline.id}`, { stages: withoutProposal })
      .expect(409);
    expect(res.body.error.message).toContain('"Proposal"');

    // Renaming, reordering and adding stages works.
    const reordered = [
      ...withoutProposal.slice(0, 2),
      { id: stageId('Proposal'), name: 'Quote sent', isWon: false, isLost: false },
      { name: 'Legal review', isWon: false, isLost: false },
      ...withoutProposal.slice(2),
    ];
    const ok = await api(app, admin)
      .patch(`/pipelines/${pipeline.id}`, { name: 'Sales', stages: reordered })
      .expect(200);
    expect(ok.body.data.stages.map((s: { name: string }) => s.name)).toEqual([
      'New',
      'Contacted',
      'Quote sent',
      'Legal review',
      'Negotiation',
      'Won',
      'Lost',
    ]);
    const quote = ok.body.data.stages.find((s: { name: string }) => s.name === 'Quote sent');
    expect(quote).toMatchObject({ dealCount: 1 });
    pipeline = ok.body.data;
  });

  it('rejects stages from another pipeline', async () => {
    const other = await api(app, admin)
      .post('/pipelines', {
        name: 'Other',
        stages: [{ name: 'A' }, { name: 'W', isWon: true }, { name: 'L', isLost: true }],
      })
      .expect(201);
    const foreign = other.body.data.stages.map(
      ({ id, name, isWon, isLost }: Record<string, unknown>) => ({ id, name, isWon, isLost }),
    );
    await api(app, admin).patch(`/pipelines/${pipeline.id}`, { stages: foreign }).expect(422);
  });
});

describe('deals', () => {
  it('requires the stage to belong to the pipeline', async () => {
    const other = (await api(app, admin).get('/pipelines').expect(200)).body.data.find(
      (p: { name: string }) => p.name === 'Other',
    );
    const res = await api(app, admin)
      .post('/deals', { title: 'X', pipelineId: pipeline.id, stageId: other.stages[0].id })
      .expect(422);
    expect(res.body.error.details.stageId).toBeDefined();
  });

  it('sets the status when created directly in a won stage and uses the default currency', async () => {
    const res = await api(app, admin)
      .post('/deals', {
        title: 'Instant win',
        value: '50000',
        pipelineId: pipeline.id,
        stageId: stageId('Won'),
      })
      .expect(201);
    expect(res.body.data).toMatchObject({ status: 'WON', currency: 'INR', value: 50000 });
    expect(res.body.data.closedAt).not.toBeNull();
  });

  it('moves between stages: won, lost with reason, and reopened', async () => {
    const lead = (
      await api(app, admin).post('/leads', { firstName: 'Deal', lastName: 'Lead' }).expect(201)
    ).body.data;
    const deal = (
      await api(app, member)
        .post('/deals', {
          title: 'Kitchen',
          value: 120000,
          pipelineId: pipeline.id,
          stageId: stageId('New'),
          leadId: lead.id,
          assignedToId: admin.userId,
        })
        .expect(201)
    ).body.data;
    expect(deal).toMatchObject({
      status: 'OPEN',
      lead: { id: lead.id, firstName: 'Deal' },
      assignedTo: { id: admin.userId },
    });

    const moved = await api(app, member)
      .post(`/deals/${deal.id}/move`, { stageId: stageId('Negotiation') })
      .expect(200);
    expect(moved.body.data).toMatchObject({
      status: 'OPEN',
      stage: { name: 'Negotiation' },
      closedAt: null,
    });

    const won = await api(app, member)
      .post(`/deals/${deal.id}/move`, { stageId: stageId('Won') })
      .expect(200);
    expect(won.body.data.status).toBe('WON');
    expect(won.body.data.closedAt).not.toBeNull();

    const lost = await api(app, member)
      .post(`/deals/${deal.id}/move`, {
        stageId: stageId('Lost'),
        lostReason: 'Went with a cheaper vendor',
      })
      .expect(200);
    expect(lost.body.data).toMatchObject({
      status: 'LOST',
      lostReason: 'Went with a cheaper vendor',
    });

    const reopened = await api(app, member)
      .post(`/deals/${deal.id}/move`, { stageId: stageId('Contacted') })
      .expect(200);
    expect(reopened.body.data).toMatchObject({ status: 'OPEN', closedAt: null, lostReason: null });

    const timeline = (
      await api(app, admin).get(`/activities?dealId=${deal.id}`).expect(200)
    ).body.data.map((a: { description: string }) => a.description);
    expect(timeline).toEqual(
      expect.arrayContaining([
        'Deal moved from New to Negotiation',
        'Deal "Kitchen" won',
        'Deal "Kitchen" lost — Went with a cheaper vendor',
        'Deal "Kitchen" reopened',
      ]),
    );
    // Deal activity also shows on the linked lead's timeline.
    const leadTimeline = (await api(app, admin).get(`/activities?leadId=${lead.id}`).expect(200))
      .body.data;
    expect(leadTimeline.some((a: { type: string }) => a.type === 'DEAL_WON')).toBe(true);

    await flush();
    const n = await prisma.notification.findFirst({
      where: { userId: admin.userId, type: 'DEAL_ASSIGNED' },
    });
    expect(n?.title).toContain('Kitchen');

    await api(app, admin)
      .post(`/deals/${deal.id}/move`, { stageId: crypto.randomUUID() })
      .expect(422);
  });

  it('shows open and recently closed deals on the board, and filters the list', async () => {
    const board = await api(app, admin).get(`/pipelines/${pipeline.id}/board`).expect(200);
    expect(board.body.data.pipeline.id).toBe(pipeline.id);
    expect(board.body.data.deals.length).toBeGreaterThanOrEqual(3);
    const won = await api(app, admin)
      .get(`/deals?status=WON&pipelineId=${pipeline.id}`)
      .expect(200);
    expect(won.body.data.map((d: { title: string }) => d.title)).toEqual(['Instant win']);
    const search = await api(app, admin).get('/deals?search=kitch').expect(200);
    expect(search.body.meta.total).toBe(1);
  });

  it('updates and soft-deletes a deal', async () => {
    const deal = (
      await api(app, admin)
        .post('/deals', { title: 'Temp', pipelineId: pipeline.id, stageId: stageId('New') })
        .expect(201)
    ).body.data;
    const res = await api(app, admin)
      .patch(`/deals/${deal.id}`, { value: 999, expectedCloseDate: '2030-01-15' })
      .expect(200);
    expect(res.body.data).toMatchObject({
      value: 999,
      expectedCloseDate: '2030-01-15T00:00:00.000Z',
    });
    await api(app, admin).delete(`/deals/${deal.id}`).expect(200);
    await api(app, admin).get(`/deals/${deal.id}`).expect(404);
  });
});
