import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A text input whose value is committed somewhere else (usually the URL) after
 * a pause in typing, or immediately via `flush()` (Enter / blur). The draft is
 * kept exactly as typed — nothing is stripped — and follows outside changes
 * (e.g. "Clear filters") without clobbering what the person is typing.
 */
export function useCommittedText(
  committed: string,
  onCommit: (value: string) => void,
  delay = 400,
) {
  const [draft, setDraft] = useState(committed);
  const lastSent = useRef(committed);
  const commitRef = useRef(onCommit);
  useEffect(() => {
    commitRef.current = onCommit;
  });

  // Outside change (back button, clear filters): adopt it.
  useEffect(() => {
    if (committed !== lastSent.current) {
      lastSent.current = committed;
      setDraft(committed);
    }
  }, [committed]);

  useEffect(() => {
    if (draft === lastSent.current) return;
    const t = setTimeout(() => {
      lastSent.current = draft;
      commitRef.current(draft);
    }, delay);
    return () => clearTimeout(t);
  }, [draft, delay]);

  const flush = useCallback(() => {
    if (draft !== lastSent.current) {
      lastSent.current = draft;
      commitRef.current(draft);
    }
  }, [draft]);

  return { draft, setDraft, flush };
}
