import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import type {
  AppSettings,
  AuthStatus,
  changePasswordSchema,
  createUserSchema,
  resetUserPasswordSchema,
  updateProfileSchema,
  updateSettingsSchema,
  updateUserSchema,
  User,
} from '@leados/shared';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

export function useAuthStatus() {
  return useQuery({
    queryKey: qk.authStatus,
    queryFn: () => api.get<AuthStatus>('/auth/status'),
    staleTime: 60_000,
  });
}

export function useMe() {
  return useQuery({ queryKey: qk.me, queryFn: () => api.get<User>('/me') });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof updateProfileSchema>) => api.patch<User>('/me', body),
    onSuccess: (user) => {
      qc.setQueryData(qk.me, user);
      void qc.invalidateQueries({ queryKey: qk.users });
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: z.input<typeof changePasswordSchema>) =>
      api.post<null>('/me/password', body),
  });
}

/** All users (including disabled) — for assignee pickers and the team page. */
export function useUsers() {
  return useQuery({
    queryKey: qk.users,
    queryFn: () => api.get<User[]>('/users'),
    staleTime: 5 * 60_000,
  });
}

/** Active users only, sorted by name — for pickers. */
export function useActiveUsers() {
  const q = useUsers();
  const data = q.data
    ?.filter((u) => u.status === 'ACTIVE')
    .sort((a, b) => a.firstName.localeCompare(b.firstName));
  return { ...q, data };
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof createUserSchema>) => api.post<User>('/users', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.users }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: z.input<typeof updateUserSchema> & { id: string }) =>
      api.patch<User>(`/users/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.users }),
  });
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: ({ id, ...body }: z.input<typeof resetUserPasswordSchema> & { id: string }) =>
      api.post<null>(`/users/${id}/password`, body),
  });
}

export function useSettings() {
  return useQuery({
    queryKey: qk.settings,
    queryFn: () => api.get<AppSettings>('/settings'),
    staleTime: 5 * 60_000,
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof updateSettingsSchema>) =>
      api.patch<AppSettings>('/settings', body),
    onSuccess: (settings) => {
      qc.setQueryData(qk.settings, settings);
      void qc.invalidateQueries({ queryKey: qk.authStatus });
    },
  });
}

/** The default currency, falling back to USD until settings have loaded. */
export function useDefaultCurrency(): string {
  return useSettings().data?.defaultCurrency ?? 'USD';
}
