import { useEffect, useId } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router';
import type { z } from 'zod';
import { convertLeadSchema, type LeadDetail } from '@leados/shared';
import { useDefaultCurrency } from '@/api/account';
import { useConvertLead } from '@/api/leads';
import { usePipelines } from '@/api/pipelines';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { applyApiErrors } from '@/lib/forms';
import { personName } from '@/lib/format';
import { notify } from '@/lib/toast';

type FormIn = z.input<typeof convertLeadSchema>;
type FormOut = z.output<typeof convertLeadSchema>;

interface ConvertLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: LeadDetail;
}

export function ConvertLeadDialog({ open, onOpenChange, lead }: ConvertLeadDialogProps) {
  const formId = useId();
  const checkboxId = useId();
  const navigate = useNavigate();
  const convert = useConvertLead(lead.id);
  const currency = useDefaultCurrency();
  const { data: pipelines = [] } = usePipelines();
  const name = personName(lead);

  const form = useForm<FormIn, unknown, FormOut>({ resolver: zodResolver(convertLeadSchema) });
  const { register, control, handleSubmit, reset, setError, watch, formState } = form;
  const { errors, isSubmitting } = formState;
  const createDeal = watch('createDeal');

  useEffect(() => {
    if (!open) return;
    reset({
      createDeal: false,
      dealTitle: `${lead.company || name} deal`,
      dealValue: null,
      pipelineId: pipelines[0]?.id ?? null,
    });
    // Pipelines are read when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead.id, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const body = values.createDeal ? values : { createDeal: false };
      const res = await convert.mutateAsync(body);
      notify.success(
        res.deal ? `${name} converted, with a new deal` : `${name} converted to a contact`,
      );
      onOpenChange(false);
      navigate(`/contacts/${res.contact.id}`);
    } catch (e) {
      applyApiErrors(e, setError, {
        fields: ['dealTitle', 'dealValue', 'pipelineId'],
        fallback: "We couldn't convert the lead.",
      });
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Convert ${name}`}
        description="This creates a contact from the lead, or links the existing contact with the same email. The lead is marked Won."
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form={formId} variant="primary" loading={isSubmitting}>
              {isSubmitting ? 'Converting…' : 'Convert lead'}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Controller
              control={control}
              name="createDeal"
              render={({ field }) => (
                <Checkbox
                  id={checkboxId}
                  checked={field.value === true}
                  onCheckedChange={(c) => field.onChange(c === true)}
                />
              )}
            />
            <Label htmlFor={checkboxId} className="cursor-pointer">
              Also create a deal
            </Label>
          </div>
          {createDeal && (
            <div className="grid gap-4 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-2">
              <FormField
                label="Deal title"
                error={errors.dealTitle?.message}
                className="sm:col-span-2"
              >
                <Input {...register('dealTitle')} />
              </FormField>
              <FormField label={`Value (${currency})`} error={errors.dealValue?.message}>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  {...register('dealValue', {
                    setValueAs: (v: unknown) => (v === '' || v == null ? null : v),
                  })}
                />
              </FormField>
              <FormField
                label="Pipeline"
                description="The deal starts in the first open stage."
                error={errors.pipelineId?.message}
              >
                <Controller
                  control={control}
                  name="pipelineId"
                  render={({ field }) => (
                    <Select
                      value={(field.value as string | null | undefined) ?? undefined}
                      onValueChange={field.onChange}
                      options={pipelines.map((p) => ({ value: p.id, label: p.name }))}
                      placeholder="Default pipeline"
                    />
                  )}
                />
              </FormField>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
