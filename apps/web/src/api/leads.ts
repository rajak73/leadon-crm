import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/toast';
import type { z } from 'zod';
import type {
  AiScore,
  BulkLeadsInput,
  Contact,
  convertLeadSchema,
  createLeadSchema,
  Deal,
  ImportResult,
  Lead,
  LeadDetail,
  updateLeadSchema,
} from '@leados/shared';
import { api, type Paged, type QueryParams } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

export type LeadUpdate = z.input<typeof updateLeadSchema>;

export function useLeads(params: QueryParams) {
  return useQuery({
    queryKey: qk.leads.list(params),
    queryFn: ({ signal }) => api.list<Lead>('/leads', params, signal),
    placeholderData: keepPreviousData,
  });
}

export function useLead(id: string | undefined) {
  return useQuery({
    queryKey: qk.leads.detail(id ?? ''),
    queryFn: () => api.get<LeadDetail>(`/leads/${id}`),
    enabled: Boolean(id),
  });
}

export function useLeadScores(id: string) {
  return useQuery({
    queryKey: qk.leads.scores(id),
    queryFn: () => api.get<AiScore[]>(`/leads/${id}/scores`),
  });
}

export function useLeadTags() {
  return useQuery({
    queryKey: qk.leads.tags(),
    queryFn: () => api.get<string[]>('/leads/tags'),
    staleTime: 60_000,
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof createLeadSchema>) => api.post<Lead>('/leads', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.leads.all }),
  });
}

type LeadLists = Paged<Lead[]>;

/**
 * Updates a lead. Changes are applied optimistically to the detail view and
 * every cached list, then rolled back (with a toast) if the server refuses.
 */
export function useUpdateLead(options: { optimistic?: boolean } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: LeadUpdate & { id: string }) =>
      api.patch<Lead>(`/leads/${id}`, body),
    onMutate: async ({ id, ...body }) => {
      if (!options.optimistic) return undefined;
      await qc.cancelQueries({ queryKey: qk.leads.all });
      const detail = qc.getQueryData<LeadDetail>(qk.leads.detail(id));
      const lists = qc.getQueriesData<LeadLists>({ queryKey: qk.leads.lists() });
      const patch = body as Partial<Lead>;
      if (detail) qc.setQueryData<LeadDetail>(qk.leads.detail(id), { ...detail, ...patch });
      qc.setQueriesData<LeadLists>({ queryKey: qk.leads.lists() }, (old) =>
        old ? { ...old, data: old.data.map((l) => (l.id === id ? { ...l, ...patch } : l)) } : old,
      );
      return { detail, lists };
    },
    onError: (err, { id }, ctx) => {
      if (!ctx) return;
      if (ctx.detail) qc.setQueryData(qk.leads.detail(id), ctx.detail);
      ctx.lists.forEach(([key, data]) => qc.setQueryData(key, data));
      notify.error(err, "We couldn't update the lead.");
    },
    onSettled: (_d, _e, { id }) => {
      void qc.invalidateQueries({ queryKey: qk.leads.all });
      void qc.invalidateQueries({ queryKey: qk.activities.list({ leadId: id }) });
    },
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/leads/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.leads.all }),
  });
}

export function useConvertLead(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof convertLeadSchema>) =>
      api.post<{ lead: Lead; contact: Contact; deal: Deal | null }>(`/leads/${id}/convert`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.leads.all });
      void qc.invalidateQueries({ queryKey: qk.contacts.all });
      void qc.invalidateQueries({ queryKey: qk.deals.all });
      void qc.invalidateQueries({ queryKey: qk.pipelines.all });
      void qc.invalidateQueries({ queryKey: qk.activities.all });
    },
  });
}

export function useRescoreLead(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<AiScore>(`/leads/${id}/score`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.leads.detail(id) });
      void qc.invalidateQueries({ queryKey: qk.leads.scores(id) });
      void qc.invalidateQueries({ queryKey: qk.leads.lists() });
    },
  });
}

export function useBulkLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BulkLeadsInput) => api.post<{ affected: number }>('/leads/bulk', body),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.leads.all }),
  });
}

export function useImportLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.post<ImportResult>('/leads/import', form);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.leads.all }),
  });
}
