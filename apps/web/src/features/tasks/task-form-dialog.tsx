import { useEffect, useId, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { createTaskSchema, TASK_PRIORITIES, TASK_TYPES, type Task } from '@leados/shared';
import { useCreateTask, useUpdateTask } from '@/api/tasks';
import { useSession } from '@/providers/session';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input, Textarea } from '@/components/ui/input';
import { Select, optionsFrom } from '@/components/ui/select';
import { UserSelect } from '@/components/domain/user-select';
import { RecordPicker, type RecordRef } from '@/components/domain/record-picker';
import { taskPriorityLabels, taskTypeLabels } from '@/lib/labels';
import { toDateTimeInput } from '@/lib/format';
import { applyApiErrors } from '@/lib/forms';
import { notify } from '@/lib/toast';

type FormIn = z.input<typeof createTaskSchema>;
type FormOut = z.output<typeof createTaskSchema>;

interface TaskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit this task. */
  task?: Task | null;
  /** Pre-selected related record for new tasks (e.g. from a lead page). */
  defaultRelated?: RecordRef | null;
}

function relatedOf(task: Task): RecordRef | null {
  if (task.relatedLead)
    return { kind: 'lead', id: task.relatedLead.id, label: task.relatedLead.name };
  if (task.relatedContact)
    return { kind: 'contact', id: task.relatedContact.id, label: task.relatedContact.name };
  if (task.relatedDeal)
    return { kind: 'deal', id: task.relatedDeal.id, label: task.relatedDeal.title };
  return null;
}

export function TaskFormDialog({
  open,
  onOpenChange,
  task,
  defaultRelated = null,
}: TaskFormDialogProps) {
  const formId = useId();
  const { user } = useSession();
  const create = useCreateTask();
  const update = useUpdateTask();
  const [related, setRelated] = useState<RecordRef | null>(defaultRelated);
  const editing = Boolean(task);

  const form = useForm<FormIn, unknown, FormOut>({ resolver: zodResolver(createTaskSchema) });
  const { register, control, handleSubmit, reset, setError, formState } = form;
  const { errors, isSubmitting } = formState;

  useEffect(() => {
    if (!open) return;
    reset({
      title: task?.title ?? '',
      description: task?.description ?? '',
      type: task?.type ?? 'FOLLOW_UP',
      priority: task?.priority ?? 'MEDIUM',
      dueDate: toDateTimeInput(task?.dueDate),
      assignedToId: task ? (task.assignedTo?.id ?? null) : (user?.id ?? null),
    });
    setRelated(task ? relatedOf(task) : defaultRelated);
  }, [open, task, defaultRelated, reset, user?.id]);

  const onSubmit = handleSubmit(async (values) => {
    const dueDate = values.dueDate ? values.dueDate.toISOString() : null;
    try {
      if (task) {
        await update.mutateAsync({
          id: task.id,
          title: values.title,
          description: values.description ?? null,
          type: values.type,
          priority: values.priority,
          dueDate,
          assignedToId: values.assignedToId ?? null,
        });
        notify.success('Task updated');
      } else {
        await create.mutateAsync({
          ...values,
          dueDate,
          relatedLeadId: related?.kind === 'lead' ? related.id : null,
          relatedContactId: related?.kind === 'contact' ? related.id : null,
          relatedDealId: related?.kind === 'deal' ? related.id : null,
        });
        notify.success('Task created');
      }
      onOpenChange(false);
    } catch (e) {
      applyApiErrors(e, setError, { fallback: "We couldn't save the task." });
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={editing ? 'Edit task' : 'New task'}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form={formId} variant="primary" loading={isSubmitting}>
              {editing ? 'Save task' : 'Create task'}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <FormField label="Title" required error={errors.title?.message}>
            <Input {...register('title')} placeholder="e.g. Call to discuss pricing" autoFocus />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Type" error={errors.type?.message}>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    options={optionsFrom(TASK_TYPES, taskTypeLabels)}
                  />
                )}
              />
            </FormField>
            <FormField label="Priority" error={errors.priority?.message}>
              <Controller
                control={control}
                name="priority"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    options={optionsFrom(TASK_PRIORITIES, taskPriorityLabels)}
                  />
                )}
              />
            </FormField>
            <FormField label="Due" error={errors.dueDate?.message}>
              <Input type="datetime-local" {...register('dueDate')} />
            </FormField>
            <FormField label="Assigned to" error={errors.assignedToId?.message}>
              <Controller
                control={control}
                name="assignedToId"
                render={({ field }) => (
                  <UserSelect
                    value={field.value as string | null}
                    onChange={field.onChange}
                    noneLabel="Nobody"
                  />
                )}
              />
            </FormField>
          </div>
          <FormField
            label="Related to"
            description={
              editing
                ? 'The related record can’t be changed after the task is created.'
                : 'Optional: link a lead, contact or deal.'
            }
          >
            <RecordPicker value={related} onChange={setRelated} disabled={editing} />
          </FormField>
          <FormField label="Notes" error={errors.description?.message}>
            <Textarea
              {...register('description')}
              rows={3}
              placeholder="Anything worth remembering"
            />
          </FormField>
        </form>
      </DialogContent>
    </Dialog>
  );
}
