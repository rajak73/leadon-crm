import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plug } from 'lucide-react';
import { connectInstagramSchema, type ConnectInstagramInput } from '@leados/shared';
import { useConnectInstagram } from '@/api/instagram';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { PasswordInput } from '@/features/auth/password-input';
import { errorMessage, isApiError } from '@/lib/api-client';
import { notify } from '@/lib/toast';

/** Paste a long-lived access token to connect (or reconnect) the account. */
export function ConnectForm({
  submitLabel = 'Connect',
  onDone,
  onCancel,
}: {
  submitLabel?: string;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const connect = useConnectInstagram();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ConnectInstagramInput>({
    resolver: zodResolver(connectInstagramSchema),
    defaultValues: { accessToken: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const status = await connect.mutateAsync(values);
      notify.success(
        status.account ? `Connected @${status.account.username}` : 'Instagram connected',
      );
      reset();
      onDone?.();
    } catch (e) {
      // Meta's rejection comes back as a friendly 422 message; show it next to the field.
      const fieldMessage = isApiError(e) ? e.details?.accessToken?.[0] : undefined;
      setError('accessToken', {
        type: 'server',
        message: fieldMessage ?? errorMessage(e, "We couldn't connect with that token."),
      });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <FormField
        label="Access token"
        description="It stays on your server, encrypted. Nobody on your team can read it back."
        error={errors.accessToken?.message}
        required
      >
        <PasswordInput
          noun="token"
          autoComplete="off"
          spellCheck={false}
          placeholder="IGAA…"
          {...register('accessToken')}
        />
      </FormField>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" icon={<Plug aria-hidden />} loading={isSubmitting}>
          {isSubmitting ? 'Connecting…' : submitLabel}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
