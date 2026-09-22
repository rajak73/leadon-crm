import { useId } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { changePasswordSchema, updateProfileSchema } from '@leados/shared';
import { useChangePassword, useUpdateProfile } from '@/api/account';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { applyApiErrors } from '@/lib/forms';
import { userRoleDescriptions, userRoleLabels } from '@/lib/labels';
import { notify } from '@/lib/toast';
import { useCurrentUser, useSession } from '@/providers/session';
import { PasswordInput } from '@/features/auth/password-input';

function ProfileCard() {
  const user = useCurrentUser();
  const { setUser } = useSession();
  const update = useUpdateProfile();
  const formId = useId();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<z.input<typeof updateProfileSchema>, unknown, z.output<typeof updateProfileSchema>>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { firstName: user.firstName, lastName: user.lastName, email: user.email },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const saved = await update.mutateAsync(values);
      setUser(saved);
      reset({ firstName: saved.firstName, lastName: saved.lastName, email: saved.email });
      notify.success('Profile saved');
    } catch (e) {
      applyApiErrors(e, setError, { fallback: "We couldn't save your profile." });
    }
  });

  return (
    <Card>
      <CardHeader title="Profile" description="How your name and email appear to your team." />
      <CardBody>
        <form id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="First name" required error={errors.firstName?.message}>
              <Input autoComplete="given-name" {...register('firstName')} />
            </FormField>
            <FormField label="Last name" error={errors.lastName?.message}>
              <Input autoComplete="family-name" {...register('lastName')} />
            </FormField>
          </div>
          <FormField
            label="Email"
            required
            description="You sign in with this address."
            error={errors.email?.message}
          >
            <Input type="email" autoComplete="email" {...register('email')} />
          </FormField>
          <div>
            <p className="type-small font-medium text-fg">Role</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge tone={user.role === 'ADMIN' ? 'primary' : 'neutral'}>
                {userRoleLabels[user.role]}
              </Badge>
              <span className="type-small text-fg-muted">{userRoleDescriptions[user.role]}</span>
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={isSubmitting} disabled={!isDirty}>
              {isSubmitting ? 'Saving…' : 'Save profile'}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function PasswordCard() {
  const change = useChangePassword();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof changePasswordSchema>, unknown, z.output<typeof changePasswordSchema>>(
    {
      resolver: zodResolver(changePasswordSchema),
      defaultValues: { currentPassword: '', newPassword: '' },
    },
  );

  const onSubmit = handleSubmit(async (values) => {
    try {
      await change.mutateAsync(values);
      reset();
      notify.success('Password changed. Other devices have been signed out.');
    } catch (e) {
      applyApiErrors(e, setError, { fallback: "We couldn't change your password." });
    }
  });

  return (
    <Card>
      <CardHeader title="Password" description="Changing it signs you out everywhere else." />
      <CardBody>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Current password" required error={errors.currentPassword?.message}>
              <PasswordInput autoComplete="current-password" {...register('currentPassword')} />
            </FormField>
            <FormField
              label="New password"
              required
              description="At least 8 characters"
              error={errors.newPassword?.message}
            >
              <PasswordInput autoComplete="new-password" {...register('newPassword')} />
            </FormField>
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={isSubmitting}>
              {isSubmitting ? 'Changing…' : 'Change password'}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

export default function ProfilePage() {
  useDocumentTitle('Profile settings');
  const user = useCurrentUser();
  return (
    <div className="flex flex-col gap-4">
      <ProfileCard key={user.id} />
      <PasswordCard />
    </div>
  );
}
