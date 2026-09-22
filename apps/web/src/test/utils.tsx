import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { SessionProvider } from '@/providers/session';
import { TooltipProvider } from '@/components/ui/tooltip';

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
}

export function Providers({ children, client }: { children: ReactNode; client?: QueryClient }) {
  return (
    <QueryClientProvider client={client ?? createTestQueryClient()}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}

/** Renders inside a memory router at `path` with query + theme providers (no session boot). */
export function renderWithRouter(
  ui: ReactElement,
  {
    path = '/',
    initialEntries = ['/'],
    client,
  }: { path?: string; initialEntries?: string[]; client?: QueryClient } = {},
) {
  const router = createMemoryRouter([{ path, element: ui }], { initialEntries });
  const utils = render(
    <Providers client={client}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { ...utils, router };
}

/** Same, with the session provider (it will call /api/auth/status on mount — mock fetch first). */
export function renderWithSession(
  ui: ReactElement,
  opts: { initialEntries?: string[]; client?: QueryClient } = {},
) {
  const router = createMemoryRouter([{ path: '*', element: ui }], {
    initialEntries: opts.initialEntries ?? ['/'],
  });
  return render(
    <Providers client={opts.client}>
      <SessionProvider>
        <RouterProvider router={router} />
      </SessionProvider>
    </Providers>,
  );
}

/** JSON Response helper for fetch mocks. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
