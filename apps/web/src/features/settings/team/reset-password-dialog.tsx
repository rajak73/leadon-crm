import { useEffect, useId } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { resetUserPasswordSchema, type User } from '@leados/shared';
import { useResetUserPassword } from '@/api/account';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { applyApiErrors } from '@/lib/forms';
import { personName } from '@/lib/format';
import { notify } from '@/lib/toast';
import { PasswordInput } from '@/features/auth/password-input';

interface ResetPasswordDialogProps {
  user: User | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function ResetPasswordDialog({ user, open, onOpenChange }: ResetPasswordDialogProps) {
  const formId = useId();
  const resetPassword = useResetUserPassword();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<
    z.input<typeof resetUserPasswordSchema>,
    unknown,
    z.output<typeof resetUserPasswordSchema>
  >({
    resolver: zodResolver(resetUserPasswordSchema),
    defaultValues: { password: '' },
  });

  useEffect(() => {
    if (open) reset({ password: '' });
  }, [open, reset]);

  const name = user ? personName(user) : '';
  const onSubmit = handleSubmit(async (values) => {
    if (!user) return;
    try {
      await resetPassword.mutateAsync({ id: user.id, ...values });
      notify.success(`Password reset for ${name}`);
      onOpenChange(false);
    } catch (e) {
      applyApiErrors(e, setError, { fallback: "We couldn't reset the password." });
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        title={`Reset password for “${name}”`}
        description="Share the new password with them securely. They can change it after signing in."
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form={formId} variant="primary" loading={isSubmitting}>
              {isSubmitting ? 'Resetting…' : 'Reset password'}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={onSubmit} noValidate>
          <FormField
            label="New password"
            required
            description="At least 8 characters"
            error={errors.password?.message}
          >
            <PasswordInput autoComplete="new-password" autoFocus {...register('password')} />
          </FormField>
        </form>
      </DialogContent>
    </Dialog>
  );
}
