import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AiReplyPreview,
  AutoReplySettings,
  CommentReplyPreview,
  TestAutoReplyInput,
  UpdateAutoReplySettingsInput,
} from '@leados/shared';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

export function useAutoReplySettings() {
  return useQuery({
    queryKey: qk.autoReply.settings,
    queryFn: () => api.get<AutoReplySettings>('/auto-reply/settings'),
  });
}

export function useUpdateAutoReplySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateAutoReplySettingsInput) =>
      api.patch<AutoReplySettings>('/auto-reply/settings', body),
    onSuccess: (settings) => qc.setQueryData(qk.autoReply.settings, settings),
  });
}

export type AutoReplyTestResult =
  | { kind: 'dm'; preview: AiReplyPreview }
  | { kind: 'comment'; preview: CommentReplyPreview };

/** Try the AI with a sample message. Nothing is stored or sent. */
export function useTestAutoReply() {
  return useMutation({
    mutationFn: async (body: TestAutoReplyInput): Promise<AutoReplyTestResult> => {
      if (body.kind === 'comment')
        return {
          kind: 'comment',
          preview: await api.post<CommentReplyPreview>('/auto-reply/test', body),
        };
      return { kind: 'dm', preview: await api.post<AiReplyPreview>('/auto-reply/test', body) };
    },
  });
}
