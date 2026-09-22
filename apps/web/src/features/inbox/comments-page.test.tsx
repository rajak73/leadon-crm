import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { commentReplySchema, type IgComment, type IgCommentPost } from '@leados/shared';
import { mockFetch } from '@/test/fetch-mock';
import { renderWithRouter } from '@/test/utils';
import CommentsPage from './comments-page';

vi.mock('@/lib/toast', () => ({ notify: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

afterEach(() => vi.unstubAllGlobals());

const media = {
  id: 'm1',
  permalink: 'https://instagram.com/p/m1',
  caption: null,
  thumbnailUrl: null,
};

const post = (mediaId: string, caption: string, needs: number, drafts: number): IgCommentPost => ({
  mediaId,
  permalink: `https://instagram.com/p/${mediaId}`,
  caption,
  thumbnailUrl: null,
  commentCount: 4,
  needsReplyCount: needs,
  draftCount: drafts,
  latestCommentAt: '2026-09-22T10:00:00.000Z',
  latestPendingAt: needs + drafts ? '2026-09-22T10:00:00.000Z' : null,
});

const POSTS = [
  post('m1', 'Sliding wardrobe for a 3BHK in Baner\n#interiors', 2, 1),
  post('m2', 'Modular kitchen', 0, 1),
  post('m3', '2BHK makeover', 0, 0),
];

const comment = (id: string, extra: Partial<IgComment>): IgComment => ({
  id,
  commentId: `ig_${id}`,
  parentCommentId: null,
  media,
  fromUsername: id,
  text: `Comment ${id}`,
  lead: null,
  replyStatus: 'NONE',
  publicReply: null,
  privateReply: null,
  privateReplySent: false,
  replyError: null,
  skipReason: null,
  repliedBy: null,
  commentedAt: '2026-09-22T08:00:00.000Z',
  ...extra,
});

const COMMENTS = [
  comment('priya_nair', {
    text: 'Love it!',
    replyStatus: 'REPLIED',
    publicReply: 'Thank you so much!',
    privateReplySent: true,
    repliedBy: { id: 'u1', firstName: 'Asha', lastName: 'Rao', email: 'asha@example.com' },
    commentedAt: '2026-09-21T08:00:00.000Z',
  }),
  comment('divya_p', {
    text: 'Laminate or acrylic?',
    replyStatus: 'DRAFT',
    publicReply: 'It is acrylic!',
    privateReply: 'Hi Divya, sharing the catalogue.',
    commentedAt: '2026-09-22T07:00:00.000Z',
  }),
  comment('anil.k', {
    text: 'Kitna time lagta hai?',
    lead: { id: 'l1', firstName: 'Anil', lastName: null },
  }),
  comment('kiran', {
    text: 'Price?',
    parentCommentId: 'ig_priya_nair',
    replyStatus: 'FAILED',
    replyError: 'Instagram rejected the reply.',
    commentedAt: '2026-09-21T09:00:00.000Z',
  }),
];

function setup() {
  const api = mockFetch({
    'GET /instagram/comments/posts': POSTS,
    'GET /instagram/comments': COMMENTS,
    'POST /instagram/comments/anil.k/reply': { ...COMMENTS[2], replyStatus: 'REPLIED' },
    'POST /instagram/comments/divya_p/reply': { ...COMMENTS[1], replyStatus: 'REPLIED' },
    'POST /instagram/comments/divya_p/discard': { ...COMMENTS[1], replyStatus: 'NONE' },
  });
  renderWithRouter(<CommentsPage />, {
    path: '/inbox/comments/:mediaId?',
    initialEntries: ['/inbox/comments'],
  });
  return api;
}

const article = (name: string) => screen.findByRole('article', { name: `Comment from @${name}` });

describe('CommentsPage', () => {
  it('lists posts in server order with their status and opens the first with work', async () => {
    setup();
    const posts = await screen.findByRole('list', { name: 'Posts' });
    const rows = within(posts).getAllByRole('link');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('2 need reply'),
      expect.stringContaining('1 draft ready'),
      expect.stringContaining('All answered'),
    ]);
    expect(rows[0]).toHaveTextContent('Sliding wardrobe for a 3BHK in Baner');
    expect(rows[0]).not.toHaveTextContent('#interiors');
    expect(rows[0]).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /View post/ })).toHaveAttribute(
      'href',
      'https://instagram.com/p/m1',
    );
  });

  it('shows "Needs reply" by default, with our reply and thread replies nested', async () => {
    const api = setup();
    await article('anil.k');
    expect(screen.getByRole('radio', { name: 'Needs reply (2)' })).toBeChecked();
    expect(screen.queryByText('Laminate or acrylic?')).not.toBeInTheDocument();
    expect(api.fn.mock.calls.some(([url]) => /mediaId=m1/.test(String(url)))).toBe(true);
    expect(screen.getByRole('link', { name: '@anil.k' })).toHaveAttribute('href', '/leads/l1');

    const priya = await article('priya_nair');
    expect(within(priya).getByText('You')).toBeInTheDocument();
    expect(within(priya).getByText('Thank you so much!')).toBeInTheDocument();
    expect(within(priya).getByText('Private DM sent')).toBeInTheDocument();
    const replies = screen.getByRole('list', { name: 'Replies to @priya_nair' });
    const kiran = within(replies).getByRole('article', { name: 'Comment from @kiran' });
    expect(within(kiran).getByText('Failed')).toBeInTheDocument();
    expect(within(kiran).getByText('Instagram rejected the reply.')).toBeInTheDocument();
  });

  it('sends an inline reply with an optional private DM that passes the schema', async () => {
    const user = userEvent.setup();
    const api = setup();
    const anil = await article('anil.k');
    await user.click(within(anil).getByRole('button', { name: 'Reply' }));
    const form = within(anil).getByRole('form', { name: 'Reply to @anil.k' });
    await user.click(within(form).getByRole('button', { name: 'Send' }));
    expect(
      await within(form).findByText('Write a public reply, a private message, or both'),
    ).toBeInTheDocument();

    await user.type(within(form).getByRole('textbox', { name: 'Public reply' }), '3–4 weeks!');
    await user.click(within(form).getByRole('switch', { name: 'Also send a private DM' }));
    await user.type(
      within(form).getByRole('textbox', { name: 'Private message' }),
      'Sharing the timeline.',
    );
    expect(within(form).getByText('21/1,000')).toBeInTheDocument();
    await user.click(within(form).getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(api.bodies('POST', '/instagram/comments/anil.k/reply')).toHaveLength(1),
    );
    const [body] = api.bodies('POST', '/instagram/comments/anil.k/reply');
    expect(body).toEqual({ publicReply: '3–4 weeks!', privateReply: 'Sharing the timeline.' });
    expect(commentReplySchema.safeParse(body).success).toBe(true);
  });

  it('sends or discards an AI draft', async () => {
    const user = userEvent.setup();
    const api = setup();
    await article('anil.k');
    await user.click(screen.getByRole('radio', { name: 'Draft ready (1)' }));
    const divya = await article('divya_p');
    expect(within(divya).getByText('It is acrylic!')).toBeInTheDocument();

    await user.click(within(divya).getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(api.bodies('POST', '/instagram/comments/divya_p/reply')).toHaveLength(1),
    );
    const [body] = api.bodies('POST', '/instagram/comments/divya_p/reply');
    expect(body).toEqual({
      publicReply: 'It is acrylic!',
      privateReply: 'Hi Divya, sharing the catalogue.',
    });
    expect(commentReplySchema.safeParse(body).success).toBe(true);

    await user.click(within(await article('divya_p')).getByRole('button', { name: 'Discard' }));
    await waitFor(() =>
      expect(api.bodies('POST', '/instagram/comments/divya_p/discard')).toHaveLength(1),
    );
  });
});

