import { useId } from 'react';
import { FormField } from '@/components/ui/form-field';
import { UserSelect } from '@/components/domain/user-select';
import type { ActionState } from './builder-state';

type AssignAction = Extract<ActionState, { type: 'assign_lead' }>;

interface AssignConfigProps {
  index: number;
  action: AssignAction;
  error?: string;
  readOnly: boolean;
  onChange: (a: AssignAction) => void;
}

export function AssignConfig({ index, action, error, readOnly, onChange }: AssignConfigProps) {
  const name = `assign-strategy-${index}-${useId()}`;
  const options = [
    {
      value: 'round_robin' as const,
      label: 'Take turns (round robin)',
      hint: 'Shares leads out evenly across active teammates.',
    },
    {
      value: 'user' as const,
      label: 'A specific person',
      hint: 'Always give the lead to the same teammate.',
    },
  ];
  return (
    <div className="flex flex-col gap-3">
      <fieldset>
        <legend className="type-small font-medium text-fg">Who gets the lead</legend>
        <div className="mt-2 flex flex-col gap-2">
          {options.map((o) => {
            const id = `${name}-${o.value}`;
            return (
              <div key={o.value} className="flex items-start gap-2">
                <input
                  type="radio"
                  id={id}
                  name={name}
                  checked={action.strategy === o.value}
                  onChange={() => onChange({ ...action, strategy: o.value })}
                  disabled={readOnly}
                  className="mt-1 size-4 accent-primary"
                />
                <label htmlFor={id} className="type-body text-fg">
                  {o.label}
                  <span className="block type-caption text-fg-subtle">{o.hint}</span>
                </label>
              </div>
            );
          })}
        </div>
      </fieldset>
      {action.strategy === 'user' && (
        <FormField label="Person" error={error} className="sm:max-w-xs">
          <UserSelect
            value={action.userId || null}
            onChange={(v) => onChange({ ...action, userId: v ?? '' })}
            disabled={readOnly}
          />
        </FormField>
      )}
    </div>
  );
}
