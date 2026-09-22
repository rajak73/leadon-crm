import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { safePost } from '../src/lib/safe-fetch.js';
import { api, createMember, flush, prisma, setupAdmin, testApp, type Session } from './helpers.js';

const app = testApp();
let admin: Session;
let member: Session;
let member2: Session;

beforeAll(async () => {
  admin = await setupAdmin(app);
  member = await createMember(app, admin, 'Asif');
  member2 = await createMember(app, admin, 'Bina');
  await api(app, admin).patch('/settings', { aiScoringAuto: false }).expect(200);
});

beforeEach(async () => {
  await flush();
  await prisma.workflow.deleteMany({});
});

async function workflow(definition: object, name = 'Test workflow') {
  const res = await api(app, admin)
    .post('/workflows', { name, isActive: true, definition })
    .expect(201);
  return res.body.data as { id: string };
}

async function runsOf(id: string) {
  await flush();
  return (await api(app, admin).get(`/workflows/${id}/runs`).expect(200)).body.data as Array<{
    status: string;
    error: string | null;
    actionLogs: Array<{ type: string; status: string; message: string }>;
    triggerEvent: { type: string; entityId: string };
  }>;
}

describe('workflow CRUD', () => {
  it('is admin-only for writes and exposes condition fields', async () => {
    const def = {
      trigger: { type: 'LEAD_CREATED' },
      actions: [{ type: 'add_tag', config: { tag: 'x' } }],
    };
    await api(app, member).post('/workflows', { name: 'Nope', definition: def }).expect(403);
    const wf = await workflow(def);
    const fetched = (await api(app, member).get(`/workflows/${wf.id}`).expect(200)).body.data;
    expect(fetched).toMatchObject({
      triggerType: 'LEAD_CREATED',
      isActive: true,
      runCount: 0,
      lastRunAt: null,
      createdBy: { id: admin.userId },
    });
    await api(app, member).patch(`/workflows/${wf.id}`, { isActive: false }).expect(403);
    await api(app, admin).patch(`/workflows/${wf.id}`, { isActive: false }).expect(200);
    await api(app, admin)
      .post('/workflows', {
        name: 'Bad',
        definition: {
          trigger: { type: 'LEAD_CREATED' },
          actions: [
            { type: 'outbound_webhook', config: { url: 'https://x.io', headers: '{"a":1}' } },
          ],
        },
      })
      .expect(422);

    const meta = (await api(app, member).get('/workflows/meta').expect(200)).body.data;
    expect(meta.fields.LEAD_CREATED.map((f: { key: string }) => f.key)).toContain('aiScore');
    expect(meta.fields.DEAL_WON.find((f: { key: string }) => f.key === 'status').options).toEqual([
      'OPEN',
      'WON',
      'LOST',
    ]);
    await api(app, admin).delete(`/workflows/${wf.id}`).expect(200);
    await api(app, admin).get(`/workflows/${wf.id}`).expect(404);
  });
});

