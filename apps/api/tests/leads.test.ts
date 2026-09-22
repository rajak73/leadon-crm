import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  api,
  auth,
  createMember,
  flush,
  prisma,
  setupAdmin,
  testApp,
  type Session,
} from './helpers.js';

const app = testApp();
let admin: Session;
let member: Session;

beforeAll(async () => {
  admin = await setupAdmin(app);
  member = await createMember(app, admin, 'Priya');
  await api(app, admin).patch('/settings', { aiScoringAuto: false }).expect(200);
});

async function newLead(body: Record<string, unknown> = {}, s = admin) {
  const res = await api(app, s)
    .post('/leads', { firstName: 'Lead', ...body })
    .expect(201);
  return res.body.data as { id: string; [k: string]: unknown };
}

describe('lead CRUD', () => {
  it('creates, reads, updates and soft-deletes a lead', async () => {
    const lead = await newLead({
      firstName: 'Aarav',
      lastName: 'Shah',
      email: 'AARAV@Example.com',
      phone: '+91 98200 12345',
      tags: ['vip', 'vip'],
      company: '',
    });
    expect(lead).toMatchObject({
      email: 'aarav@example.com',
      company: null,
      tags: ['vip'],
      status: 'NEW',
      source: 'MANUAL',
    });
    expect(lead.createdBy).toMatchObject({ id: admin.userId, firstName: 'Asha' });
    expect(typeof lead.createdAt).toBe('string');

    const detail = await api(app, admin).get(`/leads/${lead.id}`).expect(200);
    expect(detail.body.data).toMatchObject({
      id: lead.id,
      latestScore: null,
      openTaskCount: 0,
      deals: [],
    });

    const updated = await api(app, admin)
      .patch(`/leads/${lead.id}`, { status: 'CONTACTED', company: 'Infosys' })
      .expect(200);
    expect(updated.body.data).toMatchObject({ status: 'CONTACTED', company: 'Infosys' });
    expect(updated.body.data.lastActivityAt).not.toBeNull();

    const timeline = await api(app, admin).get(`/activities?leadId=${lead.id}`).expect(200);
    const descriptions = timeline.body.data.map((a: { description: string }) => a.description);
    expect(descriptions).toContain('Status changed from New to Contacted');
    expect(descriptions).toContain('Updated company');
    expect(descriptions).toContain('Lead created');

    await api(app, admin).delete(`/leads/${lead.id}`).expect(200);
    await api(app, admin).get(`/leads/${lead.id}`).expect(404);
    await api(app, admin).delete(`/leads/${lead.id}`).expect(404);
  });

  it('rejects a duplicate email with the existing id', async () => {
    const first = await newLead({ email: 'dup@example.com' });
    const res = await api(app, admin)
      .post('/leads', { firstName: 'Again', email: 'Dup@example.com' })
      .expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.details.existingId).toEqual([first.id]);
    // A deleted lead doesn't block the email.
    await api(app, admin).delete(`/leads/${first.id}`).expect(200);
    await newLead({ email: 'dup@example.com' });
  });

  it('requires a reason to mark a lead lost and blocks WON outside convert', async () => {
    const lead = await newLead();
    const res = await api(app, admin).patch(`/leads/${lead.id}`, { status: 'LOST' }).expect(422);
    expect(res.body.error.details.lostReason).toBeDefined();
    await api(app, admin).patch(`/leads/${lead.id}`, { status: 'WON' }).expect(422);
    const lost = await api(app, admin)
      .patch(`/leads/${lead.id}`, { status: 'LOST', lostReason: 'Budget' })
      .expect(200);
    expect(lost.body.data.lostReason).toBe('Budget');
    const reopened = await api(app, admin)
      .patch(`/leads/${lead.id}`, { status: 'CONTACTED' })
      .expect(200);
    expect(reopened.body.data.lostReason).toBeNull();
  });

  it('validates input with field-level messages', async () => {
    const res = await api(app, admin)
      .post('/leads', { firstName: '', email: 'nope', phone: 'abc', source: 'CARRIER_PIGEON' })
      .expect(422);
    expect(res.body.error.message).toBe('Check the highlighted fields.');
    expect(Object.keys(res.body.error.details).sort()).toEqual([
      'email',
      'firstName',
      'phone',
      'source',
    ]);
    await api(app, admin)
      .post('/leads', { firstName: 'X', assignedToId: crypto.randomUUID() })
      .expect(422);
  });

  it('notifies the assignee (but not when assigning to yourself)', async () => {
    const lead = await newLead({ firstName: 'Zoya' });
    await api(app, admin).patch(`/leads/${lead.id}`, { assignedToId: member.userId }).expect(200);
    await newLead({ firstName: 'Self', assignedToId: admin.userId });
    await flush();
    const notes = await api(app, member).get('/notifications').expect(200);
    expect(notes.body.data[0]).toMatchObject({
      type: 'LEAD_ASSIGNED',
      entityType: 'lead',
      entityId: lead.id,
      readAt: null,
    });
    expect(notes.body.data[0].title).toContain('Zoya');
    expect(
      (await api(app, admin).get('/notifications/unread-count').expect(200)).body.data.count,
    ).toBe(0);
    const count = await api(app, member).get('/notifications/unread-count').expect(200);
    expect(count.body.data.count).toBe(1);
    await api(app, member).post(`/notifications/${notes.body.data[0].id}/read`).expect(200);
    await api(app, admin).post(`/notifications/${notes.body.data[0].id}/read`).expect(404);
    expect(
      (await api(app, member).get('/notifications?unreadOnly=true').expect(200)).body.data,
    ).toHaveLength(0);
  });
});

