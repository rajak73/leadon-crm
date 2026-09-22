import { useEffect, useId } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { createContactSchema, type Contact } from '@leados/shared';
import { useCreateContact, useUpdateContact } from '@/api/contacts';
import { useSession } from '@/providers/session';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { TagInput } from '@/components/domain/tag-input';
import { UserSelect } from '@/components/domain/user-select';
import { applyApiErrors } from '@/lib/forms';
import { personName } from '@/lib/format';
import { notify } from '@/lib/toast';

type FormIn = z.input<typeof createContactSchema>;
type FormOut = z.output<typeof createContactSchema>;
const FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'company',
  'jobTitle',
  'tags',
  'assignedToId',
];

interface ContactFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit this contact. */
  contact?: Contact | null;
  onCreated?: (contact: Contact) => void;
}

export function ContactFormDialog({
  open,
  onOpenChange,
  contact,
  onCreated,
}: ContactFormDialogProps) {
  const formId = useId();
  const { user } = useSession();
  const create = useCreateContact();
  const update = useUpdateContact();
  const editing = Boolean(contact);

  const form = useForm<FormIn, unknown, FormOut>({ resolver: zodResolver(createContactSchema) });
  const { register, control, handleSubmit, reset, setError, formState } = form;
  const { errors, isSubmitting } = formState;

  useEffect(() => {
    if (!open) return;
    reset({
      firstName: contact?.firstName ?? '',
      lastName: contact?.lastName ?? '',
      email: contact?.email ?? '',
      phone: contact?.phone ?? '',
      company: contact?.company ?? '',
      jobTitle: contact?.jobTitle ?? '',
      tags: contact?.tags ?? [],
      assignedToId: contact ? (contact.assignedTo?.id ?? null) : (user?.id ?? null),
    });
  }, [open, contact, reset, user?.id]);

  const onSubmit = handleSubmit(async (values) => {
    const body = { ...values, assignedToId: values.assignedToId ?? null };
    try {
      if (contact) {
        await update.mutateAsync({ id: contact.id, ...body });
        notify.success('Contact updated');
      } else {
        const created = await create.mutateAsync(body);
        notify.success(`${personName(created)} added`);
        onCreated?.(created);
      }
      onOpenChange(false);
    } catch (e) {
      applyApiErrors(e, setError, { fields: FIELDS, fallback: "We couldn't save the contact." });
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={editing ? 'Edit contact' : 'New contact'}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form={formId} variant="primary" loading={isSubmitting}>
              {editing ? 'Save contact' : 'Add contact'}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
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
            <FormField label="Company" error={errors.company?.message}>
              <Input {...register('company')} autoComplete="off" />
            </FormField>
            <FormField label="Job title" error={errors.jobTitle?.message}>
              <Input {...register('jobTitle')} autoComplete="off" />
            </FormField>
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
                <TagInput value={field.value ?? []} onChange={field.onChange} />
              )}
            />
          </FormField>
        </form>
      </DialogContent>
    </Dialog>
  );
}
