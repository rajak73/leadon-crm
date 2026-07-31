import { useState } from 'react';
import type { CSSProperties, InputHTMLAttributes, ReactNode } from 'react';
import { X, Eye, EyeOff, Inbox as InboxIcon, type LucideIcon } from 'lucide-react';

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

export function StatCard({
  label, value, icon: Icon, trend,
}: {
  label: string; value: ReactNode; icon?: LucideIcon; trend?: { value: string; positive?: boolean };
}) {
  return (
    <div className="card card-pad stat">
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div className="label">{label}</div>
        {Icon && <div className="stat-ic"><Icon size={16} /></div>}
      </div>
      <div className="value">{value}</div>
      {trend && <div className={`stat-trend ${trend.positive ? 'up' : 'down'}`}>{trend.value}</div>}
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

/** Shimmering placeholder block — use instead of a spinner wherever the
 * eventual content's shape is known ahead of time (cards, rows, stats). */
export function Skeleton({ width = '100%', height = 14, radius = 6, style }: { width?: number | string; height?: number; radius?: number; style?: CSSProperties }) {
  return <div className="skeleton" style={{ width, height, borderRadius: radius, ...style }} />;
}

export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="row" style={{ gap: 10, padding: '10px 0' }}>
          <Skeleton width={32} height={32} radius={999} />
          <div style={{ flex: 1 }}>
            <Skeleton width="60%" height={12} style={{ marginBottom: 6 }} />
            <Skeleton width="35%" height={11} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Richer empty state — icon, description, and one or two calls to action.
 * Use in place of the plain `Empty` text whenever a page's empty state is
 * a real dead-end for the user (nothing yet connected, no data at all) so
 * there's always a next step, never just a blank sentence.
 */
export function EmptyState({
  icon: Icon = InboxIcon, title, description, action, secondaryAction,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  secondaryAction?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-ic"><Icon size={26} /></div>
      <div className="text-h3" style={{ marginBottom: description ? 4 : 0 }}>{title}</div>
      {description && <p className="subtle" style={{ maxWidth: 340, margin: '0 auto' }}>{description}</p>}
      {(action || secondaryAction) && (
        <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 16 }}>
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.4), flexShrink: 0 }}>
      {initials}
    </div>
  );
}

/** Horizontal score meter (0-100) — color-coded low/mid/high, used for lead score. */
export function ScoreMeter({ value }: { value: number }) {
  const tier = value >= 70 ? 'high' : value >= 40 ? 'mid' : 'low';
  return (
    <div className="score-meter" title={`Score: ${value}/100`}>
      <div className={`score-meter-fill ${tier}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
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
