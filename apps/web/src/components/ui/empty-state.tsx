import type { ComponentType, ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './button';

interface EmptyStateProps {
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  title: string;
  text?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
  className,
  compact,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'px-4 py-6' : 'px-6 py-10',
        className,
      )}
    >
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted text-fg-muted">
        <Icon aria-hidden className="size-5" />
      </div>
      <p className="type-section text-fg">{title}</p>
      {text && <p className="mt-1 max-w-sm type-body text-fg-muted">{text}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
  compact?: boolean;
}

export function ErrorState({
  title = "We couldn't load this",
  message = 'Something went wrong. Please try again.',
  onRetry,
  retrying,
  className,
  compact,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'px-4 py-6' : 'px-6 py-10',
        className,
      )}
    >
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-danger-subtle text-danger-fg">
        <AlertTriangle aria-hidden className="size-5" />
      </div>
      <p className="type-section text-fg">{title}</p>
      <p className="mt-1 max-w-sm type-body text-fg-muted">{message}</p>
      {onRetry && (
        <Button
          className="mt-4"
          onClick={onRetry}
          loading={retrying}
          icon={<RotateCw aria-hidden />}
        >
          Try again
        </Button>
      )}
    </div>
  );
}
