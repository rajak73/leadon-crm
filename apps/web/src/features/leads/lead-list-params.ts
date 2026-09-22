import { useCallback, useMemo } from 'react';
import {
  LEAD_SORT_FIELDS,
  LEAD_SOURCES,
  LEAD_STATUSES,
  type LeadSource,
  type LeadStatus,
} from '@leados/shared';
import type { QueryParams } from '@/lib/api-client';
import { intParam, listParam, pageParam, useUrlParams } from './url-params';

export const LEADS_PAGE_SIZE = 25;
export type LeadSortField = (typeof LEAD_SORT_FIELDS)[number];

export interface LeadFilterState {
  search: string;
  status: LeadStatus[];
  source: LeadSource[];
  /** '' = everyone, or 'me' | 'unassigned' | a user id. */
  assignedToId: string;
  tag: string;
  scoreMin: number | undefined;
  scoreMax: number | undefined;
}

const FILTER_KEYS = [
  'search',
  'status',
  'source',
  'assignedToId',
  'tag',
  'scoreMin',
  'scoreMax',
] as const;

/** Leads list state (filters, sort, page), all kept in the URL. */
export function useLeadListParams() {
  const { params, update } = useUrlParams();

  const filters: LeadFilterState = {
    search: params.get('search') ?? '',
    status: listParam(params, 'status', LEAD_STATUSES),
    source: listParam(params, 'source', LEAD_SOURCES),
    assignedToId: params.get('assignedToId') ?? '',
    tag: params.get('tag') ?? '',
    scoreMin: intParam(params, 'scoreMin', 0, 100),
    scoreMax: intParam(params, 'scoreMax', 0, 100),
  };
  const sortByRaw = params.get('sortBy');
  const sortBy: LeadSortField = (LEAD_SORT_FIELDS as ReadonlyArray<string>).includes(
    sortByRaw ?? '',
  )
    ? (sortByRaw as LeadSortField)
    : 'createdAt';
  const sortOrder: 'asc' | 'desc' = params.get('sortOrder') === 'asc' ? 'asc' : 'desc';
  const page = pageParam(params);

  const hasFilters =
    Boolean(filters.search.trim() || filters.assignedToId || filters.tag.trim()) ||
    filters.status.length > 0 ||
    filters.source.length > 0 ||
    filters.scoreMin !== undefined ||
    filters.scoreMax !== undefined;

  // Filters as API query params (also used for the CSV export).
  const filterQuery: QueryParams = {
    search: filters.search.trim() || undefined,
    status: filters.status,
    source: filters.source,
    assignedToId: filters.assignedToId || undefined,
    tag: filters.tag.trim() || undefined,
    scoreMin: filters.scoreMin,
    scoreMax: filters.scoreMax,
    sortBy,
    sortOrder,
  };
  const key = JSON.stringify({ ...filterQuery, page });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures every value in filterQuery
  const stableFilterQuery = useMemo(() => filterQuery, [key]);
  const query = useMemo<QueryParams>(
    () => ({ ...stableFilterQuery, page, limit: LEADS_PAGE_SIZE }),
    [stableFilterQuery, page],
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
          : field === 'firstName'
            ? 'asc'
            : 'desc';
      update({ sortBy: field, sortOrder: order });
    },
    [sortBy, sortOrder, update],
  );

  const setPage = useCallback((p: number) => update({ page: p <= 1 ? null : String(p) }), [update]);

  return {
    filters,
    filterQuery: stableFilterQuery,
    query,
    /** Changes whenever the visible rows could change. */
    resetKey: key,
    page,
    sortBy,
    sortOrder,
    hasFilters,
    update,
    clearFilters,
    setSort,
    setPage,
  };
}
