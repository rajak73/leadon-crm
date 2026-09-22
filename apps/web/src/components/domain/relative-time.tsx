import { formatDateTime, formatRelative } from '@/lib/format';
import { cn } from '@/lib/cn';

/** "3 hours ago" with the full date in a native tooltip and machine-readable datetime. */
export function RelativeTime({
  date,
  className,
}: {
  date: string | null | undefined;
  className?: string;
}) {
  if (!date) return <span className={cn('text-fg-subtle', className)}>—</span>;
  return (
    <time dateTime={date} title={formatDateTime(date)} className={className}>
      {formatRelative(date)}
    </time>
  );
}
