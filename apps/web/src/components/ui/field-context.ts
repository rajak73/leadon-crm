import { createContext, useContext } from 'react';

/** Wiring FormField shares with the control inside it, even through a react-hook-form Controller. */
export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
}

export const FieldContext = createContext<FieldControlProps | null>(null);

/**
 * Merges FormField's wiring into a control's own props (explicit props win).
 * Custom controls call this so they stay labelled when wrapped in a Controller.
 */
export function useFieldControl<T extends Partial<FieldControlProps>>(
  props: T,
): T & Partial<FieldControlProps> {
  const field = useContext(FieldContext);
  if (!field) return props;
  return {
    ...props,
    id: props.id ?? field.id,
    'aria-describedby': props['aria-describedby'] ?? field['aria-describedby'],
    'aria-invalid': props['aria-invalid'] ?? field['aria-invalid'],
    'aria-required': props['aria-required'] ?? field['aria-required'],
  };
}
