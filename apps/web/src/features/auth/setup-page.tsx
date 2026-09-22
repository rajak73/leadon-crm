import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { setupSchema, type AuthSession } from '@leados/shared';
import { api, isApiError } from '@/lib/api-client';
import { applyApiErrors } from '@/lib/forms';
import { useSession } from '@/providers/session';
import { usePublicDocumentTitle } from '@/hooks/use-document-title';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { TextLink } from '@/components/ui/link';
import { AuthCard, FormAlert } from './auth-card';
import { PasswordInput } from './password-input';

type FormIn = z.input<typeof setupSchema>;
type FormOut = z.output<typeof setupSchema>;

export default function SetupPage() {
  usePublicDocumentTitle('Set up');
  const { signIn } = useSession();
  const [formError, setFormError] = useState<string | null>(null);
  const [alreadySetUp, setAlreadySetUp] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(setupSchema),
    defaultValues: { companyName: '', firstName: '', lastName: '', email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setAlreadySetUp(false);
    try {
      const session = await api.post<AuthSession>('/auth/setup', values);
      signIn(session);
    } catch (e) {
      if (isApiError(e) && e.status === 409) {
        setAlreadySetUp(true);
        setFormError('LeadOS is already set up.');
        return;
      }
      const message = applyApiErrors(e, setError, {
        toastFallback: false,
        fallback: "We couldn't finish setting up. Please try again.",
      });
      if (!(isApiError(e) && e.details)) setFormError(message);
    }
  });

  return (
    <AuthCard
      title="Set up LeadOS for your team"
      description="Create the first admin account. You can invite your teammates afterwards."
    >
      <FormAlert message={formError}>
        {alreadySetUp && (
          <>
            {' '}
            <TextLink to="/login" className="text-danger-fg underline">
              Sign in instead.
            </TextLink>
          </>
        )}
      </FormAlert>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormField label="Company name" required error={errors.companyName?.message}>
          <Input autoComplete="organization" autoFocus {...register('companyName')} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="First name" required error={errors.firstName?.message}>
            <Input autoComplete="given-name" {...register('firstName')} />
          </FormField>
          <FormField label="Last name" error={errors.lastName?.message}>
            <Input autoComplete="family-name" {...register('lastName')} />
          </FormField>
        </div>
        <FormField label="Email" required error={errors.email?.message}>
          <Input type="email" autoComplete="email" {...register('email')} />
        </FormField>
        <FormField
          label="Password"
          required
          description="At least 8 characters"
          error={errors.password?.message}
        >
          <PasswordInput autoComplete="new-password" {...register('password')} />
        </FormField>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={isSubmitting}
          className="mt-2 w-full"
        >
          {isSubmitting ? 'Setting up…' : 'Create account'}
        </Button>
      </form>
    </AuthCard>
  );
}
