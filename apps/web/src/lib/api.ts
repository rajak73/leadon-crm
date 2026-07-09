const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

let token: string | null = localStorage.getItem('leados_token');
let orgId: string | null = localStorage.getItem('leados_org');

export function setToken(t: string | null) {
  token = t;
  if (t) localStorage.setItem('leados_token', t);
  else localStorage.removeItem('leados_token');
}
export function setOrgId(id: string | null) {
  orgId = id;
  if (id) localStorage.setItem('leados_org', id);
  else localStorage.removeItem('leados_org');
}
export function getOrgId() {
  return orgId;
}

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request<T>(method: string, path: string, body?: unknown, withOrg = true): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (withOrg && orgId) headers['X-Org-Id'] = orgId;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, (data as any).error || 'Request failed', (data as any).details);
  }
  return data as T;
}

export const api = {
  get: <T>(p: string, withOrg = true) => request<T>('GET', p, undefined, withOrg),
  post: <T>(p: string, b?: unknown, withOrg = true) => request<T>('POST', p, b, withOrg),
  patch: <T>(p: string, b?: unknown, withOrg = true) => request<T>('PATCH', p, b, withOrg),
  del: <T>(p: string, withOrg = true) => request<T>('DELETE', p, undefined, withOrg),
};
