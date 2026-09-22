import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderWithSession } from '@/test/utils';
import HomePage from './home-page';

function mockApi(needsSetup: boolean) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/auth/status'))
        return jsonResponse({ success: true, data: { needsSetup, companyName: 'Acme' } });
      return jsonResponse(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not signed in' } },
        401,
      );
    }),
  );
}

describe('HomePage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('has one h1 and sends signed-out visitors to sign in', async () => {
    mockApi(false);
    renderWithSession(<HomePage />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const links = await screen.findAllByRole('link', { name: /sign in/i });
    expect(links[0]).toHaveAttribute('href', '/login');
  });

  it('points to first-run setup when LeadOS has no users yet', async () => {
    mockApi(true);
    renderWithSession(<HomePage />);
    const links = await screen.findAllByRole('link', { name: /set up leados/i });
    expect(links[0]).toHaveAttribute('href', '/setup');
  });
});
