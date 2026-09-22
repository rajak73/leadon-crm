import { useEffect, useId, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { createLeadSchema, LEAD_SOURCES, type Lead } from '@leados/shared';
import { useCreateLead, useLeadTags, useUpdateLead } from '@/api/leads';
import { useSession } from '@/providers/session';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select, optionsFrom } from '@/components/ui/select';
import { TextLink } from '@/components/ui/link';
import { TagInput } from '@/components/domain/tag-input';
import { UserSelect } from '@/components/domain/user-select';
import { isApiError } from '@/lib/api-client';
import { applyApiErrors } from '@/lib/forms';
import { leadSourceLabels, leadStatusLabels } from '@/lib/labels';
import { personName } from '@/lib/format';
import { notify } from '@/lib/toast';

type FormIn = z.input<typeof createLeadSchema>;
type FormOut = z.output<typeof createLeadSchema>;

// New leads can't start as Won (convert instead) or Lost (the server refuses).
const NEW_LEAD_STATUSES = (
  ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION'] as const
).map((s) => ({
  value: s,
  label: leadStatusLabels[s],
}));
const FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'company',
  'source',
  'status',
  'tags',
  'assignedToId',
];

interface LeadFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit this lead. */
  lead?: Lead | null;
  onCreated?: (lead: Lead) => void;
}

export function LeadFormDialog({ open, onOpenChange, lead, onCreated }: LeadFormDialogProps) {
  const formId = useId();
  const { user } = useSession();
  const create = useCreateLead();
  const update = useUpdateLead();
  const { data: tagSuggestions = [] } = useLeadTags();
  const [existingId, setExistingId] = useState<string | null>(null);
  const editing = Boolean(lead);

  const form = useForm<FormIn, unknown, FormOut>({ resolver: zodResolver(createLeadSchema) });
  const { register, control, handleSubmit, reset, setError, formState } = form;
  const { errors, isSubmitting } = formState;

  useEffect(() => {
    if (!open) return;
    setExistingId(null);
    reset({
      firstName: lead?.firstName ?? '',
      lastName: lead?.lastName ?? '',
      email: lead?.email ?? '',
      phone: lead?.phone ?? '',
      company: lead?.company ?? '',
      source: lead?.source ?? 'MANUAL',
      status: 'NEW',
      tags: lead?.tags ?? [],
      assignedToId: lead ? (lead.assignedTo?.id ?? null) : (user?.id ?? null),
    });
  }, [open, lead, reset, user?.id]);

  const onSubmit = handleSubmit(async (values) => {
    setExistingId(null);
    try {
      if (lead) {
        const { status: _status, ...rest } = values;
        await update.mutateAsync({ id: lead.id, ...rest, assignedToId: rest.assignedToId ?? null });
        notify.success('Lead updated');
      } else {
        const created = await create.mutateAsync({
          ...values,
          assignedToId: values.assignedToId ?? null,
        });
        notify.success(`${personName(created)} added`);
        onCreated?.(created);
      }
      onOpenChange(false);
    } catch (e) {
      const dup = isApiError(e) && e.code === 'CONFLICT' ? e.details?.existingId?.[0] : undefined;
      if (dup && dup !== lead?.id) setExistingId(dup);
      applyApiErrors(e, setError, { fields: FIELDS, fallback: "We couldn't save the lead." });
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={editing ? 'Edit lead' : 'New lead'}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form={formId} variant="primary" loading={isSubmitting}>
              {editing ? 'Save lead' : 'Add lead'}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {existingId && (
            <div
              role="alert"
              className="rounded-lg border border-warning/40 bg-warning-subtle px-3 py-2 type-small text-warning-fg"
            >
              A lead with this email already exists.{' '}
              <TextLink to={`/leads/${existingId}`} onClick={() => onOpenChange(false)}>
                Open the existing lead
              </TextLink>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="First name" required error={errors.firstName?.message}>
              <Input {...register('firstName')} autoComplete="off" autoFocus />
            </FormField>
            <FormField label="Last name" error={errors.lastName?.message}>
              <Input {...register('lastName')} autoComplete="off" />
            </FormField>
            <FormField label="Email" error={errors.email?.message}>
              <Input type="email" {...register('email')} autoComplete="off" />
            </FormField>
            <FormField label="Phone" error={errors.phone?.message}>
              <Input type="tel" {...register('phone')} autoComplete="off" />
            </FormField>
            <FormField label="Company" error={errors.company?.message} className="sm:col-span-2">
              <Input {...register('company')} autoComplete="off" />
            </FormField>
            <FormField label="Source" error={errors.source?.message}>
              <Controller
                control={control}
                name="source"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    options={optionsFrom(LEAD_SOURCES, leadSourceLabels)}
                  />
                )}
              />
            </FormField>
            {!editing && (
              <FormField label="Status" error={errors.status?.message}>
                <Controller
                  control={control}
                  name="status"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      options={NEW_LEAD_STATUSES}
                    />
                  )}
                />
              </FormField>
            )}
            <FormField label="Owner" error={errors.assignedToId?.message}>
              <Controller
                control={control}
                name="assignedToId"
                render={({ field }) => (
                  <UserSelect
                    value={field.value as string | null}
                    onChange={field.onChange}
                    noneLabel="Unassigned"
                  />
                )}
              />
            </FormField>
          </div>
          <FormField
            label="Tags"
            description="Press Enter or comma to add a tag."
            error={errors.tags?.message}
          >
            <Controller
              control={control}
              name="tags"
              render={({ field }) => (
                <TagInput
                  value={field.value ?? []}
                  onChange={field.onChange}
                  suggestions={tagSuggestions}
                />
              )}
            />
          </FormField>
        </form>
      </DialogContent>
    </Dialog>
  );
}
