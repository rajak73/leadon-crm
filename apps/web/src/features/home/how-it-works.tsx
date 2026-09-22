import { SectionHeading } from './section-heading';

const steps = [
  {
    title: 'Connect Instagram',
    text: 'Link your business or creator account once. New DMs and comments start arriving in LeadOS right away.',
  },
  {
    title: 'Tell the AI about your business',
    text: 'Write your services, price ranges, timings and common questions in plain words. Try a sample message and see the answer before going live.',
  },
  {
    title: 'Watch leads come in',
    text: 'Customers get quick answers, new contacts become scored leads, and you step in whenever a conversation needs a person.',
  },
];

export function HowItWorks() {
  return (
    <section
      aria-labelledby="how-title"
      id="how-it-works"
      className="scroll-mt-20 border-y border-border bg-surface py-20 sm:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          id="how-title"
          eyebrow="How it works"
          title="Up and running in an afternoon"
        />
        <ol className="mt-14 grid gap-8 md:grid-cols-3 md:gap-6">
          {steps.map((step, i) => (
            <li key={step.title} className="relative">
              <span
                aria-hidden
                className="flex size-10 items-center justify-center rounded-full border border-border-strong bg-background type-section text-fg"
              >
                {i + 1}
              </span>
              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  className="absolute top-5 left-14 hidden h-px w-[calc(100%-4rem)] bg-border-strong md:block"
                />
              )}
              <h3 className="mt-5 type-section text-fg">{step.title}</h3>
              <p className="mt-2 type-body text-fg-muted">{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
