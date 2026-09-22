import { vi } from 'vitest';
import { jsonResponse } from './utils';

type Handler = (url: string, init?: RequestInit) => unknown;

/**
 * Stubs global fetch. `routes` maps "METHOD /path" (without /api) to a response
 * body; unmatched requests get `{ success: true, data: null }`.
 */
export function mockFetch(routes: Record<string, unknown | Handler> = {}) {
  const fn = vi.fn(async (input: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const path = input.replace(/^\/api/, '').split('?')[0];
    const hit = routes[`${method} ${path}`];
    const data = typeof hit === 'function' ? (hit as Handler)(input, init) : hit;
    if (data instanceof Response) return data;
    return jsonResponse({ success: true, data: data ?? null });
  });
  vi.stubGlobal('fetch', fn);
  return {
    fn,
    /** Parsed JSON bodies of requests matching METHOD and path. */
    bodies(method: string, path: string): unknown[] {
      return fn.mock.calls
        .filter(
          ([url, init]) =>
            (init?.method ?? 'GET') === method && url.replace(/^\/api/, '').split('?')[0] === path,
        )
        .map(([, init]) => (init?.body ? JSON.parse(String(init.body)) : undefined));
    },
  };
}
