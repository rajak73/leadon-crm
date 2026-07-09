import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import { authenticator } from 'otplib';
import { createApp } from '../src/app.js';
import { prisma } from '../src/prisma.js';
import { uniqueEmail } from './helpers.js';

const app = createApp();

// Shared state across ordered tests.
let token = '';
let orgId = '';
let orgSlug = '';
let ownerEmail = '';

beforeAll(async () => {
  ownerEmail = uniqueEmail('owner');
});

describe('auth & onboarding (BRD §10.2, §21.1)', () => {
  it('rejects a weak password', async () => {
    const res = await request(app).post('/api/v1/auth/signup').send({
      firstName: 'A', lastName: 'B', email: uniqueEmail(), password: 'weak', workspaceName: 'X',
    });
    expect(res.status).toBe(400);
  });

  it('signs up and returns a token + owner org', async () => {
    const res = await request(app).post('/api/v1/auth/signup').send({
      firstName: 'Asha', lastName: 'Rao', email: ownerEmail, password: 'LeadOS@123', workspaceName: 'Test Realty',
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.organizations[0].role).toBe('OWNER');
    token = res.body.token;
    orgId = res.body.organizations[0].organizationId;
    orgSlug = res.body.organizations[0].organizationSlug;
  });

  it('logs in', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: ownerEmail, password: 'LeadOS@123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });
});

describe('tenant isolation (BRD §20)', () => {
  it('allows a member to read their org', async () => {
    const res = await request(app).get('/api/v1/organizations/current')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId);
    expect(res.status).toBe(200);
  });
  it('rejects access to a foreign org (403)', async () => {
    const res = await request(app).get('/api/v1/organizations/current')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', 'not-my-org');
    expect(res.status).toBe(403);
  });
  it('rejects unauthenticated requests (401)', async () => {
    const res = await request(app).get('/api/v1/organizations/current').set('X-Org-Id', orgId);
    expect(res.status).toBe(401);
  });
});

describe('CRM CRUD (BRD §10.6–10.9)', () => {
  let leadId = '';
  it('creates and lists a lead', async () => {
    const create = await request(app).post('/api/v1/leads')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId)
      .send({ name: 'Test Lead', phone: '9000000000', source: 'MANUAL', status: 'NEW' });
    expect(create.status).toBe(201);
    leadId = create.body.id;

    const list = await request(app).get('/api/v1/leads')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId);
    expect(list.body.total).toBeGreaterThanOrEqual(1);
  });

  it('creates a deal on the default pipeline and shows a kanban board + detail', async () => {
    const board = await request(app).get('/api/v1/deals/pipeline')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId);
    expect(board.status).toBe(200);
    expect(board.body.columns.length).toBe(7);
    const stageId = board.body.columns[0].stage.id;

    const deal = await request(app).post('/api/v1/deals')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId)
      .send({ title: 'Test Deal', value: 100000, stageId });
    expect(deal.status).toBe(201);

    // Single-deal detail returns pipeline stages for the stage picker.
    const detail = await request(app).get(`/api/v1/deals/${deal.body.id}`)
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId);
    expect(detail.status).toBe(200);
    expect(detail.body.title).toBe('Test Deal');
    expect(detail.body.pipeline.stages.length).toBe(7);
    expect(Array.isArray(detail.body.activities)).toBe(true);
  });

  it('creates a task', async () => {
    const res = await request(app).post('/api/v1/tasks')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId)
      .send({ title: 'Call lead', priority: 'HIGH', leadId });
    expect(res.status).toBe(201);
  });

  it('filters tasks by status and assignee', async () => {
    const me = await prisma.user.findUnique({ where: { email: ownerEmail } });
    await request(app).post('/api/v1/tasks')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId)
      .send({ title: 'My open task', priority: 'MEDIUM', status: 'OPEN', assignedUserId: me!.id });

    const mine = await request(app).get(`/api/v1/tasks?status=OPEN&assignedUserId=${me!.id}&pageSize=100`)
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId);
    expect(mine.status).toBe(200);
    expect(mine.body.tasks.every((t: any) => t.status === 'OPEN' && t.assignedUserId === me!.id)).toBe(true);

    const unassigned = await request(app).get('/api/v1/tasks?assignedUserId=none&pageSize=100')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId);
    expect(unassigned.status).toBe(200);
    expect(unassigned.body.tasks.every((t: any) => t.assignedUserId === null)).toBe(true);
  });

  it('returns an enriched lead detail and logs a note to the timeline', async () => {
    const create = await request(app).post('/api/v1/leads')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId)
      .send({ name: 'Detail Lead', phone: '9000000123' });
    const lid = create.body.id;

    const note = await request(app).post(`/api/v1/leads/${lid}/notes`)
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId)
      .send({ note: 'Called, will follow up Monday' });
    expect(note.status).toBe(201);

    const detail = await request(app).get(`/api/v1/leads/${lid}`)
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId);
    expect(detail.status).toBe(200);
    expect(Array.isArray(detail.body.activities)).toBe(true);
    expect(detail.body.activities.some((a: any) => a.type === 'NOTE_ADDED' && a.message.includes('Monday'))).toBe(true);
    expect(detail.body).toHaveProperty('conversations');
  });

  it('exports leads as CSV', async () => {
    const res = await request(app).get('/api/v1/leads/export.csv')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId);
    expect(res.status).toBe(200);
    expect(res.text).toContain('name,email,phone');
  });
});

