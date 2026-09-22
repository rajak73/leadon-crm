import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { enumOptionLabel } from '@/lib/labels';
import type { WorkflowFieldMeta } from '@/api/workflows';
import { isMultiOperator, type FieldConditionState } from './builder-state';

interface ConditionValueProps {
  condition: FieldConditionState;
  meta: WorkflowFieldMeta | undefined;
  onChange: (patch: Partial<FieldConditionState>) => void;
  disabled: boolean;
  id: string;
  describedBy?: string;
  invalid: boolean;
}

/** Value input typed by the field: select for enums, number input for numbers, text otherwise. */
export function ConditionValue({
  condition,
  meta,
  onChange,
  disabled,
  id,
  describedBy,
  invalid,
}: ConditionValueProps) {
  const aria = { 'aria-describedby': describedBy, 'aria-invalid': invalid || undefined };
  const options = meta?.options ?? [];

  if (condition.fieldType === 'enum' && isMultiOperator(condition.operator)) {
    return (
      <fieldset
        id={id}
        className="flex flex-wrap gap-x-4 gap-y-2 rounded-md border border-border p-2.5"
        {...aria}
      >
        <legend className="sr-only">Values</legend>
        {options.map((opt) => {
          const optId = `${id}-${opt}`;
          const checked = condition.values.includes(opt);
          return (
            <span key={opt} className="flex items-center gap-2">
              <Checkbox
                id={optId}
                checked={checked}
                disabled={disabled}
                onCheckedChange={(c) =>
                  onChange({
                    values:
                      c === true
                        ? [...condition.values, opt]
                        : condition.values.filter((v) => v !== opt),
                  })
                }
              />
              <label htmlFor={optId} className="type-small text-fg">
                {enumOptionLabel(opt)}
              </label>
            </span>
          );
        })}
      </fieldset>
    );
  }

  if (condition.fieldType === 'enum') {
    return (
      <Select
        id={id}
        value={condition.value || undefined}
        onValueChange={(v) => onChange({ value: v })}
        options={options.map((o) => ({ value: o, label: enumOptionLabel(o) }))}
        placeholder="Choose a value"
        disabled={disabled}
        {...aria}
      />
    );
  }

  return (
    <Input
      id={id}
      type={condition.fieldType === 'number' ? 'number' : 'text'}
      inputMode={condition.fieldType === 'number' ? 'decimal' : undefined}
      value={condition.value}
      onChange={(e) => onChange({ value: e.target.value })}
      placeholder={condition.fieldType === 'tags' ? 'Tag' : 'Value'}
      disabled={disabled}
      {...aria}
    />
  );
}
