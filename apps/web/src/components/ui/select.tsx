import { forwardRef, type ReactNode } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { fieldBase } from './input';
import { useFieldControl } from './field-context';

export interface SelectOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

interface SelectProps {
  value: string | undefined;
  onValueChange: (value: string) => void;
  options: ReadonlyArray<SelectOption>;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  size?: 'sm' | 'md';
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
  name?: string;
}

/**
 * Accessible select built on Radix. Radix doesn't allow an empty-string item
 * value, so use a sentinel (e.g. "none") for "no selection" options.
 */
export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select(
  {
    value,
    onValueChange,
    options,
    placeholder = 'Select…',
    disabled,
    className,
    size = 'md',
    ...ownAria
  },
  ref,
) {
  const aria = useFieldControl(ownAria);
  return (
    <SelectPrimitive.Root
      value={value || undefined}
      onValueChange={onValueChange}
      disabled={disabled}
      name={aria.name}
    >
      <SelectPrimitive.Trigger
        ref={ref}
        id={aria.id}
        aria-label={aria['aria-label']}
        aria-describedby={aria['aria-describedby']}
        aria-invalid={aria['aria-invalid']}
        aria-required={aria['aria-required']}
        className={cn(
          fieldBase,
          'flex items-center justify-between gap-2 text-left',
          size === 'sm' ? 'h-8 px-2.5 type-small' : 'h-9 px-3 type-body',
          'data-[placeholder]:text-fg-subtle',
          className,
        )}
      >
        <span className="truncate">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon>
          <ChevronDown aria-hidden className="size-4 text-fg-subtle" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className={cn(
            'z-50 max-h-[min(20rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)]',
            'overflow-hidden rounded-lg border border-border bg-surface-raised shadow-lg animate-scale-in',
          )}
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                className={cn(
                  'relative flex cursor-pointer items-center rounded-md py-1.5 pr-8 pl-2.5 type-body text-fg outline-none select-none',
                  'data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
                )}
              >
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-2 inline-flex items-center">
                  <Check aria-hidden className="size-4 text-primary-text" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
});

/** Build select options from a label map, in the order of the given values. */
export function optionsFrom<T extends string>(
  values: ReadonlyArray<T>,
  labels: Record<T, string>,
): SelectOption[] {
  return values.map((v) => ({ value: v, label: labels[v] }));
}
