import { Plus } from 'lucide-react';
import type { WorkflowFieldMeta } from '@/api/workflows';
import { Button } from '@/components/ui/button';
import { emptyCondition, type ConditionState, type FieldConditionState } from './builder-state';
import type { BuilderErrors } from './builder-validation';
import { ConditionRow } from './condition-row';
import { StepSection } from './step-section';

interface ConditionsStepProps {
  conditions: ConditionState[];
  fields: WorkflowFieldMeta[];
  errors: BuilderErrors;
  readOnly: boolean;
  note?: string | null;
  onChange: (conditions: ConditionState[]) => void;
}

export function ConditionsStep({
  conditions,
  fields,
  errors,
  readOnly,
  note,
  onChange,
}: ConditionsStepProps) {
  const update = (i: number, patch: Partial<FieldConditionState>) =>
    onChange(
      conditions.map((c, idx) => (idx === i && c.kind === 'field' ? { ...c, ...patch } : c)),
    );
  const hasRaw = conditions.some((c) => c.kind === 'raw');

  return (
    <StepSection
      step={2}
      title="Only if"
      description="Optional. The workflow only runs when all of these are true."
      id="step-only-if"
    >
      {note && (
        <p
          role="status"
          className="mb-3 rounded-md bg-info-subtle px-3 py-2 type-small text-info-fg"
        >
          {note}
        </p>
      )}
      {conditions.length === 0 ? (
        <p className="type-small text-fg-muted">
          No conditions — it runs every time the trigger happens.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {conditions.map((c, i) => (
            <li key={c.key} className="flex flex-col gap-2">
              {i > 0 && <span className="type-caption font-semibold text-fg-subtle">and</span>}
              {c.kind === 'field' ? (
                <ConditionRow
                  index={i}
                  condition={c}
                  fields={fields}
                  errors={errors}
                  readOnly={readOnly}
                  onChange={(patch) => update(i, patch)}
                  onRemove={() => onChange(conditions.filter((_, idx) => idx !== i))}
                />
              ) : (
                <div className="rounded-lg border border-dashed border-border-strong p-3 type-small text-fg-muted">
                  Advanced condition (kept as is)
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      {hasRaw && (
        <p className="mt-3 type-small text-fg-muted">
          This workflow has advanced conditions that can’t be edited here.
        </p>
      )}
      {!readOnly && (
        <Button
          size="sm"
          className="mt-3"
          icon={<Plus aria-hidden />}
          onClick={() => onChange([...conditions, emptyCondition()])}
          disabled={conditions.length >= 20 || fields.length === 0}
        >
          Add condition
        </Button>
      )}
    </StepSection>
  );
}
