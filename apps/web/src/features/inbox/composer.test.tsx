import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IG_DM_MAX_LENGTH, sendMessageSchema } from '@leados/shared';
import { mockFetch } from '@/test/fetch-mock';
import { Providers } from '@/test/utils';
import { Composer } from './composer';

vi.mock('@/lib/toast', () => ({ notify: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

afterEach(() => vi.unstubAllGlobals());

const SEND = '/instagram/conversations/c1/messages';

function setup(canReply = true) {
  const api = mockFetch({ [`POST ${SEND}`]: { id: 'm9', text: 'Hi' } });
  render(
    <Providers>
      <Composer conversationId="c1" canReply={canReply} />
    </Providers>,
  );
  return { api, box: screen.getByRole('textbox', { name: 'Your reply' }) };
}

describe('Composer', () => {
  it('sends on Enter and keeps Shift+Enter for new lines', async () => {
    const user = userEvent.setup();
    const { api, box } = setup();
    await user.type(box, 'Hello{Shift>}{Enter}{/Shift}there');
    expect(box).toHaveValue('Hello\nthere');
    expect(api.bodies('POST', SEND)).toHaveLength(0);

    await user.type(box, '{Enter}');
    await waitFor(() => expect(api.bodies('POST', SEND)).toEqual([{ text: 'Hello\nthere' }]));
    expect(sendMessageSchema.safeParse(api.bodies('POST', SEND)[0]).success).toBe(true);
    expect(box).toHaveValue('');
  });

  it('blocks messages over the Instagram character limit', async () => {
    const user = userEvent.setup();
    const { api, box } = setup();
    await user.click(box);
    await user.paste('a'.repeat(IG_DM_MAX_LENGTH + 1));
    expect(screen.getByText(/too long for Instagram/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    await user.type(box, '{Enter}');
    expect(api.bodies('POST', SEND)).toHaveLength(0);

    await user.type(box, '{Backspace}');
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  it('explains and disables replying when the 24-hour window has closed', () => {
    const { box } = setup(false);
    expect(box).toBeDisabled();
    expect(box).toHaveAccessibleDescription(/within 24 hours of the customer's last message/);
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Suggest reply' })).toBeDisabled();
  });
});
