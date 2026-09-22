import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  PASSWORD,
  api,
  cookieFrom,
  createMember,
  login,
  prisma,
  setupAdmin,
  testApp,
  type Session,
} from './helpers.js';

const app = testApp();
let admin: Session;

const refresh = (cookie: string) =>
  request(app).post('/api/auth/refresh').set('Cookie', cookie).set('X-Requested-With', 'fetch');

describe('first-run setup', () => {
  it('reports that setup is needed on an empty database', async () => {
    const res = await request(app).get('/api/auth/status').expect(200);
    expect(res.body).toEqual({ success: true, data: { needsSetup: true, companyName: null } });
  });

  it('creates the admin, settings and default pipeline, and signs in', async () => {
    admin = await setupAdmin(app);
    expect(admin.token).toBeTruthy();
    expect(admin.cookie).toMatch(/^leados_rt=/);
    const status = await request(app).get('/api/auth/status').expect(200);
    expect(status.body.data).toEqual({ needsSetup: false, companyName: 'Acme Traders' });
    const pipelines = await api(app, admin).get('/pipelines').expect(200);
    expect(pipelines.body.data).toHaveLength(1);
    expect(pipelines.body.data[0].stages.map((s: { name: string }) => s.name)).toEqual([
      'New',
      'Contacted',
      'Proposal',
      'Negotiation',
      'Won',
      'Lost',
    ]);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: admin.userId } });
    expect(user.role).toBe('ADMIN');
  });

  it('refuses a second setup', async () => {
    const res = await request(app)
      .post('/api/auth/setup')
      .send({ companyName: 'X', firstName: 'Y', email: 'other@example.com', password: PASSWORD })
      .expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});

describe('login', () => {
  it('sets an HttpOnly refresh cookie scoped to /api/auth', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ADMIN@example.com', password: PASSWORD })
      .expect(200);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/api/auth');
    expect(cookie).toContain('SameSite=Lax');
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
    expect(res.body.data.expiresIn).toBe(900);
  });

  it('gives the same message for unknown emails and wrong passwords', async () => {
    const a = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever1' })
      .expect(401);
    const b = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'wrong-pass' })
      .expect(401);
    expect(a.body.error.message).toBe(b.body.error.message);
  });

  it('locks the account after 5 failures, then resets the counter once the lock expires', async () => {
    const member = await createMember(app, admin, 'Lockie');
    const { email } = await prisma.user.findUniqueOrThrow({ where: { id: member.userId } });
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'wrong-password' })
        .expect(401);
    }
    const locked = await request(app)
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(429);
    expect(locked.body.error.message).toMatch(/Try again in 15 minutes/);

    // Expire the lock: the next single failure must not re-lock the account.
    await prisma.user.update({
      where: { id: member.userId },
      data: { lockedUntil: new Date(Date.now() - 1000), failedLoginCount: 4 },
    });
    await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: member.userId } });
    expect(row.lockedUntil).toBeNull();
    expect(row.failedLoginCount).toBe(1);
    await login(app, email);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: member.userId } })).failedLoginCount,
    ).toBe(0);
  });

  it('rate-limits login attempts per IP', async () => {
    const limited = testApp({ authRateLimit: 2 });
    for (let i = 0; i < 2; i++) {
      await request(limited)
        .post('/api/auth/login')
        .send({ email: 'x@example.com', password: 'nope-nope' })
        .expect(401);
    }
    const res = await request(limited)
      .post('/api/auth/login')
      .send({ email: 'x@example.com', password: 'nope-nope' })
      .expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('refresh tokens', () => {
  it('requires the X-Requested-With header', async () => {
    const s = await login(app, 'admin@example.com');
    await request(app).post('/api/auth/refresh').set('Cookie', s.cookie).expect(403);
  });

  it('rotates the cookie on every refresh', async () => {
    const s = await login(app, 'admin@example.com');
    const res = await refresh(s.cookie).expect(200);
    const next = cookieFrom(res);
    expect(next).toMatch(/^leados_rt=/);
    expect(next).not.toBe(s.cookie);
    await api(app, { ...s, token: res.body.data.accessToken })
      .get('/me')
      .expect(200);
    await refresh(next).expect(200);
  });

  it('returns a session without a new cookie when the old token is reused within 30 seconds', async () => {
    const s = await login(app, 'admin@example.com');
    const first = await refresh(s.cookie).expect(200);
    const newCookie = cookieFrom(first);
    const again = await refresh(s.cookie).expect(200); // second tab, same old cookie
    expect(again.body.data.accessToken).toBeTruthy();
    expect(cookieFrom(again)).toBe('');
    await refresh(newCookie).expect(200); // the rotated token still works
  });

  it('handles two concurrent refreshes without revoking the session', async () => {
    const s = await login(app, 'admin@example.com');
    const [a, b] = await Promise.all([refresh(s.cookie), refresh(s.cookie)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const rotated = [cookieFrom(a), cookieFrom(b)].filter(Boolean);
    expect(rotated).toHaveLength(1);
    await refresh(rotated[0]!).expect(200);
  });

  it('revokes the whole family when an old token is reused after the grace window', async () => {
    const s = await login(app, 'admin@example.com');
    const first = await refresh(s.cookie).expect(200);
    const newCookie = cookieFrom(first);
    await prisma.refreshToken.updateMany({
      where: { usedAt: { not: null } },
      data: { usedAt: new Date(Date.now() - 60_000) },
    });
    await refresh(s.cookie).expect(401);
    await refresh(newCookie).expect(401); // family revoked
  });

  it('logout revokes the session and clears the cookie', async () => {
    const s = await login(app, 'admin@example.com');
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', s.cookie)
      .set('X-Requested-With', 'fetch')
      .expect(200);
    expect(String(res.headers['set-cookie'])).toMatch(/leados_rt=;/);
    await refresh(s.cookie).expect(401);
  });
});

describe('profile', () => {
  it('rejects requests without a valid token', async () => {
    await request(app).get('/api/me').expect(401);
    await request(app).get('/api/leads').set('Authorization', 'Bearer nope').expect(401);
  });

  it('updates the profile and refuses an email already in use', async () => {
    const other = await createMember(app, admin, 'Taken');
    const takenEmail = (await prisma.user.findUniqueOrThrow({ where: { id: other.userId } })).email;
    const res = await api(app, admin).patch('/me', { firstName: 'Asha M' }).expect(200);
    expect(res.body.data.firstName).toBe('Asha M');
    const dup = await api(app, admin).patch('/me', { email: takenEmail }).expect(409);
    expect(dup.body.error.details.email).toBeDefined();
  });

  it('changing the password keeps this session and revokes the others', async () => {
    const member = await createMember(app, admin, 'Pwchange');
    const email = (await prisma.user.findUniqueOrThrow({ where: { id: member.userId } })).email;
    const otherDevice = await login(app, email);
    await api(app, member)
      .post('/me/password', { currentPassword: 'wrong', newPassword: 'new-password-1' })
      .expect(422);
    await api(app, member)
      .post('/me/password', { currentPassword: PASSWORD, newPassword: 'new-password-1' })
      .expect(200);
    await refresh(member.cookie).expect(200);
    await refresh(otherDevice.cookie).expect(401);
    await login(app, email, 'new-password-1');
  });

  it('cuts off disabled users immediately', async () => {
    const member = await createMember(app, admin, 'Disabled');
    await api(app, member).get('/me').expect(200);
    await api(app, admin).patch(`/users/${member.userId}`, { status: 'DISABLED' }).expect(200);
    await api(app, member).get('/me').expect(401);
    await refresh(member.cookie).expect(401);
  });
});
