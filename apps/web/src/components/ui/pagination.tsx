import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PageMeta } from '@leados/shared';
import { formatNumber } from '@/lib/format';
import { Button } from './button';

interface PaginationProps {
  meta: PageMeta | undefined;
  onPageChange: (page: number) => void;
  /** Noun for the summary, e.g. "leads". */
  noun?: string;
}

export function Pagination({ meta, onPageChange, noun = 'results' }: PaginationProps) {
  if (!meta || meta.total === 0) return null;
  const from = (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.page * meta.limit, meta.total);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 px-1 py-3">
      <p className="type-small text-fg-muted tabular-nums">
        {formatNumber(from)}–{formatNumber(to)} of {formatNumber(meta.total)} {noun}
      </p>
      {meta.totalPages > 1 && (
        <div className="flex items-center gap-2">
          <span className="hidden type-small text-fg-muted tabular-nums sm:inline">
            Page {meta.page} of {meta.totalPages}
          </span>
          <Button
            size="sm"
            iconOnly
            aria-label="Previous page"
            icon={<ChevronLeft aria-hidden />}
            disabled={meta.page <= 1}
            onClick={() => onPageChange(meta.page - 1)}
          />
          <Button
            size="sm"
            iconOnly
            aria-label="Next page"
            icon={<ChevronRight aria-hidden />}
            disabled={meta.page >= meta.totalPages}
            onClick={() => onPageChange(meta.page + 1)}
          />
        </div>
      )}
    </nav>
  );
}
