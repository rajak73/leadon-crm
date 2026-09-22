import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

export type ParamPatch = Record<string, string | ReadonlyArray<string> | null | undefined>;

export interface UpdateOptions {
  /** Keep the current page (default: any change except to `page` itself resets to page 1). */
  keepPage?: boolean;
  /** Replace the history entry instead of pushing (used while typing). */
  replace?: boolean;
}

/** Read/write list state (filters, sort, page) in the URL query string. */
export function useUrlParams() {
  const [params, setParams] = useSearchParams();

  const update = useCallback(
    (patch: ParamPatch, opts: UpdateOptions = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, raw] of Object.entries(patch)) {
            const value = typeof raw === 'string' || raw == null ? raw : raw.join(',');
            if (value == null || value.trim() === '') next.delete(key);
            else next.set(key, value);
          }
          if (!opts.keepPage && !('page' in patch)) next.delete('page');
          return next;
        },
        { replace: opts.replace },
      );
    },
    [setParams],
  );

  return { params, update };
}

export function listParam<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: ReadonlyArray<T>,
): T[] {
  const raw = params.get(key);
  if (!raw) return [];
  return raw.split(',').filter((v): v is T => (allowed as ReadonlyArray<string>).includes(v));
}

export function intParam(
  params: URLSearchParams,
  key: string,
  min: number,
  max: number,
): number | undefined {
  const raw = params.get(key);
  if (raw === null || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
}

export function pageParam(params: URLSearchParams): number {
  return intParam(params, 'page', 1, 100_000) ?? 1;
}
