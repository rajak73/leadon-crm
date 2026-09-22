import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jsonResponse, renderWithRouter } from '@/test/utils';
import { LeadFilters } from './lead-filters';

const search = (router: { state: { location: { search: string } } }) =>
  new URLSearchParams(router.state.location.search);

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/leads/tags'))
        return jsonResponse({ success: true, data: ['vip', 'priority'] });
      return jsonResponse({ success: true, data: [] });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LeadFilters', () => {
  it('keeps commas in the tag input and commits the exact value on Enter', async () => {
    const user = userEvent.setup();
    const { router } = renderWithRouter(<LeadFilters />, { initialEntries: ['/?page=3'] });
    const input = screen.getByLabelText('Tag');

    await user.type(input, 'vip, priority');
    expect(input).toHaveValue('vip, priority');

    await user.keyboard('{Enter}');
    expect(search(router).get('tag')).toBe('vip, priority');
    expect(input).toHaveValue('vip, priority');
    expect(search(router).get('page')).toBeNull();
  });

  it('commits the tag after a pause in typing', async () => {
    const user = userEvent.setup();
    const { router } = renderWithRouter(<LeadFilters />);
    const input = screen.getByLabelText('Tag');
    await user.type(input, 'vip, priority');
    expect(input).toHaveValue('vip, priority');
    await waitFor(() => expect(search(router).get('tag')).toBe('vip, priority'));
  });

  it('changing the status filter resets the page', async () => {
    const user = userEvent.setup();
    const { router } = renderWithRouter(<LeadFilters />, {
      initialEntries: ['/?page=4&sortBy=aiScore'],
    });
    expect(search(router).get('page')).toBe('4');

    await user.click(screen.getByRole('button', { name: 'Status' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Qualified' }));

    const params = search(router);
    expect(params.get('status')).toBe('QUALIFIED');
    expect(params.get('page')).toBeNull();
    expect(params.get('sortBy')).toBe('aiScore');
  });

  it('shows Clear filters when a filter is active and clears them', async () => {
    const user = userEvent.setup();
    const { router } = renderWithRouter(<LeadFilters />, {
      initialEntries: ['/?status=NEW&tag=vip&page=2'],
    });
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    const params = search(router);
    expect(params.get('status')).toBeNull();
    expect(params.get('tag')).toBeNull();
    expect(params.get('page')).toBeNull();
    await waitFor(() => expect(screen.getByLabelText('Tag')).toHaveValue(''));
  });
});
