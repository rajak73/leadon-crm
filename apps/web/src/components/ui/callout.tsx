import type { ReactNode } from 'react';
import { AlertTriangle, CircleAlert, Info, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

type CalloutTone = 'info' | 'warning' | 'danger';

const tones: Record<CalloutTone, { box: string; icon: LucideIcon }> = {
  info: { box: 'border-info/30 bg-info-subtle text-info-fg', icon: Info },
  warning: { box: 'border-warning/30 bg-warning-subtle text-warning-fg', icon: AlertTriangle },
  danger: { box: 'border-danger/30 bg-danger-subtle text-danger-fg', icon: CircleAlert },
};

interface CalloutProps {
  tone?: CalloutTone;
  title?: ReactNode;
  children?: ReactNode;
  /** Buttons shown under the text. */
  actions?: ReactNode;
  className?: string;
  /** Announce the callout when it appears (for problems that show up after an action). */
  live?: boolean;
}

/** Inline message box for tips, warnings and problems. Colour is never the only signal. */
export function Callout({
  tone = 'info',
  title,
  children,
  actions,
  className,
  live,
}: CalloutProps) {
  const { box, icon: Icon } = tones[tone];
  return (
    <div
      role={live ? (tone === 'info' ? 'status' : 'alert') : undefined}
      className={cn('flex gap-3 rounded-lg border px-4 py-3', box, className)}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 type-small">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'text-fg-muted')}>{children}</div>}
        {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
