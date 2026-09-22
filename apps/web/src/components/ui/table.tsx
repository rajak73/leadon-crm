import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Scrollable table box: rows scroll inside it (the header stays pinned) and wide tables scroll
 * sideways here — never the page. Height fits the viewport below a page header and filters.
 */
export function TableContainer({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      // Focusable so keyboard users can scroll the rows and columns (WCAG 2.1.1).
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      className={cn(
        'max-h-[calc(100dvh-17.5rem)] min-h-40 w-full overflow-auto overscroll-contain focus-visible:ring-inset',
        className,
      )}
      {...rest}
    />
  );
}

export function Table({ className, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return <table className={cn('w-full border-collapse type-body', className)} {...rest} />;
}

export function THead({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('bg-muted', className)} {...rest} />;
}

export function TBody({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-border', className)} {...rest} />;
}

export function TR({ className, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        // Opaque row colours so pinned (sticky) cells can inherit them.
        'bg-surface transition-colors hover:bg-background data-[selected=true]:bg-primary-subtle',
        className,
      )}
      {...rest}
    />
  );
}

/**
 * Pins a column to the left edge while the table scrolls sideways. Pass the offset class
 * (`left-0`, `left-10`, …); add `edge` on the last pinned column to draw its divider.
 */
export function pinned(offset: string, { header = false, edge = false } = {}) {
  return cn(
    'sticky',
    offset,
    header ? 'z-20' : 'z-[1] bg-inherit',
    edge && 'shadow-[inset_-1px_0_0_var(--border)]',
    header && edge && 'shadow-[inset_-1px_-1px_0_var(--border)]',
  );
}

export function TH({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        // Pinned while the rows scroll; the inset shadow keeps the divider visible when stuck.
        'sticky top-0 z-10 h-10 bg-muted px-3 text-left align-middle type-caption font-medium whitespace-nowrap text-fg-muted shadow-[inset_0_-1px_0_var(--border)]',
        className,
      )}
      {...rest}
    />
  );
}

export function TD({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-2.5 align-middle', className)} {...rest} />;
}

interface SortableTHProps {
  children: ReactNode;
  field: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string) => void;
  className?: string;
}

/** Column header that sorts on click and exposes aria-sort. */
export function SortableTH({
  children,
  field,
  sortBy,
  sortOrder,
  onSort,
  className,
}: SortableTHProps) {
  const active = sortBy === field;
  const Icon = !active ? ArrowUpDown : sortOrder === 'asc' ? ArrowUp : ArrowDown;
  return (
    <TH
      aria-sort={active ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={className}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          '-mx-1.5 inline-flex items-center gap-1 rounded px-1.5 py-1 hover:bg-muted hover:text-fg',
          active && 'text-fg',
        )}
      >
        {children}
        <Icon aria-hidden className={cn('size-3.5', !active && 'opacity-50')} />
      </button>
    </TH>
  );
}
