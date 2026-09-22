import { LEAD_STATUSES, TASK_PRIORITIES, TASK_TYPES } from '@leados/shared';
import { FormField } from '@/components/ui/form-field';
import { Input, Textarea } from '@/components/ui/input';
import { Select, optionsFrom } from '@/components/ui/select';
import { UserSelect } from '@/components/domain/user-select';
import { leadStatusLabels, taskPriorityLabels, taskTypeLabels } from '@/lib/labels';
import type { ActionConfigState, ActionState } from './builder-state';
import { actionPath, type BuilderErrors } from './builder-validation';
import { AssignConfig } from './assign-config';
import { WebhookHeaders } from './webhook-headers';

interface ActionConfigProps {
  index: number;
  action: ActionState;
  errors: BuilderErrors;
  readOnly: boolean;
  onChange: (next: ActionState) => void;
}

const statusOptions = optionsFrom(
  LEAD_STATUSES.filter((s) => s !== 'WON'),
  leadStatusLabels,
);

/** The small config form for one action. Shapes match workflowActionSchema exactly. */
export function ActionConfig({ index, action, errors, readOnly, onChange }: ActionConfigProps) {
  const err = (field: string) => errors[actionPath(index, field)];
  const set = (patch: Partial<ActionConfigState>) =>
    onChange({ ...action, ...patch } as ActionState);

  switch (action.type) {
    case 'update_lead_status':
      return (
        <FormField label="New status" error={err('status')} className="sm:max-w-xs">
          <Select
            value={action.status || undefined}
            onValueChange={(v) => set({ status: v })}
            options={statusOptions}
            placeholder="Choose a status"
            disabled={readOnly}
          />
        </FormField>
      );
    case 'assign_lead':
      return (
        <AssignConfig
          index={index}
          action={action}
          error={err('userId')}
          readOnly={readOnly}
          onChange={(a) => onChange(a)}
        />
      );
    case 'add_tag':
      return (
        <FormField label="Tag" error={err('tag')} className="sm:max-w-xs">
          <Input
            value={action.tag}
            onChange={(e) => set({ tag: e.target.value })}
            maxLength={40}
            placeholder="e.g. hot"
            disabled={readOnly}
          />
        </FormField>
      );
    case 'create_task':
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Task title" required error={err('title')} className="sm:col-span-2">
            <Input
              value={action.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="e.g. Call to say hello"
              disabled={readOnly}
            />
          </FormField>
          <FormField label="Type" error={err('taskType')}>
            <Select
              value={action.taskType}
              onValueChange={(v) => set({ taskType: v })}
              options={optionsFrom(TASK_TYPES, taskTypeLabels)}
              disabled={readOnly}
            />
          </FormField>
          <FormField label="Priority" error={err('priority')}>
            <Select
              value={action.priority}
              onValueChange={(v) => set({ priority: v })}
              options={optionsFrom(TASK_PRIORITIES, taskPriorityLabels)}
              disabled={readOnly}
            />
          </FormField>
          <FormField
            label="Due in (hours)"
            description="0 means due straight away."
            error={err('dueInHours')}
          >
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={2160}
              step={1}
              value={action.dueInHours}
              onChange={(e) => set({ dueInHours: e.target.value })}
              disabled={readOnly}
            />
          </FormField>
          <FormField label="Assign to" error={err('assignTo')}>
            <UserSelect
              value={action.assignTo}
              onChange={(v) => set({ assignTo: v ?? 'record_owner' })}
              extraOptions={[{ value: 'record_owner', label: 'Record owner' }]}
              disabled={readOnly}
            />
          </FormField>
        </div>
      );
    case 'send_notification':
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Send to" error={err('recipient')}>
            <UserSelect
              value={action.recipient}
              onChange={(v) => set({ recipient: v ?? 'record_owner' })}
              extraOptions={[
                { value: 'record_owner', label: 'Record owner' },
                { value: 'all_admins', label: 'All admins' },
              ]}
              disabled={readOnly}
            />
          </FormField>
          <FormField label="Title" required error={err('title')}>
            <Input
              value={action.title}
              onChange={(e) => set({ title: e.target.value })}
              maxLength={120}
              placeholder="e.g. New hot lead"
              disabled={readOnly}
            />
          </FormField>
          <FormField label="Message" error={err('body')} className="sm:col-span-2">
            <Textarea
              value={action.body}
              onChange={(e) => set({ body: e.target.value })}
              maxLength={500}
              rows={2}
              disabled={readOnly}
            />
          </FormField>
        </div>
      );
    case 'rescore_lead':
      return (
        <p className="type-small text-fg-muted">
          The lead gets a fresh AI score. Nothing to set up.
        </p>
      );
    case 'outbound_webhook':
      return (
        <div className="flex flex-col gap-4">
          <FormField label="URL" required description="Must start with https://" error={err('url')}>
            <Input
              type="url"
              inputMode="url"
              value={action.url}
              onChange={(e) => set({ url: e.target.value })}
              placeholder="https://example.com/hooks/leados"
              disabled={readOnly}
              autoComplete="off"
            />
          </FormField>
          <WebhookHeaders
            actionIndex={index}
            rows={action.headers}
            errors={errors}
            readOnly={readOnly}
            onChange={(headers) => set({ headers })}
          />
          {err('headers') && (
            <p className="type-caption font-medium text-danger-fg">{err('headers')}</p>
          )}
        </div>
      );
  }
}
