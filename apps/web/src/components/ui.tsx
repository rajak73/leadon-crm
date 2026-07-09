import type { ReactNode } from 'react';

export function Badge({ value }: { value: string }) {
  const cls = value.toLowerCase().replace(/\s+/g, '_');
  return <span className={`badge ${cls}`}>{value.replace(/_/g, ' ')}</span>;
}

export function StatCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="card card-pad stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

export function Card({ children, title, action }: { children: ReactNode; title?: string; action?: ReactNode }) {
  return (
    <div className="card card-pad">
      {(title || action) && (
        <div className="row between mt8" style={{ marginTop: 0, marginBottom: 12 }}>
          {title && <div className="h2" style={{ margin: 0 }}>{title}</div>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}

export function Loading() {
  return <div className="empty">Loading…</div>;
}

export function Avatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return <div className="avatar">{initials}</div>;
}

export function money(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 16 }}
    >
      <div className="card card-pad" style={{ width: '100%', maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 14 }}>
          <div className="h2" style={{ margin: 0 }}>{title}</div>
          <button className="btn sm" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
