import type { AuthSession, ErrorCode, PageMeta } from '@leados/shared';

// ─── Errors ──────────────────────────────────────────────────────────────────

export type ApiErrorCode = ErrorCode | 'NETWORK_ERROR';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: Record<string, string[]>;

  constructor(
    code: ApiErrorCode,
    message: string,
    status: number,
    details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** A message that is always safe to show to a person. */
export function errorMessage(
  e: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (isApiError(e)) return e.message || fallback;
  return fallback;
}

// ─── Session (access token lives in memory only) ─────────────────────────────

type SessionListener = (session: AuthSession | null) => void;

let accessToken: string | null = null;
let refreshInFlight: Promise<AuthSession | null> | null = null;
const listeners = new Set<SessionListener>();

export const session = {
  getToken: () => accessToken,
  /** Store a new session (login, setup, refresh) and notify listeners. */
  set(next: AuthSession) {
    accessToken = next.accessToken;
    listeners.forEach((l) => l(next));
  },
  /** Forget the session; listeners redirect to the login screen. */
  clear() {
    const had = accessToken !== null;
    accessToken = null;
    if (had) listeners.forEach((l) => l(null));
  },
  subscribe(listener: SessionListener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

const API_BASE = '/api';
const AUTH_HEADERS = { 'X-Requested-With': 'fetch' };

/**
 * Exchange the refresh cookie for a new access token. Concurrent callers share
 * one in-flight request so the refresh token is only rotated once.
 */
export function refreshSession(): Promise<AuthSession | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: AUTH_HEADERS,
          credentials: 'same-origin',
        });
        if (!res.ok) return null;
        const body = (await res.json()) as { success: boolean; data?: AuthSession };
        if (!body.success || !body.data) return null;
        session.set(body.data);
        return body.data;
      } catch {
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

export async function logoutRequest(): Promise<void> {
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      credentials: 'same-origin',
    });
  } finally {
    session.clear();
  }
}

// ─── Requests ────────────────────────────────────────────────────────────────

export type QueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | ReadonlyArray<string | number>;
export type QueryParams = Record<string, QueryValue>;

export function buildQuery(params?: QueryParams): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length) search.set(key, value.join(','));
    } else {
      search.set(key, String(value));
    }
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  query?: QueryParams;
  body?: unknown;
  signal?: AbortSignal;
}

// Auth endpoints never trigger a refresh-and-retry (it would loop or mask errors).
const isAuthPath = (path: string) => path.startsWith('/auth/');

async function authedFetch(
  path: string,
  init: RequestInit,
  allowRetry: boolean,
): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = accessToken;
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (isAuthPath(path)) headers.set('X-Requested-With', 'fetch');

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: 'same-origin' });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new ApiError(
      'NETWORK_ERROR',
      "We couldn't reach the server. Check your connection and try again.",
      0,
    );
  }

  if (res.status === 401 && allowRetry && !isAuthPath(path)) {
    // Another request may already have refreshed while this one was in flight.
    const refreshed = accessToken && accessToken !== token ? true : Boolean(await refreshSession());
    if (refreshed) return authedFetch(path, init, false);
    session.clear();
  }
  return res;
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as {
      error?: { code: ErrorCode; message: string; details?: Record<string, string[]> };
    };
    if (body.error)
      return new ApiError(body.error.code, body.error.message, res.status, body.error.details);
  } catch {
    /* not JSON */
  }
  if (res.status === 401)
    return new ApiError('UNAUTHORIZED', 'Your session has ended. Please sign in again.', 401);
  if (res.status >= 500)
    return new ApiError(
      'INTERNAL_ERROR',
      'The server ran into a problem. Please try again in a moment.',
      res.status,
    );
  return new ApiError('INTERNAL_ERROR', 'Something went wrong. Please try again.', res.status);
}

export interface Paged<T> {
  data: T;
  meta?: PageMeta;
}

async function send<T>(path: string, opts: RequestOptions = {}): Promise<Paged<T>> {
  const { method = 'GET', query, body, signal } = opts;
  const headers: Record<string, string> = { Accept: 'application/json' };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await authedFetch(
    `${path}${buildQuery(query)}`,
    { method, headers, body: payload, signal },
    true,
  );
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return { data: null as T };

  const json = (await res.json()) as { success: boolean; data: T; meta?: PageMeta };
  if (!json.success) throw await toApiError(res);
  return { data: json.data, meta: json.meta };
}

export const api = {
  get: <T>(path: string, query?: QueryParams, signal?: AbortSignal) =>
    send<T>(path, { query, signal }).then((r) => r.data),
  /** Paginated list: keeps `meta`. */
  list: <T>(path: string, query?: QueryParams, signal?: AbortSignal) =>
    send<T[]>(path, { query, signal }).then((r) => ({ data: r.data, meta: r.meta })),
  post: <T>(path: string, body?: unknown) =>
    send<T>(path, { method: 'POST', body }).then((r) => r.data),
  patch: <T>(path: string, body?: unknown) =>
    send<T>(path, { method: 'PATCH', body }).then((r) => r.data),
  delete: <T = null>(path: string) => send<T>(path, { method: 'DELETE' }).then((r) => r.data),
};

/** Downloads a file (e.g. CSV export) with the auth header and saves it via a blob URL. */
export async function downloadFile(
  path: string,
  query: QueryParams | undefined,
  fallbackName: string,
) {
  const res = await authedFetch(`${path}${buildQuery(query)}`, { method: 'GET' }, true);
  if (!res.ok) throw await toApiError(res);
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const name = match?.[1] ? decodeURIComponent(match[1]) : fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
