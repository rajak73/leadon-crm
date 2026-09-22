import { useEffect, useId, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createDealSchema, type Deal } from '@leados/shared';
import { useDefaultCurrency } from '@/api/account';
import { useCreateDeal, usePipelines, useUpdateDeal } from '@/api/pipelines';
import { useSession } from '@/providers/session';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { UserSelect } from '@/components/domain/user-select';
import { RecordPicker, type RecordRef } from '@/components/domain/record-picker';
import { personName, toDateInput } from '@/lib/format';
import { applyApiErrors } from '@/lib/forms';
import { notify } from '@/lib/toast';

// Edit mode doesn't change pipeline/stage (that's a move), so those are optional here.
const formSchema = createDealSchema.extend({ pipelineId: z.string(), stageId: z.string() });
type FormIn = z.input<typeof formSchema>;
type FormOut = z.output<typeof formSchema>;

interface DealFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal?: Deal | null;
  defaultPipelineId?: string;
  defaultStageId?: string;
  defaultLead?: RecordRef | null;
  defaultContact?: RecordRef | null;
  onCreated?: (deal: Deal) => void;
}

export function DealFormDialog({
  open,
  onOpenChange,
  deal,
  defaultPipelineId,
  defaultStageId,
  defaultLead = null,
  defaultContact = null,
  onCreated,
}: DealFormDialogProps) {
  const formId = useId();
  const { user } = useSession();
  const currency = useDefaultCurrency();
  const { data: pipelines = [] } = usePipelines();
  const create = useCreateDeal();
  const update = useUpdateDeal();
  const [lead, setLead] = useState<RecordRef | null>(defaultLead);
  const [contact, setContact] = useState<RecordRef | null>(defaultContact);
  const editing = Boolean(deal);

  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(editing ? formSchema : createDealSchema),
  });
  const { register, control, handleSubmit, reset, setError, watch, setValue, formState } = form;
  const { errors, isSubmitting } = formState;

  useEffect(() => {
    if (!open) return;
    const pipeline = pipelines.find((p) => p.id === defaultPipelineId) ?? pipelines[0];
    const firstOpen = pipeline?.stages.find((s) => !s.isWon && !s.isLost);
    reset({
      title: deal?.title ?? '',
      value: deal?.value ?? '',
      currency: deal?.currency ?? currency,
      pipelineId: deal?.pipelineId ?? pipeline?.id ?? '',
      stageId: deal?.stage.id ?? defaultStageId ?? firstOpen?.id ?? '',
      assignedToId: deal ? (deal.assignedTo?.id ?? null) : (user?.id ?? null),
      expectedCloseDate: toDateInput(deal?.expectedCloseDate),
    });
    setLead(
      deal?.lead ? { kind: 'lead', id: deal.lead.id, label: personName(deal.lead) } : defaultLead,
    );
    setContact(
      deal?.contact
        ? { kind: 'contact', id: deal.contact.id, label: personName(deal.contact) }
        : defaultContact,
    );
    // pipelines is intentionally read once per open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deal, reset]);

  const pipelineId = watch('pipelineId');
  const stages = pipelines.find((p) => p.id === pipelineId)?.stages ?? [];

  const onSubmit = handleSubmit(async (values) => {
    const common = {
      title: values.title,
      value: values.value ?? null,
      currency: values.currency,
      assignedToId: values.assignedToId ?? null,
      expectedCloseDate: values.expectedCloseDate ? values.expectedCloseDate.toISOString() : null,
      leadId: lead?.id ?? null,
      contactId: contact?.id ?? null,
    };
    try {
      if (deal) {
        await update.mutateAsync({ id: deal.id, ...common });
        notify.success('Deal updated');
      } else {
        const created = await create.mutateAsync({
          ...common,
          pipelineId: values.pipelineId,
          stageId: values.stageId,
        });
        notify.success('Deal created');
        onCreated?.(created);
      }
      onOpenChange(false);
    } catch (e) {
      applyApiErrors(e, setError, { fallback: "We couldn't save the deal." });
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={editing ? 'Edit deal' : 'New deal'}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form={formId} variant="primary" loading={isSubmitting}>
              {editing ? 'Save deal' : 'Create deal'}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <FormField label="Title" required error={errors.title?.message}>
            <Input {...register('title')} placeholder="e.g. Annual plan for Acme" autoFocus />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
            <FormField label="Value" error={errors.value?.message}>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                {...register('value')}
                placeholder="0"
              />
            </FormField>
            <FormField label="Currency" error={errors.currency?.message}>
              <Input
                {...register('currency')}
                maxLength={3}
                className="uppercase"
                autoComplete="off"
              />
            </FormField>
          </div>
          {!editing && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Pipeline" error={errors.pipelineId?.message}>
                <Controller
                  control={control}
                  name="pipelineId"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v);
                        const first = pipelines
                          .find((p) => p.id === v)
                          ?.stages.find((s) => !s.isWon && !s.isLost);
                        setValue('stageId', first?.id ?? '');
                      }}
                      options={pipelines.map((p) => ({ value: p.id, label: p.name }))}
                    />
                  )}
                />
              </FormField>
              <FormField label="Stage" error={errors.stageId?.message}>
                <Controller
                  control={control}
                  name="stageId"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      options={stages.map((s) => ({ value: s.id, label: s.name }))}
                      placeholder="Choose a stage"
                    />
                  )}
                />
              </FormField>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Contact" error={errors.contactId?.message}>
              <RecordPicker
                value={contact}
                onChange={setContact}
                kinds={['contact']}
                placeholder="Search contacts…"
              />
            </FormField>
            <FormField label="Lead" error={errors.leadId?.message}>
              <RecordPicker
                value={lead}
                onChange={setLead}
                kinds={['lead']}
                placeholder="Search leads…"
              />
            </FormField>
            <FormField label="Owner" error={errors.assignedToId?.message}>
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
            <FormField label="Expected close date" error={errors.expectedCloseDate?.message}>
              <Input type="date" {...register('expectedCloseDate')} />
            </FormField>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
