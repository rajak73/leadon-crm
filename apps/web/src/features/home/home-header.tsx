import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { buttonClasses } from '@/components/ui/button';
import { HomeLogo } from './logo';
import { useHomeCta } from './use-home-cta';

const sections = [
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#control', label: 'You stay in control' },
  { href: '#faq', label: 'FAQ' },
];

export function HomeHeader() {
  const cta = useHomeCta();
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <HomeLogo />
        <nav aria-label="Page sections" className="hidden flex-1 md:block">
          <ul className="flex items-center gap-1">
            {sections.map((s) => (
              <li key={s.href}>
                <a
                  href={s.href}
                  className="rounded-md px-3 py-2 type-body text-fg-muted transition-colors hover:bg-muted hover:text-fg"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link to={cta.to} className={buttonClasses({ variant: 'primary', size: 'md' })}>
            {cta.label}
            <ArrowRight aria-hidden />
          </Link>
        </div>
      </div>
    </header>
  );
}