describe('lead list filters', () => {
  beforeAll(async () => {
    await prisma.lead.deleteMany({});
    await newLead({
      firstName: 'Kavya',
      lastName: 'Iyer',
      company: 'Zomato',
      status: 'QUALIFIED',
      source: 'REFERRAL',
      tags: ['hot'],
    });
    await newLead({
      firstName: 'Rohan',
      email: 'rohan@swiggy.in',
      status: 'NEW',
      source: 'WEBSITE',
      assignedToId: member.userId,
      tags: ['cold', 'b2b'],
    });
    await newLead({
      firstName: 'Neha',
      phone: '+91 99999 00000',
      status: 'CONTACTED',
      source: 'WEBSITE',
    });
    const scored = await newLead({ firstName: 'Scored' });
    await prisma.lead.update({ where: { id: scored.id }, data: { aiScore: 85 } });
  });

  const names = (res: request.Response) =>
    res.body.data.map((l: { firstName: string }) => l.firstName).sort();

  it('filters by status (comma separated or repeated) and source', async () => {
    expect(names(await api(app, admin).get('/leads?status=NEW,QUALIFIED').expect(200))).toEqual([
      'Kavya',
      'Rohan',
      'Scored',
    ]);
    expect(
      names(await api(app, admin).get('/leads?status=NEW&status=CONTACTED').expect(200)),
    ).toEqual(['Neha', 'Rohan', 'Scored']);
    expect(names(await api(app, admin).get('/leads?source=WEBSITE').expect(200))).toEqual([
      'Neha',
      'Rohan',
    ]);
  });

  it('searches names, email, phone and company case-insensitively', async () => {
    expect(names(await api(app, admin).get('/leads?search=zomato').expect(200))).toEqual(['Kavya']);
    expect(names(await api(app, admin).get('/leads?search=kavya iyer').expect(200))).toEqual([
      'Kavya',
    ]);
    expect(names(await api(app, admin).get('/leads?search=SWIGGY').expect(200))).toEqual(['Rohan']);
    expect(names(await api(app, admin).get('/leads?search=99999').expect(200))).toEqual(['Neha']);
  });

  it('filters by tag, assignee and score, and paginates', async () => {
    expect(names(await api(app, admin).get('/leads?tag=b2b').expect(200))).toEqual(['Rohan']);
    expect(names(await api(app, member).get('/leads?assignedToId=me').expect(200))).toEqual([
      'Rohan',
    ]);
    expect(names(await api(app, admin).get('/leads?assignedToId=unassigned').expect(200))).toEqual([
      'Kavya',
      'Neha',
      'Scored',
    ]);
    expect(names(await api(app, admin).get('/leads?scoreMin=80').expect(200))).toEqual(['Scored']);
    const page = await api(app, admin)
      .get('/leads?limit=2&page=2&sortBy=firstName&sortOrder=asc')
      .expect(200);
    expect(page.body.meta).toEqual({ page: 2, limit: 2, total: 4, totalPages: 2 });
    expect(page.body.data.map((l: { firstName: string }) => l.firstName)).toEqual([
      'Rohan',
      'Scored',
    ]);
    await api(app, admin).get('/leads?limit=500').expect(422);
  });

  it('lists distinct tags', async () => {
    const res = await api(app, admin).get('/leads/tags').expect(200);
    expect(res.body.data).toEqual(['b2b', 'cold', 'hot']);
  });
});

