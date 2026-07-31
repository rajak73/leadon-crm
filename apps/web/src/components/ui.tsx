import { useState } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className={className ?? 'input'}
        style={{ paddingRight: 40, ...(props.style || {}) }}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        tabIndex={-1}
        style={{
          position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer', padding: 8,
          color: 'var(--muted)', display: 'grid', placeItems: 'center', lineHeight: 0,
        }}
      >
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}

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
          <button className="btn sm" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
