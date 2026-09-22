import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import type {
  Contact,
  ContactDetail,
  createContactSchema,
  updateContactSchema,
} from '@leados/shared';
import { api, type QueryParams } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

export function useContacts(params: QueryParams) {
  return useQuery({
    queryKey: qk.contacts.list(params),
    queryFn: ({ signal }) => api.list<Contact>('/contacts', params, signal),
    placeholderData: keepPreviousData,
  });
}

export function useContact(id: string | undefined) {
  return useQuery({
    queryKey: qk.contacts.detail(id ?? ''),
    queryFn: () => api.get<ContactDetail>(`/contacts/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof createContactSchema>) => api.post<Contact>('/contacts', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.contacts.all }),
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: z.input<typeof updateContactSchema> & { id: string }) =>
      api.patch<Contact>(`/contacts/${id}`, body),
    onSuccess: (_c, { id }) => {
      void qc.invalidateQueries({ queryKey: qk.contacts.all });
      void qc.invalidateQueries({ queryKey: qk.activities.list({ contactId: id }) });
    },
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/contacts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.contacts.all }),
  });
}
