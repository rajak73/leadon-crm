import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Activity, Note } from '@leados/shared';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

export type RecordScope = { leadId: string } | { contactId: string } | { dealId: string };

const PAGE = 30;

export function useActivities(scope: RecordScope) {
  return useInfiniteQuery({
    queryKey: qk.activities.list(scope),
    queryFn: ({ pageParam }) =>
      api.get<Activity[]>('/activities', { ...scope, limit: PAGE, before: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.length < PAGE ? undefined : last[last.length - 1]?.createdAt),
  });
}

export function useNotes(scope: RecordScope) {
  return useQuery({
    queryKey: qk.notes.list(scope),
    queryFn: () => api.get<Note[]>('/notes', scope),
  });
}

function scopeToNote(scope: RecordScope) {
  if ('leadId' in scope) return { relatedLeadId: scope.leadId };
  if ('contactId' in scope) return { relatedContactId: scope.contactId };
  return { relatedDealId: scope.dealId };
}

function useInvalidateTimeline(scope: RecordScope) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: qk.notes.list(scope) });
    void qc.invalidateQueries({ queryKey: qk.activities.list(scope) });
    if ('leadId' in scope) void qc.invalidateQueries({ queryKey: qk.leads.detail(scope.leadId) });
  };
}

export function useCreateNote(scope: RecordScope) {
  const invalidate = useInvalidateTimeline(scope);
  return useMutation({
    mutationFn: (content: string) => api.post<Note>('/notes', { content, ...scopeToNote(scope) }),
    onSuccess: invalidate,
  });
}

export function useUpdateNote(scope: RecordScope) {
  const invalidate = useInvalidateTimeline(scope);
  return useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      api.patch<Note>(`/notes/${id}`, { content }),
    onSuccess: invalidate,
  });
}

export function useDeleteNote(scope: RecordScope) {
  const invalidate = useInvalidateTimeline(scope);
  return useMutation({
    mutationFn: (id: string) => api.delete(`/notes/${id}`),
    onSuccess: invalidate,
  });
}
