import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/toast';
import type { z } from 'zod';
import type {
  createWorkflowSchema,
  updateWorkflowSchema,
  Workflow,
  WorkflowRun,
  WorkflowTrigger,
} from '@leados/shared';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

export type WorkflowFieldType = 'string' | 'number' | 'enum' | 'tags';
export interface WorkflowFieldMeta {
  key: string;
  label: string;
  type: WorkflowFieldType;
  options?: string[];
}
export interface WorkflowMeta {
  fields: Record<WorkflowTrigger, WorkflowFieldMeta[]>;
}

export function useWorkflows() {
  return useQuery({
    queryKey: qk.workflows.list(),
    queryFn: () => api.get<Workflow[]>('/workflows'),
  });
}

export function useWorkflow(id: string | undefined) {
  return useQuery({
    queryKey: qk.workflows.detail(id ?? ''),
    queryFn: () => api.get<Workflow>(`/workflows/${id}`),
    enabled: Boolean(id),
  });
}

export function useWorkflowMeta() {
  return useQuery({
    queryKey: qk.workflows.meta(),
    queryFn: () => api.get<WorkflowMeta>('/workflows/meta'),
    staleTime: Infinity,
  });
}

export function useWorkflowRuns(id: string, page: number) {
  return useQuery({
    queryKey: qk.workflows.runs(id, page),
    queryFn: () => api.list<WorkflowRun>(`/workflows/${id}/runs`, { page, limit: 20 }),
    placeholderData: keepPreviousData,
  });
}

export function useCreateWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof createWorkflowSchema>) =>
      api.post<Workflow>('/workflows', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.workflows.all }),
  });
}

export function useUpdateWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: z.input<typeof updateWorkflowSchema> & { id: string }) =>
      api.patch<Workflow>(`/workflows/${id}`, body),
    onSuccess: (wf) => {
      qc.setQueryData(qk.workflows.detail(wf.id), wf);
      void qc.invalidateQueries({ queryKey: qk.workflows.list() });
    },
  });
}

/** Active switch in the list: optimistic, rolls back with a toast. */
export function useToggleWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch<Workflow>(`/workflows/${id}`, { isActive }),
    onMutate: async ({ id, isActive }) => {
      await qc.cancelQueries({ queryKey: qk.workflows.list() });
      const previous = qc.getQueryData<Workflow[]>(qk.workflows.list());
      qc.setQueryData<Workflow[]>(qk.workflows.list(), (old) =>
        old?.map((w) => (w.id === id ? { ...w, isActive } : w)),
      );
      return { previous };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.workflows.list(), ctx.previous);
      notify.error(err, "We couldn't update the workflow.");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.workflows.all }),
  });
}

export function useDeleteWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/workflows/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.workflows.all }),
  });
}
