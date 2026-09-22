import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { DashboardSummary, SearchResults } from '@leados/shared';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

export type DashboardRange = DashboardSummary['range'];

export function useDashboard(range: DashboardRange) {
  return useQuery({
    queryKey: qk.dashboard(range),
    queryFn: () => api.get<DashboardSummary>('/analytics/dashboard', { range }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

export function useSearch(q: string, limit = 5) {
  const term = q.trim();
  return useQuery({
    queryKey: qk.search(`${term}:${limit}`),
    queryFn: ({ signal }) => api.get<SearchResults>('/search', { q: term, limit }, signal),
    enabled: term.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}
