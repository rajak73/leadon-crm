import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

/** A closed-by-default section for things most people never need to touch. */
export function Disclosure({
  title,
  description,
  forceOpen = false,
  children,
}: {
  title: string;
  description?: string;
  /** Opens the section (e.g. when a field inside has an error). */
  forceOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={forceOpen || undefined}
      className="group rounded-xl border border-border bg-surface shadow-sm [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-4">
        <ChevronRight
          aria-hidden
          className="size-4 shrink-0 text-fg-subtle transition-transform group-open:rotate-90"
        />
        <span className="min-w-0 flex-1">
          <span className="block type-section text-fg">{title}</span>
          {description && <span className="block type-small text-fg-muted">{description}</span>}
        </span>
      </summary>
      <div className="flex flex-col gap-4 border-t border-border px-4 py-4">{children}</div>
    </details>
  );
}
