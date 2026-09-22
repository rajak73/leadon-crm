import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-xl border border-border bg-surface shadow-sm', className)}
      {...rest}
    />
  );
}

interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Heading level for the title; defaults to h2. */
  as?: 'h2' | 'h3';
  className?: string;
  id?: string;
}

export function CardHeader({
  title,
  description,
  actions,
  as: Heading = 'h2',
  className,
  id,
}: CardHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-4 pt-4 pb-3', className)}>
      <div className="min-w-0">
        <Heading id={id} className="type-section text-fg">
          {title}
        </Heading>
        {description && <p className="mt-0.5 type-small text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 pb-4', className)} {...rest} />;
}
