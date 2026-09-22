import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FlaskConical } from 'lucide-react';
import { toast } from 'sonner';
import { simulateInstagramSchema, type SimulateInstagramInput } from '@leados/shared';
import { useSimulateInstagram } from '@/api/instagram';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input, Textarea } from '@/components/ui/input';
import { SegmentedControl } from '@/features/tasks/segmented-control';
import { applyApiErrors } from '@/lib/forms';

const KINDS = [
  { value: 'dm', label: 'Direct message' },
  { value: 'comment', label: 'Comment' },
] as const;

/** Test mode only: pretend a customer wrote to you, through the real pipeline. */
export function SimulateCard() {
  const navigate = useNavigate();
  const simulate = useSimulateInstagram();
  const [lastKind, setLastKind] = useState<'dm' | 'comment'>('dm');
  const {
    register,
    control,
    handleSubmit,
    setError,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm<SimulateInstagramInput>({
    resolver: zodResolver(simulateInstagramSchema),
    defaultValues: { kind: 'dm', username: 'priya.designs', text: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const result = await simulate.mutateAsync(values);
      setLastKind(values.kind);
      resetField('text');
      const to = 'conversationId' in result ? `/inbox/${result.conversationId}` : '/inbox/comments';
      toast.success(values.kind === 'dm' ? 'Message received' : 'Comment received', {
        action: {
          label: values.kind === 'dm' ? 'Open conversation' : 'Open comments',
          onClick: () => void navigate(to),
        },
      });
    } catch (e) {
      applyApiErrors(e, setError, { fallback: "We couldn't simulate that." });
    }
  });

  return (
    <section aria-labelledby="ig-simulate" className="flex flex-col gap-3">
      <div>
        <h3 id="ig-simulate" className="type-body font-semibold text-fg">
          Simulate incoming
        </h3>
        <p className="type-small text-fg-muted">
          Pretend a customer wrote to you. Leads, AI replies and the inbox work as they would for
          real.
        </p>
      </div>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Controller
          control={control}
          name="kind"
          render={({ field }) => (
            <SegmentedControl
              label="What to simulate"
              value={field.value}
              onChange={field.onChange}
              options={KINDS}
              className="self-start"
            />
          )}
        />
        <FormField
          label="Instagram username"
          description="Without the @. Use the same name again to continue a conversation."
          error={errors.username?.message}
          required
        >
          <Input autoComplete="off" spellCheck={false} {...register('username')} />
        </FormField>
        <FormField label="Message" error={errors.text?.message} required>
          <Textarea
            rows={2}
            placeholder={
              lastKind === 'dm'
                ? 'Hi! What are your prices, and are you open on Sunday?'
                : 'Love this! Price please?'
            }
            {...register('text')}
          />
        </FormField>
        <Button
          type="submit"
          variant="primary"
          className="self-start"
          icon={<FlaskConical aria-hidden />}
          loading={isSubmitting}
        >
          Simulate
        </Button>
      </form>
    </section>
  );
}
