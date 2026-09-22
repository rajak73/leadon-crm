import { useEffect } from 'react';
import { HomeHeader } from './home-header';
import { Hero } from './hero';
import { FeaturesSection } from './features-section';
import { HowItWorks } from './how-it-works';
import { ControlSection } from './control-section';
import { FaqSection } from './faq-section';
import { ClosingCta, HomeFooter } from './closing-section';

export default function HomePage() {
  useEffect(() => {
    document.title = 'LeadOS · Instagram leads, answered and tracked';
  }, []);

  return (
    <div className="min-h-dvh bg-background text-fg">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-surface px-3 py-2 type-body text-fg shadow-md focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <HomeHeader />
      <main id="main">
        <Hero />
        <FeaturesSection />
        <HowItWorks />
        <ControlSection />
        <FaqSection />
        <ClosingCta />
      </main>
      <HomeFooter />
    </div>
  );
}
