import { act, renderHook } from '@testing-library/react';
import { useSelection } from './use-selection';

describe('useSelection', () => {
  it('toggles and selects many ids', () => {
    const { result } = renderHook(() => useSelection('page=1'));
    act(() => result.current.toggle('a'));
    act(() => result.current.setMany(['b', 'c'], true));
    expect(result.current.ids).toEqual(['a', 'b', 'c']);
    act(() => result.current.toggle('b'));
    expect(result.current.isSelected('b')).toBe(false);
    expect(result.current.count).toBe(2);
  });

  it('clears the selection when the page (reset key) changes', () => {
    const { result, rerender } = renderHook(({ k }) => useSelection(k), {
      initialProps: { k: '{"page":1}' },
    });
    act(() => result.current.setMany(['a', 'b', 'c'], true));
    expect(result.current.count).toBe(3);

    rerender({ k: '{"page":2}' });
    expect(result.current.count).toBe(0);
    expect(result.current.ids).toEqual([]);

    // Going back does not bring the old selection back.
    rerender({ k: '{"page":1}' });
    expect(result.current.count).toBe(0);
  });

  it('clears when filters or sort change but not on a plain re-render', () => {
    const { result, rerender } = renderHook(({ k }) => useSelection(k), {
      initialProps: { k: 'status=NEW' },
    });
    act(() => result.current.toggle('x'));
    rerender({ k: 'status=NEW' });
    expect(result.current.ids).toEqual(['x']);
    rerender({ k: 'status=NEW&sortBy=aiScore' });
    expect(result.current.ids).toEqual([]);
  });
});