describe('convert', () => {
  it('creates a contact and a deal in the first open stage', async () => {
    const lead = await newLead({
      firstName: 'Ishaan',
      lastName: 'Gupta',
      email: 'ishaan@example.com',
      company: 'Nykaa',
      tags: ['vip'],
    });
    const res = await api(app, admin)
      .post(`/leads/${lead.id}/convert`, { createDeal: true, dealValue: 250000 })
      .expect(200);
    const { lead: converted, contact, deal } = res.body.data;
    expect(converted).toMatchObject({ status: 'WON', convertedToContactId: contact.id });
    expect(contact).toMatchObject({
      firstName: 'Ishaan',
      email: 'ishaan@example.com',
      company: 'Nykaa',
      tags: ['vip'],
    });
    expect(deal).toMatchObject({
      title: 'Nykaa — Ishaan Gupta',
      value: 250000,
      currency: 'INR',
      status: 'OPEN',
      stage: { name: 'New' },
    });
    expect(deal.lead.id).toBe(lead.id);

    await api(app, admin).post(`/leads/${lead.id}/convert`, {}).expect(409);
    await api(app, admin).patch(`/leads/${lead.id}`, { status: 'CONTACTED' }).expect(409);

    const contactDetail = await api(app, admin).get(`/contacts/${contact.id}`).expect(200);
    expect(contactDetail.body.data.convertedFromLeadId).toBe(lead.id);
    expect(contactDetail.body.data.deals).toHaveLength(1);
  });

  it('links an existing contact with the same email instead of creating a duplicate', async () => {
    const existing = await api(app, admin)
      .post('/contacts', { firstName: 'Diya', email: 'diya@example.com' })
      .expect(201);
    const lead = await newLead({ firstName: 'Diya', email: 'diya@example.com' });
    const res = await api(app, admin).post(`/leads/${lead.id}/convert`, {}).expect(200);
    expect(res.body.data.contact.id).toBe(existing.body.data.id);
    expect(res.body.data.deal).toBeNull();
    expect(await prisma.contact.count({ where: { email: 'diya@example.com' } })).toBe(1);
  });
});

describe('bulk actions', () => {
  it('assigns, changes status, tags and (admin only) deletes', async () => {
    const ids = [(await newLead()).id, (await newLead()).id, (await newLead()).id];
    const b = (body: object, s = admin) => api(app, s).post('/leads/bulk', body);

    expect(
      (await b({ action: 'assign', ids, assignedToId: member.userId }).expect(200)).body.data,
    ).toEqual({ affected: 3 });
    expect(
      (await b({ action: 'assign', ids, assignedToId: member.userId }).expect(200)).body.data,
    ).toEqual({ affected: 0 });
    expect(
      (await b({ action: 'status', ids, status: 'CONTACTED' }, member).expect(200)).body.data,
    ).toEqual({ affected: 3 });
    expect(
      (await b({ action: 'tag', ids: [ids[0]], tag: 'priority' }).expect(200)).body.data,
    ).toEqual({ affected: 1 });
    await b({ action: 'delete', ids }, member).expect(403);
    expect((await b({ action: 'delete', ids }).expect(200)).body.data).toEqual({ affected: 3 });

    await flush();
    const n = await prisma.notification.findMany({
      where: { userId: member.userId, title: '3 leads assigned to you' },
    });
    expect(n).toHaveLength(1);
  });

  it('caps the number of ids', async () => {
    const ids = Array.from({ length: 501 }, () => crypto.randomUUID());
    await api(app, admin).post('/leads/bulk', { action: 'tag', ids, tag: 'x' }).expect(422);
  });
});

