import { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface MultiSelectFilterProps<T extends string> {
  /** Button text, e.g. "Status". */
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: ReadonlyArray<T>;
  onChange: (value: T[]) => void;
}

/** Filter button that opens a checkbox list; shows how many values are picked. */
export function MultiSelectFilter<T extends string>({
  label,
  options,
  value,
  onChange,
}: MultiSelectFilterProps<T>) {
  const baseId = useId();
  const count = value.length;

  function toggle(v: T, checked: boolean) {
    const next = checked ? [...value, v] : value.filter((x) => x !== v);
    // Keep the option order stable in the URL.
    onChange(options.map((o) => o.value).filter((o) => next.includes(o)));
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="md"
          aria-label={count ? `${label}: ${count} selected` : label}
          className={count ? 'border-primary text-primary-text' : undefined}
        >
          {label}
          {count > 0 && (
            <span
              aria-hidden
              className="rounded-full bg-primary-subtle px-1.5 type-caption text-primary-subtle-fg tabular-nums"
            >
              {count}
            </span>
          )}
          <ChevronDown aria-hidden className="text-fg-subtle" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1.5">
        <fieldset>
          <legend className="sr-only">{label}</legend>
          <ul className="flex flex-col">
            {options.map((o) => {
              const id = `${baseId}-${o.value}`;
              return (
                <li
                  key={o.value}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                >
                  <Checkbox
                    id={id}
                    checked={value.includes(o.value)}
                    onCheckedChange={(c) => toggle(o.value, c === true)}
                  />
                  <Label htmlFor={id} className="flex-1 cursor-pointer font-normal">
                    {o.label}
                  </Label>
                </li>
              );
            })}
          </ul>
        </fieldset>
        {count > 0 && (
          <div className="mt-1 border-t border-border px-1 pt-1.5">
            <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange([])}>
              Clear {label.toLowerCase()}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
