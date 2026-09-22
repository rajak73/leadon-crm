import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderWithSession } from '@/test/utils';
import LoginPage from './login-page';

function mockApi(login: () => Response) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/auth/status'))
      return jsonResponse({ success: true, data: { needsSetup: false, companyName: 'Acme' } });
    if (url.includes('/auth/refresh'))
      return jsonResponse(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not signed in' } },
        401,
      );
    if (url.includes('/auth/login')) return login();
    return jsonResponse(
      { success: false, error: { code: 'NOT_FOUND', message: 'Not found' } },
      404,
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('LoginPage', () => {
  beforeEach(() => {
    mockApi(() =>
      jsonResponse(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'That email and password don’t match.' },
        },
        401,
      ),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the company name', async () => {
    renderWithSession(<LoginPage />, { initialEntries: ['/login'] });
    expect(await screen.findByRole('heading', { name: 'Sign in to Acme' })).toBeInTheDocument();
  });

  it('shows the API error message in an alert on 401', async () => {
    const user = userEvent.setup();
    renderWithSession(<LoginPage />, { initialEntries: ['/login'] });
    await user.type(screen.getByLabelText('Email'), 'asha@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('That email and password don’t match.');
    expect(alert.parentElement).toHaveAttribute('aria-live', 'assertive');
  });

  it('toggles password visibility', async () => {
    const user = userEvent.setup();
    renderWithSession(<LoginPage />, { initialEntries: ['/login'] });
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');

    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);
    expect(input).toHaveAttribute('type', 'text');
    const hide = screen.getByRole('button', { name: 'Hide password' });
    expect(hide).toHaveAttribute('aria-pressed', 'true');
    await user.click(hide);
    await waitFor(() => expect(input).toHaveAttribute('type', 'password'));
  });
});
