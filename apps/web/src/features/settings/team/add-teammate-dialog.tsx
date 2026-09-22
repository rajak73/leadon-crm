import { useEffect, useId } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { createUserSchema, USER_ROLES } from '@leados/shared';
import { useCreateUser } from '@/api/account';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select, optionsFrom } from '@/components/ui/select';
import { applyApiErrors } from '@/lib/forms';
import { userRoleDescriptions, userRoleLabels } from '@/lib/labels';
import { notify } from '@/lib/toast';
import { PasswordInput } from '@/features/auth/password-input';

const roleOptions = optionsFrom(USER_ROLES, userRoleLabels);

export function AddTeammateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const formId = useId();
  const create = useCreateUser();
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof createUserSchema>, unknown, z.output<typeof createUserSchema>>({
    resolver: zodResolver(createUserSchema),
  });

  const role = useWatch({ control, name: 'role' }) ?? 'MEMBER';

  useEffect(() => {
    if (open) reset({ firstName: '', lastName: '', email: '', role: 'MEMBER', password: '' });
  }, [open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const user = await create.mutateAsync(values);
      notify.success(`${user.firstName} was added to the team`);
      onOpenChange(false);
    } catch (e) {
      applyApiErrors(e, setError, { fallback: "We couldn't add this teammate." });
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Add teammate"
        description="They can sign in straight away with the email and password you set."
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form={formId} variant="primary" loading={isSubmitting}>
              {isSubmitting ? 'Adding…' : 'Add teammate'}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="First name" required error={errors.firstName?.message}>
              <Input autoComplete="off" autoFocus {...register('firstName')} />
            </FormField>
            <FormField label="Last name" error={errors.lastName?.message}>
              <Input autoComplete="off" {...register('lastName')} />
            </FormField>
          </div>
          <FormField label="Email" required error={errors.email?.message}>
            <Input type="email" autoComplete="off" {...register('email')} />
          </FormField>
          <FormField
            label="Role"
            description={userRoleDescriptions[role]}
            error={errors.role?.message}
          >
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} options={roleOptions} />
              )}
            />
          </FormField>
          <FormField
            label="Initial password"
            required
            description="Share this with them securely; they can change it after signing in"
            error={errors.password?.message}
          >
            <PasswordInput autoComplete="new-password" {...register('password')} />
          </FormField>
        </form>
      </DialogContent>
    </Dialog>
  );
}
