import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthSession } from '@leados/shared';
import { api, ApiError, buildQuery, refreshSession, session } from './api-client';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const sessionFor = (token: string): AuthSession => ({
  accessToken: token,
  expiresIn: 900,
  user: {
    id: 'u1',
    firstName: 'Asha',
    lastName: 'Rao',
    email: 'asha@example.com',
    role: 'ADMIN',
    status: 'ACTIVE',
    lastLoginAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
});

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  session.set(sessionFor('old-token'));
});
afterEach(() => {
  vi.unstubAllGlobals();
  session.clear();
});

const authHeader = (call: Parameters<typeof fetch> | undefined) =>
  new Headers((call?.[1] as RequestInit | undefined)?.headers).get('Authorization');

describe('api client', () => {
  it('unwraps the success envelope and keeps pagination meta', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        success: true,
        data: [{ id: 'l1' }],
        meta: { page: 1, limit: 25, total: 1, totalPages: 1 },
      }),
    );
    const res = await api.list<{ id: string }>('/leads', {
      status: ['NEW', 'CONTACTED'],
      search: '',
    });
    expect(res.data).toEqual([{ id: 'l1' }]);
    expect(res.meta?.total).toBe(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/leads?status=NEW%2CCONTACTED');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer old-token');
  });

  it('throws a typed ApiError with details from the error envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Check the highlighted fields.',
            details: { email: ['Enter a valid email address'] },
          },
        },
        422,
      ),
    );
    const err = await api.post('/leads', { firstName: 'A' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 422,
      message: 'Check the highlighted fields.',
      details: { email: ['Enter a valid email address'] },
    });
  });

  it('shares a single refresh between concurrent 401s and retries each request once', async () => {
    let refreshCalls = 0;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === '/api/auth/refresh') {
        refreshCalls++;
        expect(new Headers(init?.headers).get('X-Requested-With')).toBe('fetch');
        expect(init?.credentials).toBe('same-origin');
        await new Promise((r) => setTimeout(r, 10));
        return json({ success: true, data: sessionFor('new-token') });
      }
      const auth = new Headers(init?.headers).get('Authorization');
      if (auth === 'Bearer new-token') return json({ success: true, data: { url } });
      return json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Expired' } }, 401);
    });

    const results = await Promise.all([api.get('/leads'), api.get('/tasks'), api.get('/me')]);
    expect(refreshCalls).toBe(1);
    expect(results).toEqual([{ url: '/api/leads' }, { url: '/api/tasks' }, { url: '/api/me' }]);
    expect(session.getToken()).toBe('new-token');
    // 3 failed + 1 refresh + 3 retries
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  it('clears the session when the refresh fails', async () => {
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);
    fetchMock.mockImplementation(async (input) =>
      String(input) === '/api/auth/refresh'
        ? json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No session' } }, 401)
        : json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Expired' } }, 401),
    );
    await expect(api.get('/leads')).rejects.toMatchObject({ status: 401 });
    expect(session.getToken()).toBeNull();
    expect(listener).toHaveBeenCalledWith(null);
    unsubscribe();
  });

  it('retries only once when the retried request is still unauthorised', async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input) === '/api/auth/refresh'
        ? json({ success: true, data: sessionFor('new-token') })
        : json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Nope' } }, 401),
    );
    await expect(api.get('/leads')).rejects.toBeInstanceOf(ApiError);
    const leadCalls = fetchMock.mock.calls.filter((c) => String(c[0]) === '/api/leads');
    expect(leadCalls).toHaveLength(2);
    expect(authHeader(leadCalls[1])).toBe('Bearer new-token');
  });

  it('does not try to refresh for auth endpoints', async () => {
    fetchMock.mockResolvedValueOnce(
      json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Wrong email or password.' } },
        401,
      ),
    );
    await expect(api.post('/auth/login', {})).rejects.toMatchObject({
      message: 'Wrong email or password.',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('turns network failures into a friendly error', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(api.get('/leads')).rejects.toMatchObject({ code: 'NETWORK_ERROR', status: 0 });
  });

  it('refreshSession returns null without throwing when offline', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(refreshSession()).resolves.toBeNull();
  });

  it('builds query strings skipping empty values', () => {
    expect(buildQuery({ a: 1, b: undefined, c: '', d: null, e: ['x', 'y'], f: [] })).toBe(
      '?a=1&e=x%2Cy',
    );
    expect(buildQuery({})).toBe('');
  });
});
