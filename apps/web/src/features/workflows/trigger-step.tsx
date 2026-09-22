import { LEAD_STATUSES, WORKFLOW_TRIGGERS, type WorkflowTrigger } from '@leados/shared';
import { usePipelines } from '@/api/pipelines';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { leadStatusLabels, workflowTriggerLabels } from '@/lib/labels';
import type { BuilderState } from './builder-state';
import type { BuilderErrors } from './builder-validation';
import { findStage } from './workflow-text';
import { StepSection } from './step-section';

const ANY = 'any';

interface TriggerStepProps {
  state: BuilderState;
  errors: BuilderErrors;
  readOnly: boolean;
  onTriggerChange: (type: WorkflowTrigger) => void;
  onConfigChange: (config: BuilderState['triggerConfig']) => void;
}

export function TriggerStep({
  state,
  errors,
  readOnly,
  onTriggerChange,
  onConfigChange,
}: TriggerStepProps) {
  const { data: pipelines = [] } = usePipelines();
  const stageId =
    typeof state.triggerConfig.stageId === 'string' ? state.triggerConfig.stageId : undefined;
  const found = findStage(pipelines, stageId);
  const pipelineId =
    found?.pipeline.id ??
    (typeof state.triggerConfig.pipelineId === 'string'
      ? state.triggerConfig.pipelineId
      : pipelines[0]?.id);
  const pipeline = pipelines.find((p) => p.id === pipelineId);

  return (
    <StepSection
      step={1}
      title="When"
      description="The event that starts this workflow."
      id="step-when"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Trigger" error={errors['definition.trigger.type']}>
          <Select
            value={state.triggerType}
            onValueChange={(v) => onTriggerChange(v as WorkflowTrigger)}
            options={WORKFLOW_TRIGGERS.map((t) => ({ value: t, label: workflowTriggerLabels[t] }))}
            disabled={readOnly}
          />
        </FormField>

        {state.triggerType === 'LEAD_STATUS_CHANGED' && (
          <FormField label="New status" description="Leave as “Any status” to run on every change.">
            <Select
              value={
                typeof state.triggerConfig.toStatus === 'string'
                  ? state.triggerConfig.toStatus
                  : ANY
              }
              onValueChange={(v) => onConfigChange(v === ANY ? {} : { toStatus: v })}
              options={[
                { value: ANY, label: 'Any status' },
                ...LEAD_STATUSES.map((s) => ({ value: s, label: leadStatusLabels[s] })),
              ]}
              disabled={readOnly}
            />
          </FormField>
        )}
      </div>

      {state.triggerType === 'DEAL_STAGE_MOVED' && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {pipelines.length > 1 && (
            <FormField label="Pipeline">
              <Select
                value={pipelineId}
                onValueChange={() => onConfigChange({})}
                options={pipelines.map((p) => ({ value: p.id, label: p.name }))}
                disabled={readOnly}
              />
            </FormField>
          )}
          <FormField label="Stage" description="Leave as “Any stage” to run on every move.">
            <Select
              value={stageId ?? ANY}
              onValueChange={(v) => onConfigChange(v === ANY ? {} : { stageId: v })}
              options={[
                { value: ANY, label: 'Any stage' },
                ...(pipeline?.stages ?? []).map((s) => ({ value: s.id, label: s.name })),
              ]}
              disabled={readOnly}
            />
          </FormField>
        </div>
      )}
    </StepSection>
  );
}
