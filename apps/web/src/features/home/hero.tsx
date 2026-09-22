import { Link } from 'react-router';
import { ArrowRight, Check, Languages } from 'lucide-react';
import { buttonClasses } from '@/components/ui/button';
import { ChatPreview } from './chat-preview';
import { useHomeCta } from './use-home-cta';

export function Hero() {
  const cta = useHomeCta();
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-gradient-to-b from-accent-subtle/90 to-transparent"
      />
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pt-16 pb-20 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-24 lg:pb-28">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 type-small text-fg-muted shadow-sm">
            <Languages aria-hidden className="size-4 text-primary-text" />
            Replies in Hindi, Hinglish or English
          </p>
          <h1 className="mt-6 text-4xl leading-[1.1] font-semibold tracking-tight text-balance text-fg sm:text-5xl lg:text-[3.5rem]">
            Every Instagram enquiry answered, tracked and closed.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-pretty text-fg-muted">
            LeadOS answers your DMs and comments in seconds using your own business info, turns
            every new contact into a lead, and keeps your whole sales pipeline in one place.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to={cta.to}
              className={buttonClasses({ variant: 'accent', size: 'lg', className: 'h-11 px-5' })}
            >
              {cta.label}
              <ArrowRight aria-hidden />
            </Link>
            <a
              href="#how-it-works"
              className={buttonClasses({
                variant: 'secondary',
                size: 'lg',
                className: 'h-11 px-5',
              })}
            >
              See how it works
            </a>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 type-small text-fg-muted">
            {[
              'Approve replies first, or let them go out on their own',
              'Hands over to you when a person is needed',
            ].map((point) => (
              <li key={point} className="flex items-center gap-1.5">
                <Check aria-hidden className="size-4 text-success" />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <ChatPreview />
      </div>
    </section>
  );
}
