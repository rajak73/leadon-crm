import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { loginSchema, type AuthSession } from '@leados/shared';
import { api, isApiError } from '@/lib/api-client';
import { applyApiErrors } from '@/lib/forms';
import { useSession } from '@/providers/session';
import { usePublicDocumentTitle } from '@/hooks/use-document-title';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { AuthCard, FormAlert } from './auth-card';
import { PasswordInput } from './password-input';

type FormIn = z.input<typeof loginSchema>;
type FormOut = z.output<typeof loginSchema>;

export default function LoginPage() {
  usePublicDocumentTitle('Sign in');
  const { companyName, signIn } = useSession();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const session = await api.post<AuthSession>('/auth/login', values);
      // The PublicOnly guard redirects to where the person was going.
      signIn(session);
    } catch (e) {
      const message = applyApiErrors(e, setError, {
        toastFallback: false,
        fallback: "We couldn't sign you in. Please try again.",
      });
      if (!(isApiError(e) && e.details)) setFormError(message);
    }
  });

  return (
    <AuthCard
      title={`Sign in to ${companyName || 'LeadOS'}`}
      description="Welcome back. Enter your details to continue."
    >
      <FormAlert message={formError} />
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormField label="Email" error={errors.email?.message}>
          <Input type="email" autoComplete="email" autoFocus {...register('email')} />
        </FormField>
        <FormField label="Password" error={errors.password?.message}>
          <PasswordInput autoComplete="current-password" {...register('password')} />
        </FormField>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={isSubmitting}
          className="mt-2 w-full"
        >
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthCard>
  );
}
