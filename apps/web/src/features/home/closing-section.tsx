import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { buttonClasses } from '@/components/ui/button';
import { HomeLogo } from './logo';
import { useHomeCta } from './use-home-cta';

export function ClosingCta() {
  const cta = useHomeCta();
  return (
    <section aria-labelledby="closing-title" className="py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-2xl bg-primary px-6 py-14 text-center sm:px-12">
          <div
            aria-hidden
            className="absolute -top-24 -right-24 size-80 rounded-full bg-accent-glow/35 blur-3xl"
          />
          <h2
            id="closing-title"
            className="relative text-3xl font-semibold tracking-tight text-balance text-primary-fg sm:text-4xl"
          >
            {cta.signedIn ? 'Your leads are waiting' : 'Stop losing leads in your DMs'}
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-lg text-primary-fg/85">
            {cta.signedIn
              ? 'Jump back into your dashboard and see what came in.'
              : 'Answer faster, follow up on time, and see every deal in one place.'}
          </p>
          <Link
            to={cta.to}
            className={buttonClasses({
              size: 'lg',
              className: 'relative mt-8 h-11 bg-surface px-5 text-fg shadow-md hover:bg-muted',
            })}
          >
            {cta.label}
            <ArrowRight aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}

export function HomeFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
        <HomeLogo />
        <p className="type-small text-fg-subtle">
          © {new Date().getFullYear()} LeadOS. Leads, conversations and follow-ups in one place.
        </p>
      </div>
    </footer>
  );
}
