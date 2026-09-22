import { ChevronDown } from 'lucide-react';
import { SectionHeading } from './section-heading';

const faqs = [
  {
    q: 'Can it reply in Hindi or Hinglish?',
    a: 'Yes. The AI answers in the language and script the customer writes in — Hindi, Hinglish, English and others.',
  },
  {
    q: 'What if the AI doesn’t know the answer?',
    a: 'It doesn’t guess. If the answer isn’t in your business info, or the customer wants a person, it pauses that chat, sends a short holding message if you want one, and notifies you.',
  },
  {
    q: 'Can I check replies before they go out?',
    a: 'Yes. In draft mode every reply waits for you to send, edit or discard it. Switch to automatic sending when you trust the answers.',
  },
  {
    q: 'Does it reply to comments too?',
    a: 'Yes — with a public reply under the comment, a private DM to the person, or both. Spam is skipped and complaints come to you.',
  },
  {
    q: 'Which AI does it use?',
    a: 'Gemini, Groq or OpenAI — whichever key is set on the server. Without a key, lead scoring uses built-in rules and nothing is sent to any AI service.',
  },
  {
    q: 'Does it work on my phone?',
    a: 'Yes. LeadOS works in any modern browser, on desktop and mobile.',
  },
];

export function FaqSection() {
  return (
    <section
      aria-labelledby="faq-title"
      id="faq"
      className="scroll-mt-20 border-t border-border bg-surface py-20 sm:py-24"
    >
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <SectionHeading id="faq-title" eyebrow="FAQ" title="Questions, answered" />
        <div className="mt-12 divide-y divide-border rounded-xl border border-border bg-background">
          {faqs.map(({ q, a }) => (
            <details key={q} className="group px-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-md py-4 type-section text-fg">
                {q}
                <ChevronDown
                  aria-hidden
                  className="size-5 shrink-0 text-fg-subtle transition-transform group-open:rotate-180"
                />
              </summary>
              <p className="pb-5 type-body text-fg-muted">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
