import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, History, Workflow as WorkflowIcon } from 'lucide-react';
import type { Workflow, WorkflowTrigger } from '@leados/shared';
import {
  useCreateWorkflow,
  useUpdateWorkflow,
  useWorkflow,
  useWorkflowMeta,
} from '@/api/workflows';
import { useSession } from '@/providers/session';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input, Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { errorMessage, isApiError } from '@/lib/api-client';
import { notify } from '@/lib/toast';
import { emptyBuilderState, workflowToState, type BuilderState } from './builder-state';
import {
  apiErrorsToBuilder,
  validateWorkflowState,
  type BuilderErrors,
} from './builder-validation';
import { TriggerStep } from './trigger-step';
import { ConditionsStep } from './conditions-step';
import { ActionsStep } from './actions-step';

const backLink = (
  <Link
    to="/workflows"
    className="inline-flex items-center gap-1 type-small text-fg-muted hover:text-fg"
  >
    <ArrowLeft aria-hidden className="size-4" /> Workflows
  </Link>
);

export default function WorkflowEditorPage() {
  const { id } = useParams();
  const { data: workflow, isLoading, error, refetch } = useWorkflow(id);
  const meta = useWorkflowMeta();
  useDocumentTitle(id ? (workflow?.name ?? 'Workflow') : 'New workflow');

  if (id && isLoading) {
    return (
      <LoadingRegion label="Loading workflow…" className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-xl" />
        ))}
      </LoadingRegion>
    );
  }
  if (id && error) {
    const notFound = isApiError(error) && error.status === 404;
    return notFound ? (
      <EmptyState
        icon={WorkflowIcon}
        title="This workflow doesn't exist"
        text="It may have been deleted."
        action={
          <Link to="/workflows" className={buttonClasses({})}>
            Back to workflows
          </Link>
        }
      />
    ) : (
      <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
    );
  }
  return (
    <WorkflowEditor key={workflow?.id ?? 'new'} workflow={workflow} fields={meta.data?.fields} />
  );
}

function WorkflowEditor({
  workflow,
  fields,
}: {
  workflow?: Workflow;
  fields?: NonNullable<ReturnType<typeof useWorkflowMeta>['data']>['fields'];
}) {
  const navigate = useNavigate();
  const { isAdmin } = useSession();
  const readOnly = !isAdmin;
  const create = useCreateWorkflow();
  const update = useUpdateWorkflow();
  const [state, setState] = useState<BuilderState>(() =>
    workflow ? workflowToState(workflow, fields?.[workflow.triggerType]) : emptyBuilderState(),
  );
  const [errors, setErrors] = useState<BuilderErrors>({});
  const [note, setNote] = useState<string | null>(null);
  const saving = create.isPending || update.isPending;
  const triggerFields = fields?.[state.triggerType] ?? [];

  // Refine condition types once field metadata arrives (e.g. number vs string).
  useEffect(() => {
    if (workflow && fields)
      setState((s) => ({
        ...s,
        conditions: workflowToState(workflow, fields[s.triggerType]).conditions,
      }));
  }, [fields, workflow]);

  const patch = (p: Partial<BuilderState>) => setState((s) => ({ ...s, ...p }));

  function changeTrigger(type: WorkflowTrigger) {
    const nextFields = fields?.[type] ?? [];
    const kept = state.conditions.filter(
      (c) => c.kind === 'raw' || !c.field || nextFields.some((f) => f.key === c.field),
    );
    const dropped = state.conditions.length - kept.length;
    setNote(
      dropped > 0
        ? `Removed ${dropped} condition${dropped === 1 ? '' : 's'} that don't apply to the new trigger.`
        : null,
    );
    patch({ triggerType: type, triggerConfig: {}, conditions: kept });
  }

  async function save() {
    const { payload, errors: found } = validateWorkflowState(state);
    setErrors(found);
    if (!payload) return;
    try {
      if (workflow) {
        await update.mutateAsync({ id: workflow.id, ...payload });
        notify.success('Workflow saved');
      } else {
        const created = await create.mutateAsync(payload);
        notify.success('Workflow created');
        navigate(`/workflows/${created.id}`, { replace: true });
      }
    } catch (e) {
      const mapped = apiErrorsToBuilder(e, state);
      if (mapped) setErrors(mapped);
      else notify.error(e, "We couldn't save the workflow.");
    }
  }

  const errorCount = Object.keys(errors).length;

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <PageHeader
        eyebrow={backLink}
        title={workflow ? workflow.name : 'New workflow'}
        description={
          readOnly
            ? 'Only admins can edit workflows.'
            : 'Pick a trigger, add optional conditions, then choose what happens.'
        }
        actions={
          workflow && (
            <Link to={`/workflows/${workflow.id}/runs`} className={buttonClasses({})}>
              <History aria-hidden /> Run history
            </Link>
          )
        }
      />
      <div className="flex flex-col gap-4">
        <Card className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <FormField label="Name" required error={errors['name']}>
            <Input
              value={state.name}
              onChange={(e) => patch({ name: e.target.value })}
              maxLength={100}
              placeholder="e.g. Welcome new leads"
              disabled={readOnly}
            />
          </FormField>
          <FormField label="Description" error={errors['description']}>
            <Textarea
              value={state.description}
              onChange={(e) => patch({ description: e.target.value })}
              rows={1}
              maxLength={500}
              placeholder="What it's for (optional)"
              disabled={readOnly}
            />
          </FormField>
        </Card>
        <TriggerStep
          state={state}
          errors={errors}
          readOnly={readOnly}
          onTriggerChange={changeTrigger}
          onConfigChange={(triggerConfig) => patch({ triggerConfig })}
        />
        <ConditionsStep
          conditions={state.conditions}
          fields={triggerFields}
          errors={errors}
          readOnly={readOnly}
          note={note}
          onChange={(conditions) => patch({ conditions })}
        />
        <ActionsStep
          actions={state.actions}
          errors={errors}
          readOnly={readOnly}
          onChange={(actions) => patch({ actions })}
        />

        {!readOnly && (
          <div className="sticky bottom-0 -mx-4 flex flex-col gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:rounded-xl sm:border sm:bg-surface sm:px-5">
            <div className="flex items-center gap-2">
              <Switch
                id="wf-active"
                checked={state.isActive}
                onCheckedChange={(isActive) => patch({ isActive })}
              />
              <label htmlFor="wf-active" className="type-body text-fg">
                {workflow ? 'Workflow is on' : 'Turn on after saving'}
              </label>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <p aria-live="polite" className="type-small font-medium text-danger-fg empty:hidden">
                {errorCount > 0 ? 'Fix the highlighted fields, then save again.' : ''}
              </p>
              <Button type="submit" variant="primary" loading={saving}>
                {saving ? 'Saving…' : 'Save workflow'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </form>
  );
}