describe('bulk actions & saved views', () => {
  let ids: string[] = [];
  it('bulk-sets status on multiple leads', async () => {
    // create 3 leads
    ids = [];
    for (let i = 0; i < 3; i++) {
      const r = await request(app).post('/api/v1/leads')
        .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId)
        .send({ name: `Bulk ${i}`, source: 'MANUAL' });
      ids.push(r.body.id);
    }
    const res = await request(app).post('/api/v1/leads/bulk')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId)
      .send({ ids, action: 'SET_STATUS', status: 'CONTACTED' });
    expect(res.status).toBe(200);
    expect(res.body.affected).toBe(3);
  });

  it('bulk-assigns leads to a team member', async () => {
    const me = await prisma.user.findUnique({ where: { email: ownerEmail } });
    const res = await request(app).post('/api/v1/leads/bulk')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId)
      .send({ ids, action: 'ASSIGN', assignedUserId: me!.id });
    expect(res.status).toBe(200);
    expect(res.body.affected).toBe(3);
    // Verify one lead is now assigned.
    const lead = await request(app).get(`/api/v1/leads/${ids[0]}`)
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId);
    expect(lead.body.assignedUserId).toBe(me!.id);
  });

  it('filters leads by assignee and by unassigned', async () => {
    const me = await prisma.user.findUnique({ where: { email: ownerEmail } });
    // ids were just assigned to `me` in the previous test.
    const mine = await request(app).get(`/api/v1/leads?assignedUserId=${me!.id}&pageSize=100`)
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId);
    expect(mine.status).toBe(200);
    expect(mine.body.leads.every((l: any) => l.assignedUserId === me!.id)).toBe(true);

    const unassigned = await request(app).get('/api/v1/leads?assignedUserId=none&pageSize=100')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId);
    expect(unassigned.status).toBe(200);
    expect(unassigned.body.leads.every((l: any) => l.assignedUserId === null)).toBe(true);
  });

  it('bulk-deletes leads', async () => {
    const res = await request(app).post('/api/v1/leads/bulk')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId)
      .send({ ids, action: 'DELETE' });
    expect(res.body.affected).toBe(3);
  });

  it('creates, lists and deletes a saved view', async () => {
    const create = await request(app).post('/api/v1/saved-views')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId)
      .send({ name: 'Hot leads', resource: 'LEADS', filters: { status: 'QUALIFIED' } });
    expect(create.status).toBe(201);
    const list = await request(app).get('/api/v1/saved-views?resource=LEADS')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId);
    expect(list.body.some((v: any) => v.name === 'Hot leads')).toBe(true);
    const del = await request(app).delete(`/api/v1/saved-views/${create.body.id}`)
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId);
    expect(del.status).toBe(204);
  });
});

