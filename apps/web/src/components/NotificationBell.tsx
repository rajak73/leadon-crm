import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Target, AlarmClock, Cog } from 'lucide-react';
import { api } from '../lib/api';

interface Notification {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
}

const ICONS: Record<string, typeof Bell> = {
  LEAD_CAPTURED: Target,
  TASK_DUE: AlarmClock,
  WORKFLOW_RUN: Cog,
  SYSTEM: Bell,
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  async function loadCount() {
    try {
      const r = await api.get<{ count: number }>('/api/v1/notifications/unread-count');
      setUnread(r.count);
    } catch { /* ignore (e.g. no org yet) */ }
  }
  async function loadList() {
    const r = await api.get<Notification[]>('/api/v1/notifications');
    setItems(r);
  }

  useEffect(() => {
    loadCount();
    const id = setInterval(loadCount, 30000); // poll every 30s
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) await loadList();
  }

  async function openItem(n: Notification) {
    if (!n.isRead) {
      await api.post(`/api/v1/notifications/${n.id}/read`, {});
      setUnread((u) => Math.max(0, u - 1));
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
    }
    if (n.link) { setOpen(false); navigate(n.link); }
  }

  async function markAll() {
    await api.post('/api/v1/notifications/read-all', {});
    setUnread(0);
    setItems((list) => list.map((x) => ({ ...x, isRead: true })));
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="btn sm outline" onClick={toggle} aria-label="Notifications" title="Notifications" style={{ position: 'relative' }}>
        <Bell size={16} />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -6, right: -6, background: 'var(--danger)', color: '#fff',
            borderRadius: 999, fontSize: 10, fontWeight: 700, minWidth: 16, height: 16, lineHeight: '16px', textAlign: 'center', padding: '0 4px',
          }}>{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {open && (
        <div className="card dropdown-in" style={{
          position: 'absolute', right: 0, top: 40, width: 320, maxHeight: 420, overflowY: 'auto', zIndex: 30, padding: 0,
        }}>
          <div className="row between" style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
            <strong>Notifications</strong>
            {unread > 0 && <button className="btn sm" onClick={markAll}>Mark all read</button>}
          </div>
          {items.length === 0 ? (
            <div className="empty" style={{ padding: 24 }}>No notifications yet.</div>
          ) : items.map((n) => (
            <div
              key={n.id}
              onClick={() => openItem(n)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openItem(n); } }}
              style={{
                padding: '10px 14px', borderBottom: '1px solid var(--border)', cursor: n.link ? 'pointer' : 'default',
                background: n.isRead ? 'transparent' : 'var(--primary-50)',
              }}
            >
              <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                {(() => { const Icon = ICONS[n.type] ?? Bell; return <Icon size={16} style={{ flexShrink: 0, marginTop: 2 }} />; })()}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{n.title}</div>
                  {n.body && <div className="subtle" style={{ fontSize: 12 }}>{n.body}</div>}
                  <div className="subtle" style={{ fontSize: 11 }}>{new Date(n.createdAt).toLocaleString()}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
