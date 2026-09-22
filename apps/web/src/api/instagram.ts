import {
  keepPreviousData,
  type QueryClient,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  AiReplyPreview,
  CommentReplyInput,
  CommentReplyPreview,
  ConnectInstagramInput,
  DraftActionInput,
  IgComment,
  IgCommentPost,
  IgConversation,
  IgConversationDetail,
  IgMessage,
  InboxCounts,
  InstagramStatus,
  SimulateInstagramInput,
  UpdateConversationInput,
} from '@leados/shared';
import { api, type Paged } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

export type ConversationFilter = 'all' | 'unread' | 'attention';

/** Keys of mutations that write to a thread; polling pauses while they run. */
const sendKey = (id: string) => ['instagram', 'send', id] as const;

function invalidateInbox(qc: QueryClient, conversationId?: string) {
  void qc.invalidateQueries({ queryKey: qk.instagram.counts() });
  void qc.invalidateQueries({ queryKey: ['instagram', 'conversations', 'list'] });
  if (conversationId)
    void qc.invalidateQueries({ queryKey: qk.instagram.conversation(conversationId) });
}

// ─── Account ─────────────────────────────────────────────────────────────────

export function useInstagramStatus() {
  return useQuery({
    queryKey: qk.instagram.status(),
    queryFn: () => api.get<InstagramStatus>('/instagram/status'),
  });
}

export function useConnectInstagram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ConnectInstagramInput) =>
      api.post<InstagramStatus>('/instagram/connect', body),
    onSuccess: (status) => qc.setQueryData(qk.instagram.status(), status),
  });
}

export function useDisconnectInstagram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<InstagramStatus>('/instagram/disconnect'),
    onSuccess: (status) => qc.setQueryData(qk.instagram.status(), status),
  });
}

export function useSimulateInstagram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SimulateInstagramInput) =>
      api.post<{ conversationId: string } | { commentId: string }>('/instagram/simulate', body),
    onSuccess: () => {
      invalidateInbox(qc);
      void qc.invalidateQueries({ queryKey: qk.instagram.comments() });
      void qc.invalidateQueries({ queryKey: qk.instagram.status() });
    },
  });
}

// ─── Inbox ───────────────────────────────────────────────────────────────────

/** Sidebar badge counts, polled every 20 s (paused while the tab is hidden). */
export function useInboxCounts(enabled = true) {
  return useQuery({
    queryKey: qk.instagram.counts(),
    queryFn: () => api.get<InboxCounts>('/instagram/counts'),
    refetchInterval: 20_000,
    enabled,
  });
}

export function useConversations(params: {
  filter: ConversationFilter;
  search?: string;
  page?: number;
}) {
  return useQuery({
    queryKey: qk.instagram.conversationList(params),
    queryFn: ({ signal }) =>
      api.list<IgConversation>('/instagram/conversations', { ...params, limit: 50 }, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });
}

export function useConversation(id: string | undefined) {
  const sending = useIsMutating({ mutationKey: sendKey(id ?? '') });
  return useQuery({
    queryKey: qk.instagram.conversation(id ?? ''),
    queryFn: () => api.get<IgConversationDetail>(`/instagram/conversations/${id}`),
    enabled: Boolean(id),
    refetchInterval: sending ? false : 5_000,
  });
}

/** Patch a conversation's summary in every cached list and in its detail. */
function patchConversation(qc: QueryClient, id: string, patch: Partial<IgConversation>) {
  qc.setQueriesData<Paged<IgConversation[]>>(
    { queryKey: ['instagram', 'conversations', 'list'] },
    (old) =>
      old ? { ...old, data: old.data.map((c) => (c.id === id ? { ...c, ...patch } : c)) } : old,
  );
  qc.setQueryData<IgConversationDetail>(qk.instagram.conversation(id), (old) =>
    old ? { ...old, ...patch } : old,
  );
}

export function useUpdateConversation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateConversationInput) =>
      api.patch<IgConversation>(`/instagram/conversations/${id}`, body),
    onMutate: (body) => {
      if (body.markRead) patchConversation(qc, id, { unreadCount: 0 });
      if (body.aiEnabled !== undefined)
        patchConversation(qc, id, {
          aiEnabled: body.aiEnabled,
          ...(body.aiEnabled && { aiPausedReason: null }),
        });
    },
    onSuccess: (conversation) => patchConversation(qc, id, conversation),
    onSettled: () => invalidateInbox(qc, id),
  });
}

export function useCreateConversationLead(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<IgConversation>(`/instagram/conversations/${id}/lead`),
    onSuccess: (conversation) => {
      patchConversation(qc, id, conversation);
      void qc.invalidateQueries({ queryKey: qk.leads.all });
    },
  });
}

/** Send a DM. The message appears straight away and is removed again if sending fails. */
export function useSendMessage(conversationId: string) {
  const qc = useQueryClient();
  const key = qk.instagram.conversation(conversationId);
  return useMutation({
    mutationKey: sendKey(conversationId),
    mutationFn: (text: string) =>
      api.post<IgMessage>(`/instagram/conversations/${conversationId}/messages`, { text }),
    onMutate: async (text) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<IgConversationDetail>(key);
      const now = new Date().toISOString();
      const temp: IgMessage = {
        id: `temp-${Date.now()}`,
        conversationId,
        direction: 'OUTBOUND',
        text,
        attachments: [],
        author: 'USER',
        sentBy: null,
        status: 'SENDING',
        error: null,
        createdAt: now,
        sentAt: null,
      };
      qc.setQueryData<IgConversationDetail>(key, (old) =>
        old ? { ...old, messages: [...old.messages, temp] } : old,
      );
      return { previous, tempId: temp.id };
    },
    onError: (_e, _text, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSuccess: (message, _text, ctx) => {
      qc.setQueryData<IgConversationDetail>(key, (old) =>
        old
          ? {
              ...old,
              needsAttention: false,
              hasDraft: false,
              messages: old.messages
                .map((m) => (m.id === ctx?.tempId ? message : m))
                .map((m) => (m.status === 'DRAFT' ? { ...m, status: 'DISCARDED' as const } : m)),
            }
          : old,
      );
    },
    onSettled: () => invalidateInbox(qc, conversationId),
  });
}