describe('contact detail (Customer 360) + notes', () => {
  it('returns a customer360 profile and logs a note to its timeline', async () => {
    const create = await request(app).post('/api/v1/contacts')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId)
      .send({ name: 'C360 Contact', company: 'Acme' });
    const cid = create.body.id;

    const note = await request(app).post(`/api/v1/contacts/${cid}/notes`)
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId)
      .send({ note: 'Sent proposal, awaiting reply' });
    expect(note.status).toBe(201);

    const c360 = await request(app).get(`/api/v1/contacts/${cid}/customer360`)
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId);
    expect(c360.status).toBe(200);
    expect(c360.body.identity.name).toBe('C360 Contact');
    expect(c360.body.timeline.some((a: any) => a.type === 'NOTE_ADDED' && a.message.includes('proposal'))).toBe(true);
  });
});

describe('contacts & deals CSV + bulk', () => {
  it('exports contacts as CSV', async () => {
    const res = await request(app).get('/api/v1/contacts/export.csv')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId);
    expect(res.status).toBe(200);
    expect(res.text).toContain('name,email,phone,company');
  });

  it('imports and bulk-deletes contacts', async () => {
    const imp = await request(app).post('/api/v1/contacts/import')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId)
      .send({ rows: [{ name: 'CBulk 1' }, { name: 'CBulk 2' }] });
    expect(imp.body.imported).toBe(2);
    const list = await request(app).get('/api/v1/contacts?pageSize=100')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId);
    const ids = list.body.contacts.filter((c: any) => c.name.startsWith('CBulk')).map((c: any) => c.id);
    const del = await request(app).post('/api/v1/contacts/bulk')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId)
      .send({ ids, action: 'DELETE' });
    expect(del.body.affected).toBe(2);
  });

  it('exports deals as CSV', async () => {
    const res = await request(app).get('/api/v1/deals/export.csv')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId);
    expect(res.status).toBe(200);
    expect(res.text).toContain('title,value,stage');
  });

  it('exports the audit log as CSV (owner)', async () => {
    const res = await request(app).get('/api/v1/audit/export.csv')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId);
    expect(res.status).toBe(200);
    expect(res.text).toContain('createdAt,actorEmail,action');
  });
});

describe('reports / analytics (BRD §24)', () => {
  it('returns KPIs, chart data, and trends for a date range', async () => {
    const res = await request(app).get('/api/v1/reports/overview?days=30')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId);
    expect(res.status).toBe(200);
    expect(res.body.kpis).toHaveProperty('conversionRate');
    expect(res.body.kpis).toHaveProperty('leadsInRange');
    expect(res.body.leadsByStatus.length).toBeGreaterThan(0);
    expect(Array.isArray(res.body.trends.leadsCreated)).toBe(true);
    expect(res.body.range.days).toBe(30);
  });

  it('exports a report CSV', async () => {
    const res = await request(app).get('/api/v1/reports/export.csv?days=7')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId);
    expect(res.status).toBe(200);
    expect(res.text).toContain('metric,key,value');
  });

  it('returns an agent leaderboard', async () => {
    const res = await request(app).get('/api/v1/reports/leaderboard')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.leaderboard)).toBe(true);
    // The owner should appear with computed metrics.
    expect(res.body.leaderboard[0]).toHaveProperty('conversionRate');
    expect(res.body.leaderboard[0]).toHaveProperty('assignedLeads');
  });
});

describe('global search (⌘K)', () => {
  it('finds a lead by name across the CRM', async () => {
    // Create a distinctive lead to search for.
    await request(app).post('/api/v1/leads')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId)
      .send({ name: 'Zephyrine Quicksearch', source: 'MANUAL' });
    const res = await request(app).get('/api/v1/search?q=Zephyrine')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId);
    expect(res.status).toBe(200);
    expect(res.body.leads.some((l: any) => l.label === 'Zephyrine Quicksearch')).toBe(true);
  });

  it('returns empty structure for a blank query', async () => {
    const res = await request(app).get('/api/v1/search?q=')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('leads');
  });
});

