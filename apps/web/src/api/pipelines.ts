import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/toast';
import type { z } from 'zod';
import type {
  createDealSchema,
  createPipelineSchema,
  Deal,
  MoveDealInput,
  Pipeline,
  PipelineBoard,
  updateDealSchema,
  updatePipelineSchema,
} from '@leados/shared';
import { api, type QueryParams } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

export function usePipelines() {
  return useQuery({
    queryKey: qk.pipelines.list(),
    queryFn: () => api.get<Pipeline[]>('/pipelines'),
    staleTime: 60_000,
  });
}

export function usePipelineBoard(id: string | undefined) {
  return useQuery({
    queryKey: qk.pipelines.board(id ?? ''),
    queryFn: () => api.get<PipelineBoard>(`/pipelines/${id}/board`),
    enabled: Boolean(id),
  });
}

export function useCreatePipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof createPipelineSchema>) =>
      api.post<Pipeline>('/pipelines', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.pipelines.all }),
  });
}

export function useUpdatePipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: z.input<typeof updatePipelineSchema> & { id: string }) =>
      api.patch<Pipeline>(`/pipelines/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.pipelines.all }),
  });
}

export function useDeletePipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/pipelines/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.pipelines.all }),
  });
}

// ─── Deals ───────────────────────────────────────────────────────────────────

export function useDeals(params: QueryParams, enabled = true) {
  return useQuery({
    queryKey: qk.deals.list(params),
    queryFn: ({ signal }) => api.list<Deal>('/deals', params, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useDeal(id: string | undefined) {
  return useQuery({
    queryKey: qk.deals.detail(id ?? ''),
    queryFn: () => api.get<Deal>(`/deals/${id}`),
    enabled: Boolean(id),
  });
}

function invalidateDealData(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: qk.deals.all });
  void qc.invalidateQueries({ queryKey: qk.pipelines.all });
  void qc.invalidateQueries({ queryKey: qk.leads.all });
  void qc.invalidateQueries({ queryKey: qk.contacts.all });
}

export function useCreateDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof createDealSchema>) => api.post<Deal>('/deals', body),
    onSuccess: () => invalidateDealData(qc),
  });
}

export function useUpdateDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: z.input<typeof updateDealSchema> & { id: string }) =>
      api.patch<Deal>(`/deals/${id}`, body),
    onSuccess: (deal) => {
      qc.setQueryData(qk.deals.detail(deal.id), deal);
      invalidateDealData(qc);
      void qc.invalidateQueries({ queryKey: qk.activities.list({ dealId: deal.id }) });
    },
  });
}

export function useDeleteDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/deals/${id}`),
    onSuccess: () => invalidateDealData(qc),
  });
}

/**
 * Moves a deal to another stage. The board updates instantly; if the server
 * refuses, the card jumps back and a toast explains why.
 */
export function useMoveDeal(pipelineId: string) {
  const qc = useQueryClient();
  const key = qk.pipelines.board(pipelineId);
  return useMutation({
    mutationFn: ({ dealId, ...body }: MoveDealInput & { dealId: string }) =>
      api.post<Deal>(`/deals/${dealId}/move`, body),
    onMutate: async ({ dealId, stageId, lostReason }) => {
      const detailKey = qk.deals.detail(dealId);
      await Promise.all([
        qc.cancelQueries({ queryKey: key }),
        qc.cancelQueries({ queryKey: detailKey }),
      ]);
      const previous = qc.getQueryData<PipelineBoard>(key);
      const previousDeal = qc.getQueryData<Deal>(detailKey);
      const stage =
        previous?.pipeline.stages.find((s) => s.id === stageId) ??
        qc
          .getQueryData<Pipeline[]>(qk.pipelines.list())
          ?.find((p) => p.id === pipelineId)
          ?.stages.find((s) => s.id === stageId);
      const apply = (d: Deal): Deal =>
        stage
          ? {
              ...d,
              stage: { id: stage.id, name: stage.name, color: stage.color },
              status: stage.isWon ? 'WON' : stage.isLost ? 'LOST' : 'OPEN',
              lostReason: stage.isLost ? (lostReason ?? null) : null,
            }
          : d;
      if (previous) {
        qc.setQueryData<PipelineBoard>(key, {
          ...previous,
          deals: previous.deals.map((d) => (d.id === dealId ? apply(d) : d)),
        });
      }
      // The deal page reads the detail query; keep its stage select in step too.
      if (previousDeal) qc.setQueryData<Deal>(detailKey, apply(previousDeal));
      return { previous, previousDeal };
    },
    onSuccess: (deal) => {
      qc.setQueryData(qk.deals.detail(deal.id), deal);
    },
    onError: (err, { dealId }, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      if (ctx?.previousDeal) qc.setQueryData(qk.deals.detail(dealId), ctx.previousDeal);
      notify.error(err, "We couldn't move the deal.");
    },
    onSettled: (deal) => {
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: qk.deals.all });
      if (deal) void qc.invalidateQueries({ queryKey: qk.activities.list({ dealId: deal.id }) });
    },
  });
}
