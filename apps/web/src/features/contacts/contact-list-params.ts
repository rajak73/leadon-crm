import { useCallback, useMemo } from 'react';
import type { QueryParams } from '@/lib/api-client';
import { pageParam, useUrlParams } from '@/features/leads/url-params';

export const CONTACTS_PAGE_SIZE = 25;
const SORT_FIELDS = ['createdAt', 'updatedAt', 'lastActivityAt', 'firstName', 'company'] as const;
type SortField = (typeof SORT_FIELDS)[number];
const FILTER_KEYS = ['search', 'assignedToId', 'tag'] as const;

/** Contacts list state (search, owner, tag, sort, page), kept in the URL. */
export function useContactListParams() {
  const { params, update } = useUrlParams();
  const search = params.get('search') ?? '';
  const assignedToId = params.get('assignedToId') ?? '';
  const tag = params.get('tag') ?? '';
  const sortByRaw = params.get('sortBy') ?? '';
  const sortBy: SortField = (SORT_FIELDS as ReadonlyArray<string>).includes(sortByRaw)
    ? (sortByRaw as SortField)
    : 'createdAt';
  const sortOrder: 'asc' | 'desc' = params.get('sortOrder') === 'asc' ? 'asc' : 'desc';
  const page = pageParam(params);
  const hasFilters = Boolean(search.trim() || assignedToId || tag.trim());

  const query = useMemo<QueryParams>(
    () => ({
      search: search.trim() || undefined,
      assignedToId: assignedToId || undefined,
      tag: tag.trim() || undefined,
      sortBy,
      sortOrder,
      page,
      limit: CONTACTS_PAGE_SIZE,
    }),
    [search, assignedToId, tag, sortBy, sortOrder, page],
  );

  const clearFilters = useCallback(
    () => update(Object.fromEntries(FILTER_KEYS.map((k) => [k, null]))),
    [update],
  );
  const setSort = useCallback(
    (field: string) => {
      const order =
        field === sortBy
          ? sortOrder === 'asc'
            ? 'desc'
            : 'asc'
          : field === 'firstName' || field === 'company'
            ? 'asc'
            : 'desc';
      update({ sortBy: field, sortOrder: order });
    },
    [sortBy, sortOrder, update],
  );
  const setPage = useCallback((p: number) => update({ page: p <= 1 ? null : String(p) }), [update]);

  return {
    filters: { search, assignedToId, tag },
    query,
    sortBy,
    sortOrder,
    hasFilters,
    update,
    clearFilters,
    setSort,
    setPage,
  };
}
