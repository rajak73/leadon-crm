import { useEffect, useId, useState } from 'react';
import { Controller, FormProvider, useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { createPipelineSchema, type Pipeline } from '@leados/shared';
import { useCreatePipeline, useUpdatePipeline } from '@/api/pipelines';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { errorMessage, isApiError } from '@/lib/api-client';
import { applyApiErrors } from '@/lib/forms';
import { notify } from '@/lib/toast';
import {
  formValuesFrom,
  newStage,
  toPipelinePayload,
  type PipelineFormIn,
  type PipelineFormOut,
} from './editor-state';
import { StageRow } from './stage-row';

/** Stage rows only move up and down. */
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

interface PipelineEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pipeline to edit; null/undefined creates a new one. */
  pipeline?: Pipeline | null;
}

export function PipelineEditorDialog({ open, onOpenChange, pipeline }: PipelineEditorDialogProps) {
  const formId = useId();
  const create = useCreatePipeline();
  const update = useUpdatePipeline();
  const [serverError, setServerError] = useState<string | null>(null);

  // The editor always sends the full name + ordered stage list, so the create
  // schema (which requires everything) validates both create and update.
  const form = useForm<PipelineFormIn, unknown, PipelineFormOut>({
    resolver: zodResolver(createPipelineSchema),
    defaultValues: formValuesFrom(pipeline ?? null),
  });
  const { register, control, handleSubmit, reset, setError, getValues, setValue, formState } = form;
  const { errors, isSubmitting, isSubmitted } = formState;
  const { fields, append, insert, remove, move } = useFieldArray({
    control,
    name: 'stages',
    keyName: 'key',
  });

  useEffect(() => {
    if (!open) return;
    reset(formValuesFrom(pipeline ?? null));
    setServerError(null);
  }, [open, pipeline, reset]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = fields.findIndex((f) => f.key === active.id);
    const to = fields.findIndex((f) => f.key === over.id);
    if (from >= 0 && to >= 0) move(from, to);
  }

  function mark(flag: 'isWon' | 'isLost', index: number) {
    const other = flag === 'isWon' ? 'isLost' : 'isWon';
    getValues('stages').forEach((_, i) => {
      setValue(`stages.${i}.${flag}`, i === index, { shouldDirty: true });
      if (i === index) setValue(`stages.${i}.${other}`, false, { shouldDirty: true });
    });
    if (isSubmitted) void form.trigger('stages');
  }

  function addStage() {
    // New stages go before the closing (won/lost) stages, where they're usually wanted.
    const stages = getValues('stages');
    const firstClosing = stages.findIndex((s) => s.isWon || s.isLost);
    if (firstClosing === -1) append(newStage(stages.length));
    else insert(firstClosing, newStage(stages.length));
  }

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const body = toPipelinePayload(values);
    try {
      if (pipeline) {
        await update.mutateAsync({ id: pipeline.id, ...body });
        notify.success('Pipeline saved');
      } else {
        await create.mutateAsync(body);
        notify.success('Pipeline created');
      }
      onOpenChange(false);
    } catch (e) {
      if (isApiError(e) && e.status === 409) {
        // e.g. removing a stage that still has deals — explain inline and in a toast.
        setServerError(errorMessage(e));
        notify.error(e);
        return;
      }
      applyApiErrors(e, setError, { fallback: "We couldn't save the pipeline." });
    }
  });

  const listError = errors.stages?.root?.message ?? errors.stages?.message ?? serverError;

  return (
    <Dialog open={open} onOpenChange={(o) => !isSubmitting && onOpenChange(o)}>
      <DialogContent
        size="lg"
        title={pipeline ? `Edit “${pipeline.name}”` : 'New pipeline'}
        description="Stages run left to right on the board. Mark one stage as Won and one as Lost."
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" form={formId} variant="primary" loading={isSubmitting}>
              {pipeline ? 'Save pipeline' : 'Create pipeline'}
            </Button>
          </>
        }
      >
        <FormProvider {...form}>
          <form id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
              <FormField label="Name" required error={errors.name?.message}>
                <Input
                  {...register('name')}
                  placeholder="e.g. Enterprise sales"
                  autoComplete="off"
                />
              </FormField>
              <Controller
                control={control}
                name="isDefault"
                render={({ field }) => (
                  <FormField
                    label="Default pipeline"
                    description={
                      pipeline?.isDefault
                        ? 'This is the default pipeline.'
                        : 'New deals go here by default.'
                    }
                  >
                    <Switch
                      checked={Boolean(field.value)}
                      onCheckedChange={field.onChange}
                      disabled={Boolean(pipeline?.isDefault)}
                    />
                  </FormField>
                )}
              />
            </div>

            <fieldset className="flex flex-col gap-3">
              <legend className="mb-2 type-small font-medium text-fg">Stages</legend>
              <div aria-live="polite">
                {listError && (
                  <p className="rounded-md bg-danger-subtle px-3 py-2 type-small font-medium text-danger-fg">
                    {listError}
                  </p>
                )}
              </div>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                modifiers={[verticalOnly]}
                onDragEnd={onDragEnd}
              >
                <SortableContext
                  items={fields.map((f) => f.key)}
                  strategy={verticalListSortingStrategy}
                >
                  <ol className="flex flex-col gap-2">
                    {fields.map((f, i) => (
                      <StageRow
                        key={f.key}
                        sortId={f.key}
                        index={i}
                        count={fields.length}
                        onRemove={() => remove(i)}
                        onMove={(from, to) => move(from, to)}
                        onMarkWon={() => mark('isWon', i)}
                        onMarkLost={() => mark('isLost', i)}
                      />
                    ))}
                  </ol>
                </SortableContext>
              </DndContext>
              <div>
                <Button
                  icon={<Plus aria-hidden />}
                  onClick={addStage}
                  disabled={fields.length >= 20}
                >
                  Add stage
                </Button>
              </div>
            </fieldset>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
