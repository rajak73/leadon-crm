import { useEffect } from 'react';
import { useSearchParams } from 'react-router';

/** Opens the "new" dialog when the URL has ?new=1 (e.g. from the command palette), then drops the param. */
export function useNewParam(open: () => void) {
  const [params, setParams] = useSearchParams();
  const wantsNew = params.get('new') === '1';
  useEffect(() => {
    if (!wantsNew) return;
    open();
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('new');
        return next;
      },
      { replace: true },
    );
  }, [wantsNew, open, setParams]);
}
