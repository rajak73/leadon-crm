import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { updateAutoReplySettingsSchema, type AutoReplySettings } from '@leados/shared';
import { mockFetch } from '@/test/fetch-mock';
import { Providers } from '@/test/utils';
import { AutoReplyForm } from './auto-reply-form';

vi.mock('@/lib/toast', () => ({ notify: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

afterEach(() => vi.unstubAllGlobals());

const settings: AutoReplySettings = {
  dmEnabled: false,
  commentsEnabled: false,
  mode: 'DRAFT',
  commentReplyMode: 'PUBLIC',
  businessInfo: '',
  tone: 'Friendly',
  handoffMessage: 'Someone will reply soon.',
  replyDelaySeconds: 20,
  maxRepliesPerDay: 10,
  createLeads: true,
  collectContactDetails: true,
  aiProvider: 'gemini',
  aiModel: 'gemini-2.5-flash',
};

function renderForm(s: AutoReplySettings, canEdit = true) {
  const api = mockFetch({
    'PATCH /auto-reply/settings': (_u: string, init?: RequestInit) => ({
      ...s,
      ...JSON.parse(String(init?.body)),
    }),
  });
  render(
    <Providers>
      <AutoReplyForm settings={s} canEdit={canEdit} />
    </Providers>,
  );
  return api;
}

describe('AutoReplyForm', () => {
  it('saves a payload the API accepts', async () => {
    const user = userEvent.setup();
    const api = renderForm(settings);

    // Everything beyond the essentials starts tucked away in "More options".
    expect(screen.getByText('More options').closest('details')).not.toHaveAttribute('open');
    await user.click(screen.getByRole('switch', { name: 'Reply to DMs automatically' }));
    await user.click(screen.getByRole('radio', { name: 'Send automatically' }));
    await user.click(screen.getByRole('radio', { name: 'Both' }));
    await user.type(screen.getByRole('textbox', { name: 'Business info' }), 'Haircut ₹600');
    const delay = screen.getByRole('spinbutton', { name: 'Reply delay (seconds)' });
    await user.clear(delay);
    await user.type(delay, '5');

    expect(screen.getByText('You have unsaved changes.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(api.bodies('PATCH', '/auto-reply/settings')).toHaveLength(1));
    const [body] = api.bodies('PATCH', '/auto-reply/settings') as Array<Record<string, unknown>>;
    expect(updateAutoReplySettingsSchema.strict().safeParse(body).success).toBe(true);
    expect(body).toMatchObject({
      dmEnabled: true,
      commentsEnabled: false,
      mode: 'AUTO',
      commentReplyMode: 'BOTH',
      businessInfo: 'Haircut ₹600',
      replyDelaySeconds: 5,
      maxRepliesPerDay: 10,
      createLeads: true,
      collectContactDetails: true,
    });
  });

  it('disables AI switches with an explanation when no AI key is set', () => {
    renderForm({ ...settings, aiProvider: 'rules', aiModel: null });
    for (const name of ['Reply to DMs automatically', 'Reply to comments automatically']) {
      const toggle = screen.getByRole('switch', { name });
      expect(toggle).toBeDisabled();
      expect(toggle).toHaveAccessibleDescription(/Add an AI key on the server first/);
    }
    expect(
      screen.getByRole('switch', { name: 'Create leads from new Instagram contacts' }),
    ).toBeEnabled();
  });

  it('is read-only for members', () => {
    renderForm(settings, false);
    expect(screen.getByRole('textbox', { name: 'Business info' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
  });
});