describe('workflow engine', () => {
  it('runs matching workflows only when conditions pass', async () => {
    const wf = await workflow({
      trigger: { type: 'LEAD_CREATED' },
      conditions: [
        { field: 'source', operator: 'IN', value: ['REFERRAL', 'EVENT'] },
        {
          type: 'OR',
          conditions: [
            { field: 'company', operator: 'IS_NOT_EMPTY' },
            { field: 'tags', operator: 'CONTAINS', value: 'vip' },
          ],
        },
      ],
      actions: [
        { type: 'add_tag', config: { tag: 'priority' } },
        {
          type: 'create_task',
          config: { title: 'Call within the hour', dueInHours: 1, priority: 'HIGH' },
        },
        {
          type: 'send_notification',
          config: { recipient: 'all_admins', title: 'Hot referral', body: 'Call now' },
        },
      ],
    });
    const skip = (
      await api(app, member)
        .post('/leads', { firstName: 'Web', source: 'WEBSITE', company: 'X' })
        .expect(201)
    ).body.data;
    const hit = (
      await api(app, member)
        .post('/leads', {
          firstName: 'Ref',
          source: 'REFERRAL',
          tags: ['vip'],
          assignedToId: member.userId,
        })
        .expect(201)
    ).body.data;

    const runs = await runsOf(wf.id);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      status: 'COMPLETED',
      triggerEvent: { type: 'LEAD_CREATED', entityId: hit.id },
    });
    expect(runs[0]!.actionLogs.map((l) => l.status)).toEqual(['SUCCESS', 'SUCCESS', 'SUCCESS']);

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: hit.id } });
    expect(lead.tags).toEqual(['vip', 'priority']);
    const task = await prisma.task.findFirstOrThrow({ where: { relatedLeadId: hit.id } });
    expect(task).toMatchObject({
      title: 'Call within the hour',
      priority: 'HIGH',
      assignedToId: member.userId,
      createdById: admin.userId,
    });
    expect(
      await prisma.notification.count({
        where: { userId: admin.userId, type: 'WORKFLOW', entityId: hit.id },
      }),
    ).toBe(1);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: skip.id } })).tags).toEqual([]);

    const timeline = (await api(app, admin).get(`/activities?leadId=${hit.id}`).expect(200)).body
      .data;
    const tagged = timeline.find(
      (a: { description: string }) => a.description === 'Tag "priority" added',
    );
    expect(tagged.performedBy).toBeNull(); // automation
    const listed = (await api(app, admin).get('/workflows').expect(200)).body.data[0];
    expect(listed.runCount).toBe(1);
    expect(listed.lastRunAt).not.toBeNull();
  });

  it('matches trigger config and runs status/assignment actions', async () => {
    const wf = await workflow({
      trigger: { type: 'LEAD_STATUS_CHANGED', config: { toStatus: 'QUALIFIED' } },
      actions: [
        { type: 'assign_lead', config: { strategy: 'user', userId: member2.userId } },
        { type: 'update_lead_status', config: { status: 'PROPOSAL' } },
        {
          type: 'send_notification',
          config: { recipient: 'record_owner', title: 'Qualified', body: '' },
        },
      ],
    });
    const lead = (await api(app, admin).post('/leads', { firstName: 'Q' }).expect(201)).body.data;
    await api(app, admin).patch(`/leads/${lead.id}`, { status: 'CONTACTED' }).expect(200);
    await api(app, admin).patch(`/leads/${lead.id}`, { status: 'QUALIFIED' }).expect(200);
    const runs = await runsOf(wf.id);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.actionLogs.map((l) => [l.type, l.status])).toEqual([
      ['assign_lead', 'SUCCESS'],
      ['update_lead_status', 'SUCCESS'],
      ['send_notification', 'SUCCESS'],
    ]);
    const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(after).toMatchObject({ status: 'PROPOSAL', assignedToId: member2.userId });
    // Assignment by automation notifies the assignee too.
    expect(
      await prisma.notification.count({
        where: { userId: member2.userId, type: 'LEAD_ASSIGNED', entityId: lead.id },
      }),
    ).toBe(1);
  });

  it('assigns round-robin among active users', async () => {
    await workflow({
      trigger: { type: 'LEAD_CREATED' },
      actions: [{ type: 'assign_lead', config: { strategy: 'round_robin' } }],
    });
    const ids: string[] = [];
    for (let i = 0; i < 4; i++)
      ids.push(
        (
          await api(app, admin)
            .post('/leads', { firstName: `RR${i}` })
            .expect(201)
        ).body.data.id,
      );
    await flush();
    const leads = await prisma.lead.findMany({ where: { id: { in: ids } } });
    const owners = ids.map((id) => leads.find((l) => l.id === id)!.assignedToId);
    // 3 active users (admin + 2 members): each gets one before anyone gets a second.
    expect(new Set(owners.slice(0, 3)).size).toBe(3);
    expect(owners[3]).toBe(owners[0]);
  });

  it('runs deal and task triggers with record_owner resolution', async () => {
    const pipeline = (await api(app, admin).get('/pipelines').expect(200)).body.data[0];
    const won = pipeline.stages.find((s: { isWon: boolean }) => s.isWon);
    const wf = await workflow({
      trigger: { type: 'DEAL_WON' },
      conditions: [{ field: 'value', operator: 'GREATER_THAN', value: 100000 }],
      actions: [
        { type: 'create_task', config: { title: 'Kick-off call', assignTo: 'record_owner' } },
        { type: 'update_lead_status', config: { status: 'NEGOTIATION' } }, // no lead linked → skipped
      ],
    });
    const deal = (
      await api(app, admin)
        .post('/deals', {
          title: 'Big',
          value: 500000,
          pipelineId: pipeline.id,
          stageId: pipeline.stages[0].id,
          assignedToId: member.userId,
        })
        .expect(201)
    ).body.data;
    await api(app, admin).post(`/deals/${deal.id}/move`, { stageId: won.id }).expect(200);
    const runs = await runsOf(wf.id);
    expect(runs[0]!.status).toBe('COMPLETED');
    expect(runs[0]!.actionLogs.map((l) => l.status)).toEqual(['SUCCESS', 'SKIPPED']);
    const task = await prisma.task.findFirstOrThrow({ where: { relatedDealId: deal.id } });
    expect(task.assignedToId).toBe(member.userId);

    const taskWf = await workflow({
      trigger: { type: 'TASK_COMPLETED' },
      actions: [
        {
          type: 'send_notification',
          config: { recipient: admin.userId, title: 'Task done', body: '' },
        },
      ],
    });
    await api(app, member).patch(`/tasks/${task.id}`, { status: 'COMPLETED' }).expect(200);
    expect((await runsOf(taskWf.id))[0]!.status).toBe('COMPLETED');
  });

  it('stops automation loops at depth 3 and records the run as skipped', async () => {
    const a = await workflow(
      {
        trigger: { type: 'LEAD_STATUS_CHANGED', config: { toStatus: 'CONTACTED' } },
        actions: [{ type: 'update_lead_status', config: { status: 'QUALIFIED' } }],
      },
      'A',
    );
    const b = await workflow(
      {
        trigger: { type: 'LEAD_STATUS_CHANGED', config: { toStatus: 'QUALIFIED' } },
        actions: [{ type: 'update_lead_status', config: { status: 'CONTACTED' } }],
      },
      'B',
    );
    const lead = (await api(app, admin).post('/leads', { firstName: 'Loop' }).expect(201)).body
      .data;
    await api(app, admin).patch(`/leads/${lead.id}`, { status: 'CONTACTED' }).expect(200);
    await flush();
    const all = [...(await runsOf(a.id)), ...(await runsOf(b.id))];
    expect(all.filter((r) => r.status === 'COMPLETED')).toHaveLength(3); // depths 0, 1, 2
    const skipped = all.filter((r) => r.status === 'SKIPPED');
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.error).toMatch(/loop/);
  });

  it('rescoring from a workflow triggers LEAD_SCORED workflows', async () => {
    await workflow({
      trigger: { type: 'LEAD_CREATED' },
      actions: [{ type: 'rescore_lead', config: {} }],
    });
    const scored = await workflow({
      trigger: { type: 'LEAD_SCORED', config: { minScore: 0 } },
      actions: [{ type: 'add_tag', config: { tag: 'scored' } }],
    });
    const lead = (
      await api(app, admin)
        .post('/leads', { firstName: 'Score', email: 's@example.com' })
        .expect(201)
    ).body.data;
    await flush();
    const scores = await prisma.aiScore.findMany({ where: { leadId: lead.id } });
    expect(scores).toHaveLength(1);
    expect(scores[0]).toMatchObject({ triggeredBy: 'workflow', modelVersion: 'rules-v1' });
    expect((await runsOf(scored.id))[0]!.status).toBe('COMPLETED');
  });

  it('blocks webhooks to private addresses', async () => {
    const wf = await workflow({
      trigger: { type: 'LEAD_CREATED' },
      actions: [
        {
          type: 'outbound_webhook',
          config: { url: 'https://127.0.0.1/hook', headers: { 'X-Key': 'secret' } },
        },
        { type: 'outbound_webhook', config: { url: 'https://[::1]:8443/hook' } },
        { type: 'add_tag', config: { tag: 'after-webhook' } },
      ],
    });
    await api(app, admin).post('/leads', { firstName: 'Hook' }).expect(201);
    const [run] = await runsOf(wf.id);
    expect(run!.status).toBe('FAILED');
    expect(run!.error).toBe('2 of 3 actions failed');
    expect(run!.actionLogs[0]).toMatchObject({
      status: 'FAILED',
      message: expect.stringMatching(/private or internal/),
    });
    expect(run!.actionLogs[1]).toMatchObject({
      status: 'FAILED',
      message: expect.stringMatching(/private or internal/),
    });
    expect(run!.actionLogs[2]!.status).toBe('SUCCESS'); // later actions still run
  });
});

