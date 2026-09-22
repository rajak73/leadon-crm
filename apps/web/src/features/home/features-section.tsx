import {
  Bot,
  CheckSquare,
  Gauge,
  KanbanSquare,
  MessageCircle,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { SectionHeading } from './section-heading';

const features: Array<{ icon: LucideIcon; title: string; text: string }> = [
  {
    icon: MessageCircle,
    title: 'One inbox for Instagram',
    text: 'DMs and comments from all your posts in one place, with unread counts and a clear “needs you” list.',
  },
  {
    icon: Bot,
    title: 'AI replies that sound like you',
    text: 'Answers only from the prices, services and FAQs you write down — in the customer’s own language.',
  },
  {
    icon: Gauge,
    title: 'Leads scored for you',
    text: 'Every new contact becomes a lead with an AI score, so you know who to call first.',
  },
  {
    icon: KanbanSquare,
    title: 'A pipeline you can see',
    text: 'Drag deals from first chat to won. See what’s in play and what each stage is worth.',
  },
  {
    icon: CheckSquare,
    title: 'Follow-ups that happen',
    text: 'Tasks with due dates and reminders, grouped into overdue, today and upcoming.',
  },
  {
    icon: Workflow,
    title: 'Automations without code',
    text: 'When something happens, check a few conditions, then assign, tag, create a task or notify.',
  },
];

export function FeaturesSection() {
  return (
    <section aria-labelledby="features-title" id="features" className="scroll-mt-20 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          id="features-title"
          eyebrow="Features"
          title="From first message to closed deal"
          description="Everything a small team needs to turn Instagram attention into sales — without juggling chats, notes and spreadsheets."
        />
        <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => (
            <li
              key={title}
              className="group rounded-xl border border-border bg-surface p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <span className="flex size-10 items-center justify-center rounded-lg bg-accent-subtle text-accent-subtle-fg">
                <Icon aria-hidden className="size-5" />
              </span>
              <h3 className="mt-5 type-section text-fg">{title}</h3>
              <p className="mt-2 type-body text-fg-muted">{text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
