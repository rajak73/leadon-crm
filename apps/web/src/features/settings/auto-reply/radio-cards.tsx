import { useId } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';

export interface RadioCardOption<T extends string> {
  value: T;
  label: string;
  description: string;
  badge?: string;
}

interface RadioCardsProps<T extends string> {
  legend: string;
  name: string;
  value: T | undefined;
  onChange: (value: T) => void;
  options: ReadonlyArray<RadioCardOption<T>>;
  columns?: 2 | 3;
  disabled?: boolean;
}

/** Native radio buttons styled as cards (arrow keys work as usual). */
export function RadioCards<T extends string>({
  legend,
  name,
  value,
  onChange,
  options,
  columns = 2,
  disabled,
}: RadioCardsProps<T>) {
  const id = useId();
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="mb-2 type-small font-medium text-fg">{legend}</legend>
      <div className={cn('grid gap-3', columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'flex cursor-pointer gap-3 rounded-lg border border-border bg-surface p-3 transition-colors hover:border-border-strong',
              'has-[:checked]:border-primary has-[:checked]:bg-primary-subtle/40',
              'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
              'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-70',
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              aria-labelledby={`${id}-${o.value}-label`}
              aria-describedby={`${id}-${o.value}`}
              className="mt-0.5 size-4 shrink-0 accent-primary focus-visible:outline-none"
            />
            <span className="min-w-0 type-body font-medium text-fg">
              <span id={`${id}-${o.value}-label`}>{o.label}</span>
              {o.badge && (
                <Badge tone="primary" className="ml-2 align-middle">
                  {o.badge}
                </Badge>
              )}
              <span
                id={`${id}-${o.value}`}
                className="mt-0.5 block type-small font-normal text-fg-muted"
              >
                {o.description}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
