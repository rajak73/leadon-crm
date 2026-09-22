import { useCallback, useMemo, useState } from 'react';

export interface Selection {
  /** Selected ids, in the order they were picked. */
  ids: string[];
  count: number;
  isSelected: (id: string) => boolean;
  toggle: (id: string, checked?: boolean) => void;
  /** Select or deselect several ids at once (e.g. "select all on this page"). */
  setMany: (ids: ReadonlyArray<string>, checked: boolean) => void;
  clear: () => void;
}

/**
 * Row selection that resets whenever `resetKey` changes. Derive the key from
 * everything that changes which rows are visible (page, filters, search, sort)
 * so a bulk action can never touch rows the person can no longer see.
 */
export function useSelection(resetKey: string): Selection {
  const [key, setKey] = useState(resetKey);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

  // Reset during render (not in an effect) so a stale selection is never shown.
  let current = selected;
  if (key !== resetKey) {
    current = new Set();
    setKey(resetKey);
    setSelected(current);
  }

  const toggle = useCallback((id: string, checked?: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const on = checked ?? !prev.has(id);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const setMany = useCallback((ids: ReadonlyArray<string>, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  return useMemo(
    () => ({
      ids: [...current],
      count: current.size,
      isSelected: (id: string) => current.has(id),
      toggle,
      setMany,
      clear,
    }),
    [current, toggle, setMany, clear],
  );
}
