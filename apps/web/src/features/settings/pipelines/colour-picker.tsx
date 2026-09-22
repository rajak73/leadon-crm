import { useState } from 'react';
import { Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/cn';
import { colorName, STAGE_COLORS } from './stage-palette';

interface ColourPickerProps {
  value: string | null | undefined;
  onChange: (hex: string) => void;
  /** Used in the trigger's accessible name, e.g. "Colour for Proposal". */
  stageName: string;
}

export function ColourPicker({ value, onChange, stageName }: ColourPickerProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        aria-label={`Colour for ${stageName}: ${colorName(value)}`}
        className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border-strong bg-surface hover:bg-muted"
      >
        <span
          aria-hidden
          className={cn('size-4 rounded-full', !value && 'bg-fg-subtle')}
          style={value ? { backgroundColor: value } : undefined}
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto">
        <p className="mb-2 type-caption font-medium text-fg-muted">Stage colour</p>
        <div className="grid grid-cols-6 gap-1.5">
          {STAGE_COLORS.map((c) => {
            const selected = value?.toLowerCase() === c.hex.toLowerCase();
            return (
              <button
                key={c.hex}
                type="button"
                aria-label={c.name}
                aria-pressed={selected}
                title={c.name}
                onClick={() => {
                  onChange(c.hex);
                  setOpen(false);
                }}
                className={cn(
                  'flex size-7 items-center justify-center rounded-full ring-offset-2 ring-offset-surface-raised',
                  selected && 'ring-2 ring-fg',
                )}
                style={{ backgroundColor: c.hex }}
              >
                {selected && <Check aria-hidden className="size-4 text-white" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
