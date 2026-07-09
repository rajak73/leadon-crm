import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

interface Item { id: string; label: string; sub: string; link: string; type: string }
interface Results { leads: any[]; contacts: any[]; deals: any[] }

const TYPE_ICON: Record<string, string> = { lead: '🎯', contact: '👤', deal: '🗂️' };

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Global hotkey: Cmd/Ctrl + K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else { setQ(''); setItems([]); setActive(0); }
  }, [open]);

  const runSearch = useCallback(async (term: string) => {
    if (!term.trim()) { setItems([]); return; }
    setLoading(true);
    try {
      const r = await api.get<Results>(`/api/v1/search?q=${encodeURIComponent(term)}`);
      const flat: Item[] = [
        ...r.leads.map((x: any) => ({ ...x, type: 'lead' })),
        ...r.contacts.map((x: any) => ({ ...x, type: 'contact' })),
        ...r.deals.map((x: any) => ({ ...x, type: 'deal' })),
      ];
      setItems(flat);
      setActive(0);
    } catch { setItems([]); }
    finally { setLoading(false); }
  }, []);

  // Debounce
  useEffect(() => {
    const id = setTimeout(() => runSearch(q), 220);
    return () => clearTimeout(id);
  }, [q, runSearch]);

  function choose(it: Item) {
    setOpen(false);
    navigate(it.link);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && items[active]) { e.preventDefault(); choose(items[active]); }
  }

  if (!open) return null;

  return (
    <div onClick={() => setOpen(false)}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 60, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '12vh' }}>
      <div className="card" style={{ width: '100%', maxWidth: 560, padding: 0, overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="input"
          style={{ border: 'none', borderRadius: 0, borderBottom: '1px solid var(--border)', fontSize: 16, padding: 16 }}
          placeholder="Search leads, contacts, deals…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          {loading && <div className="empty" style={{ padding: 20 }}>Searching…</div>}
          {!loading && q && items.length === 0 && <div className="empty" style={{ padding: 20 }}>No results for “{q}”.</div>}
          {!loading && !q && <div className="subtle" style={{ padding: 20, fontSize: 13 }}>Type to search across your CRM. Tip: ⌘K / Ctrl+K opens this anywhere.</div>}
          {items.map((it, i) => (
            <div
              key={it.type + it.id}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(it)}
              style={{ display: 'flex', gap: 10, padding: '10px 16px', cursor: 'pointer', background: i === active ? 'var(--primary-50)' : 'transparent' }}
            >
              <span>{TYPE_ICON[it.type]}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{it.label}</div>
                <div className="subtle" style={{ fontSize: 12 }}>{it.type} · {it.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
