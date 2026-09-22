import { beforeAll, describe, expect, it } from 'vitest';
import { api, createMember, prisma, setupAdmin, testApp, type Session } from './helpers.js';

const app = testApp();
let admin: Session;
let member: Session;

beforeAll(async () => {
  admin = await setupAdmin(app);
  member = await createMember(app, admin, 'Meena');
});

const stages = [{ name: 'Open' }, { name: 'Won', isWon: true }, { name: 'Lost', isLost: true }];
const workflow = {
  name: 'W',
  definition: {
    trigger: { type: 'LEAD_CREATED' },
    actions: [{ type: 'add_tag', config: { tag: 'x' } }],
  },
};

describe('role enforcement', () => {
  it('members cannot manage users, settings, pipelines or workflows', async () => {
    const m = api(app, member);
    await m
      .post('/users', { firstName: 'X', email: 'x@example.com', password: 'password1' })
      .expect(403);
    await m.patch(`/users/${admin.userId}`, { firstName: 'Nope' }).expect(403);
    await m.post(`/users/${admin.userId}/password`, { password: 'password1' }).expect(403);
    await m.patch('/settings', { companyName: 'Hacked' }).expect(403);
    await m.post('/pipelines', { name: 'P', stages }).expect(403);
    await m.post('/workflows', workflow).expect(403);
    const res = await m
      .post('/leads/bulk', { action: 'delete', ids: [crypto.randomUUID()] })
      .expect(403);
    expect(res.body.error).toEqual({ code: 'FORBIDDEN', message: expect.any(String) });
  });

  it('members can read team, settings, pipelines and workflows, and write CRM records', async () => {
    const m = api(app, member);
    const users = await m.get('/users').expect(200);
    expect(users.body.data.length).toBe(2);
    expect(users.body.data[0]).not.toHaveProperty('passwordHash');
    const settings = await m.get('/settings').expect(200);
    expect(settings.body.data).toMatchObject({
      companyName: 'Acme Traders',
      defaultCurrency: 'INR',
      timezone: 'Asia/Kolkata',
      aiProvider: 'rules',
    });
    await m.get('/pipelines').expect(200);
    await m.get('/workflows').expect(200);
    await m.post('/leads', { firstName: 'Ravi' }).expect(201);
    await m.post('/contacts', { firstName: 'Kiran' }).expect(201);
  });

  it('admins can manage settings (with validation)', async () => {
    const a = api(app, admin);
    await a.patch('/settings', { timezone: 'Mars/Olympus' }).expect(422);
    const res = await a
      .patch('/settings', { defaultCurrency: 'usd', aiScoringAuto: false })
      .expect(200);
    expect(res.body.data).toMatchObject({ defaultCurrency: 'USD', aiScoringAuto: false });
    await a.patch('/settings', { defaultCurrency: 'INR', aiScoringAuto: true }).expect(200);
  });
});

describe('user management', () => {
  it('rejects duplicate emails', async () => {
    const email = (await prisma.user.findUniqueOrThrow({ where: { id: member.userId } })).email;
    await api(app, admin)
      .post('/users', { firstName: 'Dup', email, password: 'password1' })
      .expect(409);
  });

  it('an admin cannot demote or disable themselves', async () => {
    await api(app, admin).patch(`/users/${admin.userId}`, { role: 'MEMBER' }).expect(409);
    await api(app, admin).patch(`/users/${admin.userId}`, { status: 'DISABLED' }).expect(409);
  });

  it('keeps at least one active admin', async () => {
    const second = await createMember(app, admin, 'Second', 'ADMIN');
    // The second admin may demote the first while two admins exist…
    await api(app, second).patch(`/users/${admin.userId}`, { role: 'MEMBER' }).expect(200);
    // …but now the first (a member) can't do anything, and the last admin can't be demoted by anyone.
    await api(app, admin).patch(`/users/${second.userId}`, { role: 'MEMBER' }).expect(403);
    await api(app, second).patch(`/users/${admin.userId}`, { role: 'ADMIN' }).expect(200);
  });

  it('resets a password and revokes sessions', async () => {
    const target = await createMember(app, admin, 'Reset');
    await api(app, admin)
      .post(`/users/${target.userId}/password`, { password: 'brand-new-pass' })
      .expect(200);
    const tokens = await prisma.refreshToken.count({
      where: { userId: target.userId, revokedAt: null },
    });
    expect(tokens).toBe(0);
  });

  it('returns 404 for an unknown user id', async () => {
    await api(app, admin).patch('/users/not-a-uuid', { firstName: 'X' }).expect(404);
    await api(app, admin).patch(`/users/${crypto.randomUUID()}`, { firstName: 'X' }).expect(404);
  });
});
