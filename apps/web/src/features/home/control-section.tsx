import { Hand, PauseCircle, ShieldCheck, SlidersHorizontal, Send, Trash2 } from 'lucide-react';

const points = [
  {
    icon: ShieldCheck,
    title: 'Draft mode to start',
    text: 'The AI writes the reply and waits. You send it as is, edit it, or throw it away.',
  },
  {
    icon: Hand,
    title: 'Knows when to hand over',
    text: 'Complaints, bookings, payments or anything not in your business info come straight to you.',
  },
  {
    icon: PauseCircle,
    title: 'Never talks over you',
    text: 'Reply from the Instagram app and the AI steps back from that chat automatically.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Limits you set',
    text: 'A daily cap per conversation, a short wait so quick messages get one answer, and an off switch per chat.',
  },
];

export function ControlSection() {
  return (
    <section aria-labelledby="control-title" id="control" className="scroll-mt-20 py-20 sm:py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2">
        <div>
          <p className="type-small font-semibold tracking-wide text-primary-text uppercase">
            You stay in control
          </p>
          <h2
            id="control-title"
            className="mt-3 text-3xl font-semibold tracking-tight text-balance text-fg sm:text-4xl"
          >
            Fast answers, without losing the personal touch
          </h2>
          <ul className="mt-10 grid gap-6 sm:grid-cols-2">
            {points.map(({ icon: Icon, title, text }) => (
              <li key={title}>
                <Icon aria-hidden className="size-5 text-primary-text" />
                <h3 className="mt-3 type-section text-fg">{title}</h3>
                <p className="mt-1.5 type-body text-fg-muted">{text}</p>
              </li>
            ))}
          </ul>
        </div>
        <DraftPreview />
      </div>
    </section>
  );
}

/** Decorative mock of the draft-approval card from the inbox. */
function DraftPreview() {
  return (
    <figure className="mx-auto w-full max-w-md">
      <figcaption className="sr-only">
        Example of an AI draft waiting for approval, with Send and Discard buttons.
      </figcaption>
      <div aria-hidden className="rounded-2xl border border-border bg-surface p-5 shadow-lg">
        <div className="flex items-center justify-between">
          <p className="type-small font-medium text-fg">Reply to @rohit_builds</p>
          <span className="rounded-full bg-warning-subtle px-2 py-0.5 type-caption font-medium text-warning-fg">
            Draft ready
          </span>
        </div>
        <p className="mt-4 rounded-xl border border-border bg-background px-4 py-3 type-body text-fg-muted">
          <span className="text-fg">Customer:</span> Hello, do you do full home interiors for a 3BHK
          in Whitefield?
        </p>
        <div className="mt-3 rounded-xl border border-primary/40 bg-primary-subtle px-4 py-3 type-body text-primary-subtle-fg">
          Yes, we do! Full-home interiors for a 3BHK usually start around ₹6 lakh, depending on the
          design and materials. Would you like a free site visit in Whitefield this week?
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <span className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 type-small text-fg-muted">
            <Trash2 className="size-4" /> Discard
          </span>
          <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 type-small font-medium text-primary-fg">
            <Send className="size-4" /> Send
          </span>
        </div>
      </div>
    </figure>
  );
}