describe('safePost (SSRF guard)', () => {
  let server: http.Server;
  let port: number;
  const hits: Array<{ path?: string; headers: http.IncomingHttpHeaders; body: string }> = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        hits.push({ path: req.url, headers: req.headers, body });
        if (req.url === '/redirect') {
          res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data' }).end();
        } else res.writeHead(204).end();
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('refuses hostnames that resolve to private ranges', async () => {
    const resolver = async () => [{ address: '10.0.0.5', family: 4 }];
    const r = await safePost('https://internal.example.com/x', {}, { resolver });
    expect(r).toMatchObject({ ok: false, message: expect.stringMatching(/private or internal/) });
    const mixed = await safePost(
      'https://mixed.example.com/x',
      {},
      {
        resolver: async () => [
          { address: '93.184.216.34', family: 4 },
          { address: '::ffff:127.0.0.1', family: 6 },
        ],
      },
    );
    expect(mixed.ok).toBe(false);
  });

  it('connects to the resolved IP and does not follow redirects', async () => {
    // Allow loopback only for this test; the hostname resolves (once) to our local server.
    const opts = {
      resolver: async () => [{ address: '127.0.0.1', family: 4 }],
      isBlocked: () => false,
    };
    const ok = await safePost(
      `http://hooks.example.test:${port}/ok`,
      { hello: 'world' },
      { ...opts, headers: { 'X-Key': 'abc' } },
    );
    expect(ok).toMatchObject({ ok: true, status: 204 });
    expect(hits.at(-1)).toMatchObject({ path: '/ok', body: '{"hello":"world"}' });
    expect(hits.at(-1)!.headers['x-key']).toBe('abc');
    expect(hits.at(-1)!.headers.host).toBe(`hooks.example.test:${port}`);

    const redirected = await safePost(`http://hooks.example.test:${port}/redirect`, {}, opts);
    expect(redirected).toMatchObject({
      ok: false,
      status: 302,
      message: expect.stringMatching(/redirects are not followed/),
    });
    expect(hits).toHaveLength(2); // the redirect target was never requested
  });

  it('times out', async () => {
    const slow = http.createServer(() => {
      /* never responds */
    });
    await new Promise<void>((r) => slow.listen(0, '127.0.0.1', r));
    const p = (slow.address() as AddressInfo).port;
    const r = await safePost(
      `http://127.0.0.1:${p}/`,
      {},
      { isBlocked: () => false, timeoutMs: 200 },
    );
    expect(r).toMatchObject({ ok: false, message: 'Timed out after 0.2 s' });
    slow.closeAllConnections();
    slow.close();
  });
});
