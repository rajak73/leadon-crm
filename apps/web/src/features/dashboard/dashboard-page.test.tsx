import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DashboardSummary, Task, User } from '@leados/shared';
import { jsonResponse, renderWithSession } from '@/test/utils';
import { useSession } from '@/providers/session';
import DashboardPage from './dashboard-page';

function SignedIn() {
  return useSession().status === 'authenticated' ? <DashboardPage /> : null;
}

const user: User = {
  id: 'u1',
  firstName: 'Asha',
  lastName: 'Rao',
  email: 'asha@example.com',
  role: 'ADMIN',
  status: 'ACTIVE',
  lastLoginAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const summary: DashboardSummary = {
  range: '30d',
  currency: 'USD',
  kpis: {
    newLeads: { value: 12, previous: 10 },
    conversionRate: { value: 0.25, previous: 0 },
    openPipelineValue: { value: 50000 },
    wonValue: { value: 8000, previous: 10000 },
    openTasks: { value: 7, overdue: 2 },
  },
  leadsOverTime: [
    { date: '2026-09-20', count: 3 },
    { date: '2026-09-21', count: 9 },
  ],
  leadsByStatus: [],
  leadsBySource: [{ source: 'WEBSITE', count: 12 }],
  pipelineByStage: [{ stageId: 's1', stageName: 'Qualified', color: null, count: 2, value: 50000 }],
  topPerformers: [{ user, wonCount: 1, wonValue: 8000 }],
};

const task: Task = {
  id: 't1',
  title: 'Call Asha',
  description: null,
  type: 'CALL',
  priority: 'HIGH',
  status: 'PENDING',
  dueDate: '2026-09-01T10:00:00.000Z',
  completedAt: null,
  isOverdue: true,
  assignedTo: user,
  createdBy: user,
  relatedLead: null,
  relatedContact: null,
  relatedDeal: null,
  createdAt: '2026-09-01T10:00:00.000Z',
};

afterEach(() => vi.unstubAllGlobals());

describe('DashboardPage', () => {
  it('renders KPIs, change text and my tasks', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes('/auth/status'))
          return jsonResponse({ success: true, data: { needsSetup: false, companyName: 'Acme' } });
        if (url.includes('/auth/refresh'))
          return jsonResponse({ success: true, data: { accessToken: 't', expiresIn: 900, user } });
        if (url.includes('/analytics/dashboard'))
          return jsonResponse({ success: true, data: summary });
        if (url.includes('/tasks'))
          return jsonResponse({
            success: true,
            data: url.includes('overdue') ? [task] : [],
            meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
          });
        if (url.includes('/settings'))
          return jsonResponse({
            success: true,
            data: {
              companyName: 'Acme',
              defaultCurrency: 'USD',
              timezone: 'UTC',
              aiScoringAuto: true,
              aiProvider: 'rules',
            },
          });
        return jsonResponse({ success: true, data: [] });
      }),
    );
    renderWithSession(<SignedIn />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(await screen.findByText('up 20% from the previous period')).toBeInTheDocument();
    expect(screen.getByText('down 20% from the previous period')).toBeInTheDocument();
    expect(screen.getByText('No data for the previous period')).toBeInTheDocument();
    expect(screen.getByText('2 overdue')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Call Asha' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View all tasks' })).toHaveAttribute('href', '/tasks');
  });
});