describe('CSV import and export', () => {
  const upload = (csv: string, name = 'leads.csv', contentType = 'text/csv') =>
    request(app)
      .post('/api/leads/import')
      .set(auth(admin))
      .attach('file', Buffer.from(csv), { filename: name, contentType });

  it('imports valid rows, reports bad rows and skips duplicates', async () => {
    await newLead({ firstName: 'Existing', email: 'existing@example.com' });
    const csv = [
      'First Name,last_name,Email,Phone,Company,Source,Status,Tags,Favourite colour',
      'Meera,Menon,meera@example.com,+91 90000 11111,Freshworks,Website,Contacted,hot; b2b,blue',
      ',NoFirst,nofirst@example.com,,,,,,',
      'Bad,Email,not-an-email,,,,,,',
      'Dup,InFile,meera@example.com,,,,,,',
      'Dup,InDb,existing@example.com,,,,,,',
      'Weird,Status,weird@example.com,,,,Sleeping,,',
      'Plain,Row,,,,,,,',
    ].join('\n');
    const res = await upload(csv).expect(200);
    expect(res.body.data).toMatchObject({ total: 7, created: 2, skipped: 2 });
    expect(res.body.data.errors).toEqual([
      { row: 2, message: 'First name: Enter a first name' },
      { row: 3, message: 'Email: Enter a valid email address' },
      { row: 6, message: 'Status "Sleeping" isn\'t recognised' },
    ]);
    const meera = await prisma.lead.findFirstOrThrow({ where: { email: 'meera@example.com' } });
    expect(meera).toMatchObject({
      source: 'WEBSITE',
      status: 'CONTACTED',
      company: 'Freshworks',
      tags: ['hot', 'b2b'],
    });
    const plain = await prisma.lead.findFirstOrThrow({ where: { firstName: 'Plain' } });
    expect(plain.source).toBe('IMPORT');
  });

  it('supports a single Name column', async () => {
    const res = await upload('name,email\nRavi Kumar Sharma,ravi.k@example.com\n').expect(200);
    expect(res.body.data.created).toBe(1);
    const ravi = await prisma.lead.findFirstOrThrow({ where: { email: 'ravi.k@example.com' } });
    expect([ravi.firstName, ravi.lastName]).toEqual(['Ravi', 'Kumar Sharma']);
  });

  it('rejects files without a usable header, oversized files and non-CSV uploads', async () => {
    expect((await upload('email,phone\na@example.com,1\n').expect(422)).body.error.message).toMatch(
      /First name/,
    );
    const rows = ['firstName', ...Array.from({ length: 5001 }, (_, i) => `L${i}`)].join('\n');
    expect((await upload(rows).expect(422)).body.error.message).toMatch(/5,000/);
    await upload('x'.repeat(2 * 1024 * 1024 + 10)).expect(422);
    await upload('firstName\nA', 'photo.png', 'image/png').expect(422);
    await request(app).post('/api/leads/import').set(auth(admin)).expect(422);
  });

  it('exports the filtered list as CSV with friendly labels', async () => {
    await newLead({
      firstName: '=HYPERLINK("x")',
      email: 'formula@example.com',
      source: 'REFERRAL',
    });
    const res = await request(app)
      .get('/api/leads/export?source=REFERRAL')
      .set(auth(admin))
      .expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(
      /attachment; filename="leads-\d{4}-\d{2}-\d{2}\.csv"/,
    );
    const lines = res.text
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\n');
    expect(lines[0]).toBe(
      'First name,Last name,Email,Phone,Company,Source,Status,Tags,AI score,Assigned to,Lost reason,Created at',
    );
    expect(lines.some((l) => l.startsWith(`"'=HYPERLINK(""x"")"`))).toBe(true);
    expect(lines.every((l, i) => i === 0 || l.includes('Referral'))).toBe(true);
  });
});
