import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Deal, PipelineBoard, PipelineStage } from '@leados/shared';
import { jsonResponse, renderWithRouter } from '@/test/utils';
import { notify } from '@/lib/toast';
import { KanbanBoard } from './kanban-board';

vi.mock('@/lib/toast', () => ({ notify: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

const stage = (
  id: string,
  name: string,
  order: number,
  extra: Partial<PipelineStage> = {},
): PipelineStage => ({
  id,
  name,
  order,
  color: null,
  probability: null,
  isWon: false,
  isLost: false,
  dealCount: 0,
  totalValue: 0,
  ...extra,
});

const stages = [
  stage('s1', 'Qualified', 0),
  stage('s2', 'Proposal', 1),
  stage('s3', 'Won', 2, { isWon: true }),
  stage('s4', 'Lost', 3, { isLost: true }),
];

const deal: Deal = {
  id: 'd1',
  title: 'Acme renewal',
  value: 12000,
  currency: 'USD',
  status: 'OPEN',
  pipelineId: 'p1',
  stage: { id: 's1', name: 'Qualified', color: null },
  lead: null,
  contact: { id: 'c1', firstName: 'Asha', lastName: 'Rao', company: 'Acme' },
  assignedTo: null,
  createdBy: {
    id: 'u1',
    firstName: 'Sam',
    lastName: 'Lee',
    email: 'sam@example.com',
  } as Deal['createdBy'],
  expectedCloseDate: null,
  closedAt: null,
  lostReason: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const board: PipelineBoard = {
  pipeline: {
    id: 'p1',
    name: 'Sales',
    isDefault: true,
    stages,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  deals: [deal],
};

const fetchMock = vi.fn();
const moveCalls = () =>
  fetchMock.mock.calls.filter(([url]) => String(url).includes('/deals/d1/move'));

beforeEach(() => {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (String(url).includes('/deals/d1/move')) {
      const body = JSON.parse(String(init?.body)) as { stageId: string; lostReason?: string };
      return jsonResponse({
        success: true,
        data: { ...deal, status: 'LOST', lostReason: body.lostReason },
      });
    }
    return jsonResponse({ success: true, data: null });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  vi.mocked(notify.success).mockClear();
});

async function moveToLostViaMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Move deal Acme renewal' }));
  const menu = await screen.findByRole('menu');
  await user.click(within(menu).getByRole('menuitemradio', { name: 'Lost' }));
  return screen.findByRole('dialog', { name: 'Mark “Acme renewal” as lost?' });
}

describe('KanbanBoard', () => {
  it('renders columns with counts and totals', () => {
    renderWithRouter(<KanbanBoard board={board} currency="USD" />);
    const qualified = screen.getByRole('region', { name: 'Qualified' });
    expect(within(qualified).getByText(/1 deal/)).toBeInTheDocument();
    expect(within(qualified).getByRole('link', { name: 'Acme renewal' })).toHaveAttribute(
      'href',
      '/deals/d1',
    );
  });

  it('asks for a lost reason and only moves the deal after confirming', async () => {
    const user = userEvent.setup();
    renderWithRouter(<KanbanBoard board={board} currency="USD" />);

    const dialog = await moveToLostViaMenu(user);
    expect(moveCalls()).toHaveLength(0);

    await user.type(
      within(dialog).getByRole('textbox', { name: /reason/i }),
      'Went with a competitor',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Mark as lost' }));

    await waitFor(() => expect(moveCalls()).toHaveLength(1));
    const init = moveCalls()[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      stageId: 's4',
      lostReason: 'Went with a competitor',
    });
  });

  it('keeps the deal where it is when the lost dialog is cancelled', async () => {
    const user = userEvent.setup();
    renderWithRouter(<KanbanBoard board={board} currency="USD" />);

    const dialog = await moveToLostViaMenu(user);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(moveCalls()).toHaveLength(0);
    const qualified = screen.getByRole('region', { name: 'Qualified' });
    expect(within(qualified).getByRole('link', { name: 'Acme renewal' })).toBeInTheDocument();
  });
});
