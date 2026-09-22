import { useId, type ReactNode } from 'react';
import { Switch } from '@/components/ui/switch';

interface SwitchRowProps {
  label: string;
  description: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Why the switch is disabled, shown under the description. */
  disabledReason?: string;
}

export function SwitchRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  disabledReason,
}: SwitchRowProps) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="type-body font-medium text-fg">
          {label}
        </label>
        <p id={`${id}-desc`} className="type-small text-fg-muted">
          {description}
          {disabled && disabledReason && (
            // The page shows the reason visibly once; screen readers still hear it per switch.
            <span className="sr-only">{disabledReason}</span>
          )}
        </p>
      </div>
      <Switch
        id={id}
        aria-describedby={`${id}-desc`}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}
