import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Global keyboard shortcuts. "g then <key>" navigates; "?" shows help; "n"
 * dispatches a new-item event pages can listen for. Ignores typing in inputs.
 */
const NAV: Record<string, string> = {
  d: '/app',
  r: '/app/reports',
  l: '/app/leads',
  c: '/app/contacts',
  p: '/app/pipeline',
  t: '/app/tasks',
  i: '/app/inbox',
};

const HELP = [
  { keys: 'g d', desc: 'Go to Dashboard' },
  { keys: 'g r', desc: 'Go to Reports' },
  { keys: 'g l', desc: 'Go to Leads' },
  { keys: 'g c', desc: 'Go to Contacts' },
  { keys: 'g p', desc: 'Go to Pipeline' },
  { keys: 'g t', desc: 'Go to Tasks' },
  { keys: 'g i', desc: 'Go to Inbox' },
  { keys: '⌘/Ctrl K', desc: 'Global search' },
  { keys: 'n', desc: 'New item (on Leads/Contacts/Tasks)' },
  { keys: '?', desc: 'Show this help' },
];

function isTyping(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

export function KeyboardShortcuts() {
  const navigate = useNavigate();
  const [showHelp, setShowHelp] = useState(false);
  const [gPending, setGPending] = useState(false);

  useEffect(() => {
    let gTimer: ReturnType<typeof setTimeout> | null = null;

    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === '?') { e.preventDefault(); setShowHelp((s) => !s); return; }
      if (e.key === 'Escape') { setShowHelp(false); setGPending(false); return; }

      if (gPending) {
        const dest = NAV[e.key.toLowerCase()];
        setGPending(false);
        if (gTimer) clearTimeout(gTimer);
        if (dest) { e.preventDefault(); navigate(dest); }
        return;
      }

      if (e.key.toLowerCase() === 'g') {
        setGPending(true);
        gTimer = setTimeout(() => setGPending(false), 1200);
        return;
      }

      if (e.key.toLowerCase() === 'n') {
        // Pages can listen for this to open their "new" modal.
        document.dispatchEvent(new CustomEvent('leados:new'));
      }
    }

    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); if (gTimer) clearTimeout(gTimer); };
  }, [gPending, navigate]);

  return (
    <>
      {gPending && (
        <div style={{ position: 'fixed', bottom: 16, left: 16, zIndex: 70, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', boxShadow: 'var(--shadow)', fontSize: 13 }}>
          <strong>g</strong> then a key… (d/r/l/c/p/t/i)
        </div>
      )}
      {showHelp && (
        <div onClick={() => setShowHelp(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 70, display: 'grid', placeItems: 'center', padding: 16 }}>
          <div className="card card-pad" style={{ width: '100%', maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="row between" style={{ marginBottom: 12 }}>
              <div className="h2" style={{ margin: 0 }}>Keyboard Shortcuts</div>
              <button className="btn sm" onClick={() => setShowHelp(false)}>✕</button>
            </div>
            {HELP.map((h) => (
              <div key={h.keys} className="row between" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span className="subtle">{h.desc}</span>
                <kbd style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px', fontSize: 12, fontFamily: 'ui-monospace, monospace' }}>{h.keys}</kbd>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
