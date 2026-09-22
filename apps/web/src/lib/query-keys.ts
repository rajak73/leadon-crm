// Query-key factory. Keys are hierarchical so invalidating `leads.all` also
// invalidates every list/detail below it.

import type { QueryParams } from './api-client';

type Scope = { leadId?: string; contactId?: string; dealId?: string };

export const qk = {
  me: ['me'] as const,
  settings: ['settings'] as const,
  users: ['users'] as const,
  authStatus: ['auth-status'] as const,

  leads: {
    all: ['leads'] as const,
    lists: () => ['leads', 'list'] as const,
    list: (q: QueryParams) => ['leads', 'list', q] as const,
    detail: (id: string) => ['leads', 'detail', id] as const,
    scores: (id: string) => ['leads', 'scores', id] as const,
    tags: () => ['leads', 'tags'] as const,
  },
  contacts: {
    all: ['contacts'] as const,
    list: (q: QueryParams) => ['contacts', 'list', q] as const,
    detail: (id: string) => ['contacts', 'detail', id] as const,
  },
  pipelines: {
    all: ['pipelines'] as const,
    list: () => ['pipelines', 'list'] as const,
    board: (id: string) => ['pipelines', 'board', id] as const,
  },
  deals: {
    all: ['deals'] as const,
    list: (q: QueryParams) => ['deals', 'list', q] as const,
    detail: (id: string) => ['deals', 'detail', id] as const,
  },
  tasks: {
    all: ['tasks'] as const,
    list: (q: QueryParams) => ['tasks', 'list', q] as const,
  },
  notes: {
    all: ['notes'] as const,
    list: (scope: Scope) => ['notes', scope] as const,
  },
  activities: {
    all: ['activities'] as const,
    list: (scope: Scope) => ['activities', scope] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    list: (q: QueryParams) => ['notifications', 'list', q] as const,
    unreadCount: () => ['notifications', 'unread-count'] as const,
  },
  workflows: {
    all: ['workflows'] as const,
    list: () => ['workflows', 'list'] as const,
    detail: (id: string) => ['workflows', 'detail', id] as const,
    runs: (id: string, page: number) => ['workflows', 'runs', id, page] as const,
    meta: () => ['workflows', 'meta'] as const,
  },
  instagram: {
    all: ['instagram'] as const,
    status: () => ['instagram', 'status'] as const,
    counts: () => ['instagram', 'counts'] as const,
    conversations: () => ['instagram', 'conversations'] as const,
    conversationList: (q: QueryParams) => ['instagram', 'conversations', 'list', q] as const,
    conversation: (id: string) => ['instagram', 'conversations', 'detail', id] as const,
    comments: () => ['instagram', 'comments'] as const,
    commentList: (q: QueryParams) => ['instagram', 'comments', 'list', q] as const,
    commentPosts: () => ['instagram', 'comments', 'posts'] as const,
  },
  autoReply: {
    settings: ['auto-reply', 'settings'] as const,
  },
  search: (q: string) => ['search', q] as const,
  dashboard: (range: string) => ['dashboard', range] as const,
};
