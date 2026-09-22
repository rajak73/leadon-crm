import type { ReactNode } from 'react';

interface AuthCardProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

/** Centred card used by the sign-in and first-run setup screens. */
export function AuthCard({ title, description, children, footer }: AuthCardProps) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-gradient-to-b from-accent-subtle/80 to-transparent"
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span
            aria-hidden
            className="flex size-9 items-center justify-center rounded-lg bg-accent type-body font-bold text-accent-fg"
          >
            L
          </span>
          <span className="type-section text-fg">LeadOS</span>
        </div>
        <div className="rounded-xl border border-border bg-surface p-6 shadow-md">
          <h1 className="type-title text-fg">{title}</h1>
          {description && <p className="mt-1 type-body text-fg-muted">{description}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-4 text-center type-small text-fg-muted">{footer}</div>}
      </div>
    </main>
  );
}

/** Inline, announced form-level error (wrong password, locked account, rate limit…). */
export function FormAlert({ message, children }: { message: string | null; children?: ReactNode }) {
  return (
    <div aria-live="assertive">
      {message && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-transparent bg-danger-subtle px-3 py-2 type-small font-medium text-danger-fg"
        >
          {message}
          {children}
        </div>
      )}
    </div>
  );
}
