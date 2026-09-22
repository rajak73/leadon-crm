import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import type { Tone } from '@/lib/labels';

const tones: Record<Tone, string> = {
  neutral: 'bg-muted text-fg-muted border-border',
  primary: 'bg-primary-subtle text-primary-subtle-fg border-transparent',
  success: 'bg-success-subtle text-success-fg border-transparent',
  warning: 'bg-warning-subtle text-warning-fg border-transparent',
  danger: 'bg-danger-subtle text-danger-fg border-transparent',
  info: 'bg-info-subtle text-info-fg border-transparent',
};

const dots: Record<Tone, string> = {
  neutral: 'bg-fg-subtle',
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  dot?: boolean;
}

export function Badge({ tone = 'neutral', dot, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1.5 rounded-full border px-2 type-caption font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
      {...rest}
    >
      {dot && <span aria-hidden className={cn('size-1.5 rounded-full', dots[tone])} />}
      {children}
    </span>
  );
}