export function useSuggestReply(conversationId: string) {
  return useMutation({
    mutationFn: () =>
      api.post<AiReplyPreview>(`/instagram/conversations/${conversationId}/suggest`),
  });
}

export function useDraftAction(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: sendKey(conversationId),
    mutationFn: ({ messageId, ...body }: DraftActionInput & { messageId: string }) =>
      api.post<IgMessage>(`/instagram/messages/${messageId}/draft`, body),
    onSuccess: (message) => {
      qc.setQueryData<IgConversationDetail>(qk.instagram.conversation(conversationId), (old) =>
        old
          ? {
              ...old,
              hasDraft: false,
              messages: old.messages.map((m) => (m.id === message.id ? message : m)),
            }
          : old,
      );
    },
    onSettled: () => invalidateInbox(qc, conversationId),
  });
}

// ─── Comments ────────────────────────────────────────────────────────────────

/** Posts that have comments, with reply counts. Polled every 15 s (paused while hidden). */
export function useCommentPosts() {
  return useQuery({
    queryKey: qk.instagram.commentPosts(),
    queryFn: ({ signal }) =>
      api.get<IgCommentPost[]>('/instagram/comments/posts', undefined, signal),
    refetchInterval: 15_000,
  });
}

export const COMMENTS_PAGE_SIZE = 100;

/**
 * One post's comments, including thread replies: the newest `pages × 100`, returned oldest
 * first for display. `meta.total` is the post's full count, so the UI can offer "load older".
 */
export function usePostComments(mediaId: string | undefined, pages = 1) {
  return useQuery({
    queryKey: qk.instagram.commentList({ mediaId, pages }),
    queryFn: async ({ signal }): Promise<Paged<IgComment[]>> => {
      const results = await Promise.all(
        Array.from({ length: pages }, (_, i) =>
          api.list<IgComment>(
            '/instagram/comments',
            { mediaId, sortOrder: 'desc', limit: COMMENTS_PAGE_SIZE, page: i + 1 },
            signal,
          ),
        ),
      );
      const byId = new Map(results.flatMap((r) => r.data).map((c) => [c.id, c]));
      const data = [...byId.values()].sort((a, b) => a.commentedAt.localeCompare(b.commentedAt));
      const meta = results[0]?.meta ?? {
        page: 1,
        limit: COMMENTS_PAGE_SIZE,
        total: 0,
        totalPages: 0,
      };
      return { data, meta: { ...meta, page: pages } };
    },
    enabled: Boolean(mediaId),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });
}

const COMMENT_LISTS = ['instagram', 'comments', 'list'] as const;

function patchComment(qc: QueryClient, id: string, patch: (c: IgComment) => IgComment) {
  qc.setQueriesData<Paged<IgComment[]>>({ queryKey: COMMENT_LISTS }, (old) =>
    old ? { ...old, data: old.data.map((c) => (c.id === id ? patch(c) : c)) } : old,
  );
}

/**
 * Comment mutations update the cached comment straight away (`optimistic`), put the server's
 * version in place on success, roll back on error, then refresh posts and inbox counts.
 */
function useCommentMutation<V>(
  fn: (vars: V) => Promise<IgComment>,
  optimistic?: (vars: V) => { id: string; patch: Partial<IgComment> },
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onMutate: async (vars) => {
      if (!optimistic) return undefined;
      await qc.cancelQueries({ queryKey: COMMENT_LISTS });
      const previous = qc.getQueriesData<Paged<IgComment[]>>({ queryKey: COMMENT_LISTS });
      const { id, patch } = optimistic(vars);
      patchComment(qc, id, (c) => ({ ...c, ...patch }));
      return { previous };
    },
    onError: (_e, _vars, ctx) => {
      for (const [key, data] of ctx?.previous ?? []) qc.setQueryData(key, data);
    },
    onSuccess: (comment) => patchComment(qc, comment.id, () => comment),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.instagram.comments() });
      void qc.invalidateQueries({ queryKey: qk.instagram.counts() });
    },
  });
}

export function useReplyToComment() {
  return useCommentMutation(({ id, ...body }: CommentReplyInput & { id: string }) =>
    api.post<IgComment>(`/instagram/comments/${id}/reply`, body),
  );
}

export function useSkipComment() {
  return useCommentMutation(
    (id: string) => api.post<IgComment>(`/instagram/comments/${id}/skip`),
    (id) => ({ id, patch: { replyStatus: 'SKIPPED', publicReply: null, privateReply: null } }),
  );
}

/** Drop an AI draft; the comment goes back to needing a reply. */
export function useDiscardCommentDraft() {
  return useCommentMutation(
    (id: string) => api.post<IgComment>(`/instagram/comments/${id}/discard`),
    (id) => ({ id, patch: { replyStatus: 'NONE', publicReply: null, privateReply: null } }),
  );
}

export function useSuggestCommentReply() {
  return useMutation({
    mutationFn: (id: string) => api.post<CommentReplyPreview>(`/instagram/comments/${id}/suggest`),
  });
}
