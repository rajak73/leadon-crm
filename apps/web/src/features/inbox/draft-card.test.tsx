import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { draftActionSchema, type IgMessage } from '@leados/shared';
import { mockFetch } from '@/test/fetch-mock';
import { Providers } from '@/test/utils';
import { DraftCard, pendingDraft } from './draft-card';

vi.mock('@/lib/toast', () => ({ notify: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

afterEach(() => vi.unstubAllGlobals());

const draft: IgMessage = {
  id: 'd1',
  conversationId: 'c1',
  direction: 'OUTBOUND',
  text: 'A haircut is ₹600. Want to book?',
  attachments: [],
  author: 'AI',
  sentBy: null,
  status: 'DRAFT',
  error: null,
  createdAt: '2026-09-22T10:00:00.000Z',
  sentAt: null,
};

const PATH = '/instagram/messages/d1/draft';

function setup() {
  const api = mockFetch({ [`POST ${PATH}`]: { ...draft, status: 'SENT' } });
  render(
    <Providers>
      <DraftCard conversationId="c1" draft={draft} canReply />
    </Providers>,
  );
  return api;
}

describe('DraftCard', () => {
  it('sends the edited text', async () => {
    const user = userEvent.setup();
    const api = setup();
    const box = screen.getByRole('textbox', { name: 'Draft reply' });
    await user.clear(box);
    await user.type(box, 'A haircut is ₹600. See you Sunday!');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(api.bodies('POST', PATH)).toEqual([
        { action: 'send', text: 'A haircut is ₹600. See you Sunday!' },
      ]),
    );
    expect(draftActionSchema.safeParse(api.bodies('POST', PATH)[0]).success).toBe(true);
  });

  it('sends the draft as-is without a text override when unchanged', async () => {
    const user = userEvent.setup();
    const api = setup();
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(api.bodies('POST', PATH)).toEqual([{ action: 'send' }]));
  });

  it('discards the draft', async () => {
    const user = userEvent.setup();
    const api = setup();
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(api.bodies('POST', PATH)).toEqual([{ action: 'discard' }]));
    expect(draftActionSchema.safeParse(api.bodies('POST', PATH)[0]).success).toBe(true);
  });

  it('finds the newest pending draft', () => {
    const sent = { ...draft, id: 'm1', status: 'SENT' as const };
    const newer = { ...draft, id: 'd2' };
    expect(pendingDraft([draft, sent, newer])?.id).toBe('d2');
    expect(pendingDraft([sent])).toBeUndefined();
  });
});
