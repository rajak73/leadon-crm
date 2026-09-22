import { useId } from 'react';
import { Trash2 } from 'lucide-react';
import type { ConditionOperator } from '@leados/shared';
import type { WorkflowFieldMeta } from '@/api/workflows';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { conditionOperatorLabels } from '@/lib/labels';
import { isNoValueOperator, operatorsByType, type FieldConditionState } from './builder-state';
import { conditionPath, type BuilderErrors } from './builder-validation';
import { ConditionValue } from './condition-value';

interface ConditionRowProps {
  index: number;
  condition: FieldConditionState;
  fields: WorkflowFieldMeta[];
  errors: BuilderErrors;
  readOnly: boolean;
  onChange: (patch: Partial<FieldConditionState>) => void;
  onRemove: () => void;
}

export function ConditionRow({
  index,
  condition,
  fields,
  errors,
  readOnly,
  onChange,
  onRemove,
}: ConditionRowProps) {
  const id = useId();
  const meta = fields.find((f) => f.key === condition.field);
  const fieldError = errors[conditionPath(index, 'field')];
  const valueError = errors[conditionPath(index)] ?? errors[conditionPath(index, 'operator')];
  const errId = `${id}-error`;
  const fieldLabel = meta?.label ?? 'condition';

  return (
    <div
      role="group"
      aria-label={`Condition ${index + 1}`}
      className="rounded-lg border border-border bg-background p-3"
    >
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)_minmax(0,1.3fr)_auto] sm:items-start">
        <Select
          aria-label="Field"
          value={condition.field || undefined}
          placeholder="Choose a field"
          onValueChange={(key) => {
            const f = fields.find((x) => x.key === key);
            const type = f?.type ?? 'string';
            const ops = operatorsByType[type];
            onChange({
              field: key,
              fieldType: type,
              operator: ops.includes(condition.operator)
                ? condition.operator
                : (ops[0] as ConditionOperator),
              value: '',
              values: [],
            });
          }}
          options={fields.map((f) => ({ value: f.key, label: f.label }))}
          disabled={readOnly}
          aria-invalid={Boolean(fieldError)}
          aria-describedby={fieldError ? errId : undefined}
        />
        <Select
          aria-label="Comparison"
          value={condition.operator}
          onValueChange={(op) => onChange({ operator: op as ConditionOperator })}
          options={operatorsByType[condition.fieldType].map((o) => ({
            value: o,
            label: conditionOperatorLabels[o],
          }))}
          disabled={readOnly}
        />
        {isNoValueOperator(condition.operator) ? (
          <span className="hidden sm:block" />
        ) : (
          <div>
            <label htmlFor={`${id}-value`} className="sr-only">
              Value
            </label>
            <ConditionValue
              id={`${id}-value`}
              condition={condition}
              meta={meta}
              onChange={onChange}
              disabled={readOnly}
              describedBy={valueError ? errId : undefined}
              invalid={Boolean(valueError)}
            />
          </div>
        )}
        {!readOnly && (
          <Button
            variant="ghost"
            iconOnly
            aria-label={`Remove ${fieldLabel.toLowerCase()} condition`}
            icon={<Trash2 aria-hidden />}
            onClick={onRemove}
            className="justify-self-end"
          />
        )}
      </div>
      <p
        id={errId}
        aria-live="polite"
        className="type-caption font-medium text-danger-fg empty:hidden sm:mt-1"
      >
        {fieldError ?? valueError}
      </p>
    </div>
  );
}
