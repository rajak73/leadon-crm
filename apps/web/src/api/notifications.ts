import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Notification } from '@leados/shared';
import { api, type Paged } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

export function useNotifications(params: { page: number; unreadOnly?: boolean; limit?: number }) {
  return useQuery({
    queryKey: qk.notifications.list(params),
    queryFn: () => api.list<Notification>('/notifications', params),
    placeholderData: keepPreviousData,
  });
}

/** Unread badge count, polled every 30 seconds while the tab is visible. */
export function useUnreadCount() {
  return useQuery({
    queryKey: qk.notifications.unreadCount(),
    queryFn: () => api.get<{ count: number }>('/notifications/unread-count'),
    refetchInterval: 30_000,
    select: (d) => d.count,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<null>(`/notifications/${id}/read`),
    onMutate: (id) => {
      const now = new Date().toISOString();
      qc.setQueriesData<Paged<Notification[]>>({ queryKey: ['notifications', 'list'] }, (old) =>
        old
          ? {
              ...old,
              data: old.data.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: now } : n)),
            }
          : old,
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.notifications.all }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<null>('/notifications/read-all'),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.notifications.all }),
  });
}
