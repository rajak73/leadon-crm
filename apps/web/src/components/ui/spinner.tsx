import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role={label ? 'status' : undefined} className="inline-flex items-center">
      <Loader2 aria-hidden className={cn('size-4 animate-spin', className)} />
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}

/** Centered spinner for whole-screen loading (boot). */
export function FullPageSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background text-fg-muted">
      <Spinner className="size-6" label={label} />
    </div>
  );
}
