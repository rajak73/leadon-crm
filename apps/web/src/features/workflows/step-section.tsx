import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';

interface StepSectionProps {
  step: number | string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  id: string;
}

/** A numbered section of the workflow builder ("1 When", "2 Only if", …). */
export function StepSection({ step, title, description, children, id }: StepSectionProps) {
  return (
    <Card>
      <section aria-labelledby={id} className="p-4 sm:p-5">
        <div className="mb-4 flex items-start gap-3">
          <span
            aria-hidden
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-subtle type-small font-semibold text-primary-subtle-fg tabular-nums"
          >
            {step}
          </span>
          <div className="min-w-0">
            <h2 id={id} className="type-section text-fg">
              <span className="sr-only">Step {step}: </span>
              {title}
            </h2>
            {description && <p className="mt-0.5 type-small text-fg-muted">{description}</p>}
          </div>
        </div>
        {children}
      </section>
    </Card>
  );
}