describe('Loading older comments', () => {
  it('shows the newest 100 first and loads the rest on request', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 150 }, (_, i) =>
      comment(`user${String(i).padStart(3, '0')}`, {
        commentedAt: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString(),
      }),
    );
    const newestFirst = [...many].reverse();
    const bigPost = { ...post('m1', 'Big post', 150, 0), commentCount: 150 };
    mockFetch({
      'GET /instagram/comments/posts': [bigPost],
      'GET /instagram/comments': (url: string) => {
        const page = Number(new URL(url, 'http://x').searchParams.get('page') ?? '1');
        return new Response(
          JSON.stringify({
            success: true,
            data: newestFirst.slice((page - 1) * 100, page * 100),
            meta: { page, limit: 100, total: 150, totalPages: 2 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });
    renderWithRouter(<CommentsPage />, {
      path: '/inbox/comments/:mediaId?',
      initialEntries: ['/inbox/comments/m1'],
    });

    expect(await screen.findByText('Comment user149')).toBeInTheDocument();
    expect(screen.queryByText('Comment user000')).toBeNull();
    // Filter counts come from the post summary, not just the loaded page.
    expect(screen.getByRole('radio', { name: 'Needs reply (150)' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Load older comments (50 more)' }));
    expect(await screen.findByText('Comment user000')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Load older comments/ })).toBeNull();
  });
});
