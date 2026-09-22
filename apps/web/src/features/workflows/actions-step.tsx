import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { WORKFLOW_ACTIONS, type WorkflowActionType } from '@leados/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { workflowActionDescriptions, workflowActionLabels } from '@/lib/labels';
import { defaultAction, type ActionState } from './builder-state';
import { actionPath, type BuilderErrors } from './builder-validation';
import { ActionConfig } from './action-config';
import { StepSection } from './step-section';

interface ActionsStepProps {
  actions: ActionState[];
  errors: BuilderErrors;
  readOnly: boolean;
  onChange: (actions: ActionState[]) => void;
}

export function ActionsStep({ actions, errors, readOnly, onChange }: ActionsStepProps) {
  const move = (from: number, to: number) => {
    const next = [...actions];
    const [item] = next.splice(from, 1);
    if (item) next.splice(to, 0, item);
    onChange(next);
  };
  const listError = errors['definition.actions'];

  return (
    <StepSection
      step={3}
      title="Then"
      description="What LeadOS does, in this order."
      id="step-then"
    >
      <p aria-live="polite" className="mb-2 type-small font-medium text-danger-fg empty:hidden">
        {listError}
      </p>
      <ol className="flex flex-col gap-3">
        {actions.map((a, i) => {
          const label = workflowActionLabels[a.type];
          return (
            <li key={a.key} className="rounded-lg border border-border bg-background">
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-muted type-caption font-semibold text-fg-muted tabular-nums">
                  {i + 1}
                </span>
                <h3 className="min-w-0 flex-1 truncate type-body font-medium text-fg">{label}</h3>
                {!readOnly && (
                  <div className="flex items-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      aria-label={`Move “${label}” up`}
                      icon={<ArrowUp aria-hidden />}
                      disabled={i === 0}
                      onClick={() => move(i, i - 1)}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      aria-label={`Move “${label}” down`}
                      icon={<ArrowDown aria-hidden />}
                      disabled={i === actions.length - 1}
                      onClick={() => move(i, i + 1)}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      aria-label={`Remove “${label}”`}
                      icon={<Trash2 aria-hidden />}
                      onClick={() => onChange(actions.filter((_, idx) => idx !== i))}
                    />
                  </div>
                )}
              </div>
              <div className="p-3">
                <ActionConfig
                  index={i}
                  action={a}
                  errors={errors}
                  readOnly={readOnly}
                  onChange={(next) => onChange(actions.map((x, idx) => (idx === i ? next : x)))}
                />
                {errors[actionPath(i)] && (
                  <p className="mt-2 type-caption font-medium text-danger-fg">
                    {errors[actionPath(i)]}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {actions.length === 0 && <p className="type-small text-fg-muted">Add at least one action.</p>}
      {!readOnly && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              className="mt-3"
              icon={<Plus aria-hidden />}
              disabled={actions.length >= 10}
            >
              Add action
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-80">
            {WORKFLOW_ACTIONS.map((t: WorkflowActionType) => (
              <DropdownMenuItem
                key={t}
                onSelect={() => onChange([...actions, defaultAction(t)])}
                className="flex-col items-start gap-0"
              >
                <span className="font-medium">{workflowActionLabels[t]}</span>
                <span className="type-caption text-fg-subtle">{workflowActionDescriptions[t]}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </StepSection>
  );
}
