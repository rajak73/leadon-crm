import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Label } from './label';
import { FieldContext } from './field-context';

interface ControlProps {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
}

interface FormFieldProps {
  label: ReactNode;
  /** Single form control; receives id / aria-describedby / aria-invalid. */
  children: ReactElement<ControlProps>;
  description?: ReactNode;
  error?: string;
  required?: boolean;
  /** Visually hide the label (still read by screen readers). */
  hideLabel?: boolean;
  className?: string;
  id?: string;
}

/**
 * Label + control + description + error, wired together for assistive tech:
 * the label's htmlFor matches the control id, and the description and error
 * are linked via aria-describedby. Errors are announced politely.
 */
export function FormField({
  label,
  children,
  description,
  error,
  required,
  hideLabel,
  className,
  id,
}: FormFieldProps) {
  const autoId = useId();
  const controlId = id ?? children.props.id ?? `field-${autoId}`;
  const descId = description ? `${controlId}-description` : undefined;
  const errId = error ? `${controlId}-error` : undefined;
  const describedBy =
    [children.props['aria-describedby'], descId, errId].filter(Boolean).join(' ') || undefined;

  const wiring = {
    id: controlId,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : undefined,
    'aria-required': required || undefined,
  };
  // Plain inputs get the props directly; custom controls rendered through a
  // react-hook-form Controller pick them up from context instead.
  const control = isValidElement(children) ? cloneElement(children, wiring) : children;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={controlId} className={hideLabel ? 'sr-only' : undefined}>
        {label}
        {required && (
          <span aria-hidden className="ml-0.5 text-danger-fg">
            *
          </span>
        )}
      </Label>
      <FieldContext.Provider value={wiring}>{control}</FieldContext.Provider>
      {description && (
        <p id={descId} className="type-caption text-fg-subtle">
          {description}
        </p>
      )}
      {/* Always-mounted live region so new errors are announced; collapses when empty. */}
      <div aria-live="polite" className={error ? undefined : '-mt-1.5'}>
        {error && (
          <p id={errId} className="type-caption font-medium text-danger-fg">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
