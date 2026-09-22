import http from 'node:http';
import request from 'supertest';
import { afterAll } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { flush } from '../src/lib/queue.js';

export { flush, prisma };

export const PASSWORD = 'correct-horse-battery';

/** A listening server for supertest. */
export type TestApp = http.Server;

/**
 * The app on one server per test file, listening on 127.0.0.1 for the whole file. (Passing the
 * Express app to supertest instead opens and closes a server per request; with test files
 * running in parallel processes a request can then reach another file's server that just
 * reused the port.)
 */
export function testApp(options: Parameters<typeof createApp>[0] = {}): TestApp {
  const server = http.createServer(
    createApp({ authRateLimit: 10_000, globalRateLimit: 100_000, ...options }),
  );
  server.listen(0, '127.0.0.1');
  server.unref();
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return server;
}

export interface Session {
  token: string;
  userId: string;
  cookie: string;
}

const cookieFrom = (res: request.Response) => {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return (
    (raw ?? []).map((c) => c.split(';')[0] ?? '').find((c) => c.startsWith('leados_rt=')) ?? ''
  );
};

export async function setupAdmin(app: TestApp, email = 'admin@example.com'): Promise<Session> {
  const res = await request(app)
    .post('/api/auth/setup')
    .send({
      companyName: 'Acme Traders',
      firstName: 'Asha',
      lastName: 'Rao',
      email,
      password: PASSWORD,
    })
    .expect(201);
  return {
    token: res.body.data.accessToken,
    userId: res.body.data.user.id,
    cookie: cookieFrom(res),
  };
}

export async function login(app: TestApp, email: string, password = PASSWORD): Promise<Session> {
  const res = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
  return {
    token: res.body.data.accessToken,
    userId: res.body.data.user.id,
    cookie: cookieFrom(res),
  };
}

export async function createMember(
  app: TestApp,
  admin: Session,
  firstName = 'Mohan',
  role: 'ADMIN' | 'MEMBER' = 'MEMBER',
): Promise<Session> {
  const email = `${firstName.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  await request(app)
    .post('/api/users')
    .set(auth(admin))
    .send({ firstName, email, password: PASSWORD, role })
    .expect(201);
  return login(app, email);
}

export const auth = (s: Session) => ({ authorization: `Bearer ${s.token}` });

/** Small typed-ish wrapper: api(app, session).post('/leads', body). */
export function api(app: TestApp, s: Session) {
  const h = auth(s);
  return {
    get: (url: string) => request(app).get(`/api${url}`).set(h),
    post: (url: string, body?: object) =>
      request(app)
        .post(`/api${url}`)
        .set(h)
        .send(body ?? {}),
    patch: (url: string, body: object) => request(app).patch(`/api${url}`).set(h).send(body),
    delete: (url: string) => request(app).delete(`/api${url}`).set(h),
  };
}

export { cookieFrom };