describe('social simulation + capture (BRD §11, §12)', () => {
  it('processes a simulated inbound message and captures a lead', async () => {
    const res = await request(app).post('/api/v1/simulation/webhook')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId)
      .send({ channel: 'INSTAGRAM', senderId: 'ig_test_1', text: 'Hi, I want pricing', drainNow: true });
    expect(res.status).toBe(201);
    expect(res.body.drained.results[0].detail).toContain('NEEDS_NAME_PHONE');
  });

  it('completes capture when details are provided', async () => {
    const res = await request(app).post('/api/v1/simulation/webhook')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId)
      .send({ channel: 'INSTAGRAM', senderId: 'ig_test_1', text: 'My name is Rahul, phone 9876543210', drainNow: true });
    expect(res.body.drained.results[0].detail).toContain('COMPLETE');
  });
});

describe('cron drain security (BRD §14)', () => {
  it('rejects a wrong cron secret (401)', async () => {
    const res = await request(app).post('/api/internal/cron/drain-queues').set('Authorization', 'Bearer nope');
    expect(res.status).toBe(401);
  });
  it('accepts the correct cron secret', async () => {
    const res = await request(app).post('/api/internal/cron/drain-queues').set('Authorization', 'Bearer test-cron-secret');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('safe send rule (BRD §11.3)', () => {
  it('real reply without valid Meta creds fails (not SENT)', async () => {
    const conv = await prisma.conversation.findFirst({ where: { organizationId: orgId } });
    const res = await request(app).post(`/api/v1/conversations/${conv!.id}/reply`)
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId)
      .send({ body: 'real message', isSimulation: false });
    // Instagram creds are not configured → FAILED path → 502
    expect(res.status).toBe(502);
    expect(res.body.status).toBe('FAILED');
  });
});

describe('super admin (BRD §10.4)', () => {
  it('blocks non-superadmin from admin routes (403)', async () => {
    const res = await request(app).get('/api/v1/admin/organizations').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('allows a super admin to list orgs with counts', async () => {
    // Promote the owner to super admin directly.
    const user = await prisma.user.findUnique({ where: { email: ownerEmail } });
    await prisma.user.update({ where: { id: user!.id }, data: { isSuperAdmin: true } });
    // Re-login to get a super-admin token.
    const login = await request(app).post('/api/v1/auth/login').send({ email: ownerEmail, password: 'LeadOS@123' });
    const saToken = login.body.token;

    const res = await request(app).get('/api/v1/admin/organizations').set('Authorization', `Bearer ${saToken}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.organizations[0].counts).toHaveProperty('leads');
  });

  it('lists platform users, activity, and guards self-revoke of super admin', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ email: ownerEmail, password: 'LeadOS@123' });
    const saToken = login.body.token;
    const me = await prisma.user.findUnique({ where: { email: ownerEmail } });

    const users = await request(app).get('/api/v1/admin/users').set('Authorization', `Bearer ${saToken}`);
    expect(users.status).toBe(200);
    expect(users.body.users.some((u: any) => u.email === ownerEmail && u.isSuperAdmin)).toBe(true);
    // No password hashes leaked.
    expect(JSON.stringify(users.body)).not.toContain('passwordHash');

    const activity = await request(app).get('/api/v1/admin/activity').set('Authorization', `Bearer ${saToken}`);
    expect(activity.status).toBe(200);
    expect(Array.isArray(activity.body)).toBe(true);

    // Cannot revoke your own super admin.
    const selfRevoke = await request(app).patch(`/api/v1/admin/users/${me!.id}/super-admin`)
      .set('Authorization', `Bearer ${saToken}`).send({ isSuperAdmin: false });
    expect(selfRevoke.status).toBe(400);
  });

  it('drills into a single org (detail + members + activity)', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ email: ownerEmail, password: 'LeadOS@123' });
    const saToken = login.body.token;
    const list = await request(app).get('/api/v1/admin/organizations').set('Authorization', `Bearer ${saToken}`);
    const oid = list.body.organizations[0].id;

    const detail = await request(app).get(`/api/v1/admin/organizations/${oid}`).set('Authorization', `Bearer ${saToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.counts).toHaveProperty('members');

    const members = await request(app).get(`/api/v1/admin/organizations/${oid}/members`).set('Authorization', `Bearer ${saToken}`);
    expect(members.status).toBe(200);
    expect(members.body.length).toBeGreaterThanOrEqual(1);

    const activity = await request(app).get(`/api/v1/admin/organizations/${oid}/activity`).set('Authorization', `Bearer ${saToken}`);
    expect(activity.status).toBe(200);
    expect(Array.isArray(activity.body)).toBe(true);
  });

  it('platform search finds orgs and users (no secrets)', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ email: ownerEmail, password: 'LeadOS@123' });
    const saToken = login.body.token;
    const res = await request(app).get(`/api/v1/admin/search?q=${encodeURIComponent(ownerEmail.split('@')[0])}`)
      .set('Authorization', `Bearer ${saToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('organizations');
    expect(res.body.users.some((u: any) => u.email === ownerEmail)).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });
});

describe('billing usage limits (BRD §19.3)', () => {
  it('enforces the member limit with a 402', async () => {
    // Fresh org on STARTER (members limit 3; owner already counts as 1).
    const email = uniqueEmail('lim');
    const signup = await request(app).post('/api/v1/auth/signup').send({
      firstName: 'L', lastName: 'M', email, password: 'LeadOS@123', workspaceName: 'Limit Co',
    });
    const t = signup.body.token;
    const oid = signup.body.organizations[0].organizationId;
    await request(app).post('/api/v1/billing/change-plan')
      .set('Authorization', `Bearer ${t}`).set('X-Org-Id', oid).send({ plan: 'STARTER' });

    const add = (n: number) => request(app).post('/api/v1/organizations/members')
      .set('Authorization', `Bearer ${t}`).set('X-Org-Id', oid)
      .send({ firstName: `M${n}`, lastName: 'T', email: uniqueEmail(`m${n}`), password: 'LeadOS@123', role: 'SALES_AGENT' });

    await add(1); // 2 total
    await add(2); // 3 total (== limit)
    const over = await add(3); // should exceed
    expect(over.status).toBe(402);
  });
});

describe('web forms (BRD §15.2)', () => {
  it('captures a public web-form lead', async () => {
    const res = await request(app).post(`/api/v1/forms/${orgSlug}/submit`)
      .send({ name: 'Web Visitor', phone: '9111111111', message: 'pricing?' });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
  });
});

describe('workflows (BRD §8.1)', () => {
  it('auto-creates a task when a lead reaches QUALIFIED', async () => {
    // Create a workflow.
    await request(app).post('/api/v1/workflows')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId)
      .send({ name: 'wf', isActive: true, definition: { trigger: { event: 'LEAD_STATUS_CHANGED', status: 'QUALIFIED' }, action: { type: 'CREATE_TASK', taskTitle: 'WF Task', taskPriority: 'HIGH' } } });
    // Create a lead and move it to QUALIFIED.
    const lead = await request(app).post('/api/v1/leads')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId)
      .send({ name: 'WF Lead' });
    await request(app).patch(`/api/v1/leads/${lead.body.id}`)
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId)
      .send({ status: 'QUALIFIED' });

    const tasks = await request(app).get(`/api/v1/tasks?leadId=${lead.body.id}`)
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId);
    expect(tasks.body.tasks.some((t: any) => t.title === 'WF Task')).toBe(true);
  });
});

describe('meta webhook signature (BRD §16)', () => {
  it('verifies the GET handshake with the correct token', async () => {
    const res = await request(app)
      .get('/api/v1/webhooks/meta')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'test_verify_token', 'hub.challenge': 'CH123' });
    expect(res.status).toBe(200);
    expect(res.text).toBe('CH123');
  });

  it('rejects a wrong handshake token (403)', async () => {
    const res = await request(app)
      .get('/api/v1/webhooks/meta')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'WRONG', 'hub.challenge': 'X' });
    expect(res.status).toBe(403);
  });

  it('rejects a POST with an invalid signature (401)', async () => {
    const payload = JSON.stringify({ object: 'instagram', entry: [] });
    const res = await request(app)
      .post('/api/v1/webhooks/meta')
      .set('X-Hub-Signature-256', 'sha256=deadbeef')
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(res.status).toBe(401);
  });

  it('accepts a POST with a valid signature (200)', async () => {
    const payload = JSON.stringify({ object: 'instagram', entry: [] });
    const sig = 'sha256=' + crypto.createHmac('sha256', 'test_app_secret').update(payload).digest('hex');
    const res = await request(app)
      .post('/api/v1/webhooks/meta')
      .set('X-Hub-Signature-256', sig)
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(res.status).toBe(200);
  });
});

describe('notifications', () => {
  it('lists notifications and unread count for the org', async () => {
    // The simulation capture earlier should have created a LEAD_CAPTURED notice.
    const list = await request(app).get('/api/v1/notifications')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);

    const count = await request(app).get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId);
    expect(count.status).toBe(200);
    expect(count.body).toHaveProperty('count');
  });

  it('marks all notifications read', async () => {
    const res = await request(app).post('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId);
    expect(res.status).toBe(200);
    const count = await request(app).get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId);
    expect(count.body.count).toBe(0);
  });
});

describe('audit log (BRD §8.2)', () => {
  it('records lead creation in the audit trail (owner/admin view)', async () => {
    // A lead was created earlier in the CRM suite → should have an audit entry.
    const res = await request(app).get('/api/v1/audit?action=LEAD_CREATED')
      .set('Authorization', `Bearer ${token}`).set('X-Org-Id', orgId);
    expect(res.status).toBe(200);
    expect(res.body.entries.some((e: any) => e.action === 'LEAD_CREATED')).toBe(true);
    expect(res.body.entries[0]).toHaveProperty('actorEmail');
  });
});

describe('two-factor auth (TOTP)', () => {
  const email = uniqueEmail('twofa');
  let t = '';
  let secret = '';

  it('signs up a fresh user', async () => {
    const res = await request(app).post('/api/v1/auth/signup').send({
      firstName: '2FA', lastName: 'User', email, password: 'LeadOS@123', workspaceName: '2FA Co',
    });
    expect(res.status).toBe(201);
    t = res.body.token;
  });

  it('sets up and enables 2FA with a valid TOTP code', async () => {
    const setup = await request(app).post('/api/v1/2fa/setup').set('Authorization', `Bearer ${t}`);
    expect(setup.status).toBe(200);
    expect(setup.body.qrDataUrl).toContain('data:image');
    secret = setup.body.secret;

    const code = authenticator.generate(secret);
    const enable = await request(app).post('/api/v1/2fa/enable').set('Authorization', `Bearer ${t}`).send({ token: code });
    expect(enable.status).toBe(200);
    expect(enable.body.enabled).toBe(true);
    expect(enable.body.backupCodes.length).toBeGreaterThan(0);
  });

  it('login now returns a 2FA challenge, not a token', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password: 'LeadOS@123' });
    expect(res.status).toBe(200);
    expect(res.body.twoFactorRequired).toBe(true);
    expect(res.body.challenge).toBeTruthy();
    expect(res.body.token).toBeUndefined();
  });

  it('completes login with a valid TOTP code', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ email, password: 'LeadOS@123' });
    const code = authenticator.generate(secret);
    const verify = await request(app).post('/api/v1/2fa/login-verify').send({ challenge: login.body.challenge, token: code });
    expect(verify.status).toBe(200);
    expect(verify.body.token).toBeTruthy();
  });

  it('rejects an invalid 2FA code', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ email, password: 'LeadOS@123' });
    const verify = await request(app).post('/api/v1/2fa/login-verify').send({ challenge: login.body.challenge, token: '000000' });
    expect(verify.status).toBe(401);
  });
});

describe('SSO', () => {
  it('reports SSO availability (disabled without creds)', async () => {
    const res = await request(app).get('/api/v1/sso/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('google');
    expect(res.body.google).toBe(false); // no Google creds in tests
  });
  it('rejects starting Google login when not configured', async () => {
    const res = await request(app).get('/api/v1/sso/google');
    expect(res.status).toBe(400);
  });
});

describe('health & observability', () => {
  it('responds ok on /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('exposes metrics and a request id header', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalRequests');
    expect(res.body).toHaveProperty('avgLatencyMs');
    expect(res.headers['x-request-id']).toBeTruthy();
  });
});
