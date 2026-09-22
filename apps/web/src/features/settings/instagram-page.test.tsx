import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type { InstagramStatus } from '@leados/shared';
import { mockFetch } from '@/test/fetch-mock';
import { renderWithRouter } from '@/test/utils';
import InstagramSettingsPage from './instagram-page';

vi.mock('@/lib/toast', () => ({ notify: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

afterEach(() => vi.unstubAllGlobals());

const status: InstagramStatus = {
  connected: false,
  account: null,
  webhook: {
    callbackUrl: 'http://localhost:4000/api/webhooks/instagram',
    verifyToken: 'leados-verify-123',
    isPublicUrl: false,
  },
  appSecretConfigured: false,
  testMode: true,
  managedByServer: false,
};

describe('InstagramSettingsPage', () => {
  it('guides setup with copyable webhook values and localhost warnings', async () => {
    mockFetch({ 'GET /instagram/status': status });
    renderWithRouter(<InstagramSettingsPage />);

    expect(
      await screen.findByRole('heading', { name: 'Connect your Instagram account' }),
    ).toBeInTheDocument();
    expect(screen.getByText(status.webhook.callbackUrl)).toBeInTheDocument();
    expect(screen.getByText(status.webhook.verifyToken)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy callback URL' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy verify token' })).toBeInTheDocument();

    expect(screen.getByText("Meta can't reach this address")).toBeInTheDocument();
    expect(screen.getByText('cloudflared tunnel --url http://localhost:4000')).toBeInTheDocument();
    expect(screen.getByText("The app secret isn't set")).toBeInTheDocument();

    expect(screen.getByText('Test tools')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Simulate incoming' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Access token/)).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
  });

  it('hides the warnings when the URL is public and the secret is set', async () => {
    mockFetch({
      'GET /instagram/status': {
        ...status,
        testMode: false,
        appSecretConfigured: true,
        webhook: { ...status.webhook, isPublicUrl: true },
      },
    });
    renderWithRouter(<InstagramSettingsPage />);
    await screen.findByRole('heading', { name: 'Connect your Instagram account' });
    expect(screen.queryByText("Meta can't reach this address")).not.toBeInTheDocument();
    expect(screen.queryByText("The app secret isn't set")).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Simulate incoming' })).not.toBeInTheDocument();
  });

  it('shows only the account when connected and tucks the rest into Advanced', async () => {
    mockFetch({
      'GET /instagram/status': {
        ...status,
        connected: true,
        testMode: false,
        appSecretConfigured: true,
        managedByServer: true,
        webhook: { ...status.webhook, isPublicUrl: true },
        account: {
          igUserId: '1784',
          username: 'sharma.interiors',
          name: 'Sharma Interiors',
          profilePictureUrl: null,
          status: 'ACTIVE',
          statusMessage: null,
          tokenExpiresAt: '2026-11-20T00:00:00.000Z',
          lastWebhookAt: null,
          connectedAt: '2026-09-01T00:00:00.000Z',
        },
      } satisfies InstagramStatus,
    });
    const { container } = renderWithRouter(<InstagramSettingsPage />);
    expect(await screen.findByText('Sharma Interiors')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Connect your Instagram account' })).toBeNull();
    const advanced = container.querySelector('details');
    expect(advanced).not.toHaveAttribute('open');
    expect(advanced).toHaveTextContent('Comes from INSTAGRAM_ACCESS_TOKEN on the server');
    // The server manages the token, so there is nothing to paste or disconnect here.
    expect(screen.queryByRole('button', { name: 'Use a different token' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Disconnect' })).toBeNull();
    expect(screen.queryByText('Test tools')).toBeNull();
  });

  it('explains the server token when it has not connected yet', async () => {
    mockFetch({ 'GET /instagram/status': { ...status, testMode: false, managedByServer: true } });
    renderWithRouter(<InstagramSettingsPage />);
    expect(await screen.findByText('Instagram isn’t connected yet')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Connect your Instagram account' })).toBeNull();
  });
});
