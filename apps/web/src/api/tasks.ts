import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/toast';
import type { z } from 'zod';
import type { createTaskSchema, Task, updateTaskSchema } from '@leados/shared';
import { api, type Paged, type QueryParams } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

export function useTasks(params: QueryParams, enabled = true) {
  return useQuery({
    queryKey: qk.tasks.list(params),
    queryFn: ({ signal }) => api.list<Task>('/tasks', params, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

function invalidateTaskData(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: qk.tasks.all });
  void qc.invalidateQueries({ queryKey: qk.activities.all });
  void qc.invalidateQueries({ queryKey: qk.leads.all });
  void qc.invalidateQueries({ queryKey: ['dashboard'] });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof createTaskSchema>) => api.post<Task>('/tasks', body),
    onSuccess: () => invalidateTaskData(qc),
  });
}

export type TaskUpdate = z.input<typeof updateTaskSchema> & { id: string };

/** Updates a task. Status changes (quick complete) are optimistic with rollback. */
export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: TaskUpdate) => api.patch<Task>(`/tasks/${id}`, body),
    onMutate: async ({ id, status }) => {
      if (!status) return undefined;
      await qc.cancelQueries({ queryKey: qk.tasks.all });
      const lists = qc.getQueriesData<Paged<Task[]>>({ queryKey: qk.tasks.all });
      const completedAt = status === 'COMPLETED' ? new Date().toISOString() : null;
      qc.setQueriesData<Paged<Task[]>>({ queryKey: qk.tasks.all }, (old) =>
        old?.data
          ? {
              ...old,
              data: old.data.map((t) =>
                t.id === id
                  ? {
                      ...t,
                      status,
                      completedAt,
                      isOverdue: status === 'COMPLETED' ? false : t.isOverdue,
                    }
                  : t,
              ),
            }
          : old,
      );
      return { lists };
    },
    onError: (err, _vars, ctx) => {
      ctx?.lists.forEach(([key, data]) => qc.setQueryData(key, data));
      notify.error(err, "We couldn't update the task.");
    },
    onSettled: () => invalidateTaskData(qc),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/tasks/${id}`),
    onSuccess: () => invalidateTaskData(qc),
  });
}
