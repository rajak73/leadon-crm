import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createPipelineSchema } from '@leados/shared';
import { jsonResponse, Providers } from '@/test/utils';
import { PipelineEditorDialog } from './pipeline-editor-dialog';

vi.mock('@/lib/toast', () => ({ notify: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/pipelines') && init?.method === 'POST') {
      return jsonResponse(
        { success: true, data: { id: 'p1', ...JSON.parse(String(init.body)) } },
        201,
      );
    }
    return jsonResponse({ success: true, data: [] });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

function postedBody(): unknown {
  const call = fetchMock.mock.calls.find(
    ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
  );
  return call ? JSON.parse(String((call[1] as RequestInit).body)) : undefined;
}

describe('PipelineEditorDialog', () => {
  it('creates a pipeline with ordered stages and exactly one Won and one Lost stage', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Providers>
        <PipelineEditorDialog open onOpenChange={onOpenChange} />
      </Providers>,
    );

    await user.type(screen.getByRole('textbox', { name: /^name/i }), 'Enterprise');

    // A new stage lands before the closing stages; move it above Proposal.
    await user.click(screen.getByRole('button', { name: 'Add stage' }));
    await user.type(screen.getByRole('textbox', { name: 'Stage 4 name' }), 'Discovery');
    await user.click(screen.getByRole('button', { name: 'Move Discovery up' }));

    // Re-mark Won on a different stage: the old Won stage must be cleared.
    await user.click(screen.getByRole('radio', { name: /won stage: proposal/i }));
    await user.click(screen.getByRole('radio', { name: /won stage: won/i }));

    await user.click(screen.getByRole('button', { name: 'Create pipeline' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    const body = postedBody() as {
      name: string;
      stages: Array<{ name: string; isWon: boolean; isLost: boolean }>;
    };
    expect(createPipelineSchema.safeParse(body).success).toBe(true);
    expect(body.name).toBe('Enterprise');
    expect(body.stages.map((s) => s.name)).toEqual([
      'New',
      'Qualified',
      'Discovery',
      'Proposal',
      'Won',
      'Lost',
    ]);
    expect(body.stages.filter((s) => s.isWon).map((s) => s.name)).toEqual(['Won']);
    expect(body.stages.filter((s) => s.isLost).map((s) => s.name)).toEqual(['Lost']);
    expect(body.stages.every((s) => !('id' in s))).toBe(true);
  });

  it('shows the list-level error and does not submit without a Won stage', async () => {
    const user = userEvent.setup();
    render(
      <Providers>
        <PipelineEditorDialog open onOpenChange={vi.fn()} />
      </Providers>,
    );
    await user.type(screen.getByRole('textbox', { name: /^name/i }), 'Partners');
    await user.click(screen.getByRole('button', { name: 'Remove stage Won' }));
    await user.click(screen.getByRole('button', { name: 'Create pipeline' }));

    expect(await screen.findByText('Mark exactly one stage as Won')).toBeInTheDocument();
    expect(postedBody()).toBeUndefined();
  });
});
