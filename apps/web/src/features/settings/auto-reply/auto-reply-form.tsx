import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import {
  AUTO_REPLY_MODES,
  COMMENT_REPLY_MODES,
  updateAutoReplySettingsSchema,
  type AutoReplySettings,
} from '@leados/shared';
import { useUpdateAutoReplySettings } from '@/api/auto-reply';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Disclosure } from '@/components/ui/disclosure';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input, Textarea } from '@/components/ui/input';
import { applyApiErrors } from '@/lib/forms';
import {
  autoReplyModeDescriptions,
  autoReplyModeLabels,
  commentReplyModeDescriptions,
  commentReplyModeLabels,
} from '@/lib/labels';
import { notify } from '@/lib/toast';
import { aiSummary } from './ai-summary';
import { RadioCards } from './radio-cards';
import { SwitchRow } from './switch-row';

type FormIn = z.input<typeof updateAutoReplySettingsSchema>;
type FormOut = z.output<typeof updateAutoReplySettingsSchema>;

const BUSINESS_INFO_EXAMPLE = `We're Glow Studio, a hair and beauty salon in Indiranagar, Bengaluru.
Services: haircut ₹600–₹1,200, hair colour from ₹2,500, bridal makeup from ₹15,000.
Open Tue–Sun, 10am–8pm. Closed Mondays.
Booking: send your name, preferred day and time; we confirm on WhatsApp.
FAQs: we use only branded products; parking is available next door.`;

export function toFormValues(s: AutoReplySettings): FormIn {
  return {
    dmEnabled: s.dmEnabled,
    commentsEnabled: s.commentsEnabled,
    mode: s.mode,
    commentReplyMode: s.commentReplyMode,
    businessInfo: s.businessInfo,
    tone: s.tone,
    handoffMessage: s.handoffMessage,
    replyDelaySeconds: s.replyDelaySeconds,
    maxRepliesPerDay: s.maxRepliesPerDay,
    createLeads: s.createLeads,
    collectContactDetails: s.collectContactDetails,
  };
}

const NO_AI = 'Add an AI key on the server first (see above).';

export function AutoReplyForm({
  settings,
  canEdit,
}: {
  settings: AutoReplySettings;
  canEdit: boolean;
}) {
  const update = useUpdateAutoReplySettings();
  const noAi = settings.aiProvider === 'rules';
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(updateAutoReplySettingsSchema),
    defaultValues: toFormValues(settings),
  });

  useEffect(() => reset(toFormValues(settings)), [settings, reset]);

  const hasAdvancedError = Boolean(
    errors.commentReplyMode ||
    errors.tone ||
    errors.handoffMessage ||
    errors.replyDelaySeconds ||
    errors.maxRepliesPerDay,
  );

  const onSubmit = handleSubmit(async (values) => {
    try {
      await update.mutateAsync(values);
      notify.success('Auto-reply settings saved');
    } catch (e) {
      // 409 when turning replies on without an AI key: the server message explains it.
      applyApiErrors(e, setError, { fallback: "We couldn't save the settings." });
    }
  });

  const switchField = (
    name: 'dmEnabled' | 'commentsEnabled' | 'createLeads' | 'collectContactDetails',
    label: string,
    description: string,
    needsAi: boolean,
  ) => (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <SwitchRow
          label={label}
          description={description}
          checked={Boolean(field.value)}
          onCheckedChange={field.onChange}
          disabled={!canEdit || (needsAi && noAi && !field.value)}
          disabledReason={canEdit && needsAi && noAi ? NO_AI : undefined}
        />
      )}
    />
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <fieldset disabled={!canEdit} className="flex min-w-0 flex-col gap-4">
        <Card>
          <CardHeader title="Auto-reply" />
          <CardBody className="flex flex-col gap-4">
            {switchField(
              'dmEnabled',
              'Reply to DMs automatically',
              'The AI answers direct messages using your business info.',
              true,
            )}
            {switchField(
              'commentsEnabled',
              'Reply to comments automatically',
              'The AI answers comments on your posts, and skips spam.',
              true,
            )}
            <Controller
              control={control}
              name="mode"
              render={({ field }) => (
                <RadioCards
                  legend="When the AI writes a reply"
                  name="mode"
                  value={field.value}
                  onChange={field.onChange}
                  options={AUTO_REPLY_MODES.map((m) => ({
                    value: m,
                    label: autoReplyModeLabels[m],
                    description: autoReplyModeDescriptions[m],
                    badge: m === 'DRAFT' ? 'Recommended to start' : undefined,
                  }))}
                />
              )}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="What the AI knows"
            description="The AI only uses what you write here. It never makes up prices or offers."
          />
          <CardBody>
            <FormField
              label="Business info"
              description="Services, price ranges, location and hours, how booking works, and answers to common questions."
              error={errors.businessInfo?.message}
            >
              <Textarea
                rows={8}
                placeholder={BUSINESS_INFO_EXAMPLE}
                {...register('businessInfo')}
              />
            </FormField>
          </CardBody>
        </Card>

        <Disclosure
          title="More options"
          description="Comment style, tone, limits and lead capture."
          forceOpen={hasAdvancedError}
        >
          <p className="flex items-center gap-2 type-small text-fg-muted">
            <Sparkles aria-hidden className="size-4 text-fg-subtle" />
            AI: {aiSummary(settings.aiProvider, settings.aiModel)}
          </p>
          <Controller
            control={control}
            name="commentReplyMode"
            render={({ field }) => (
              <RadioCards
                legend="Comment reply style"
                name="commentReplyMode"
                columns={3}
                value={field.value}
                onChange={field.onChange}
                options={COMMENT_REPLY_MODES.map((m) => ({
                  value: m,
                  label: commentReplyModeLabels[m],
                  description: commentReplyModeDescriptions[m],
                }))}
              />
            )}
          />
          <FormField
            label="Tone"
            description="How replies should sound."
            error={errors.tone?.message}
          >
            <Input
              placeholder="Friendly and short, like a helpful receptionist"
              {...register('tone')}
            />
          </FormField>
          <FormField
            label="Handoff message"
            description="Sent when the AI decides a person should answer. Leave empty to send nothing."
            error={errors.handoffMessage?.message}
          >
            <Textarea
              rows={2}
              placeholder="Thanks! Someone from our team will reply shortly."
              {...register('handoffMessage')}
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Reply delay (seconds)"
              description="Waits this long so a burst of messages gets one answer. 0–300."
              error={errors.replyDelaySeconds?.message}
            >
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={300}
                {...register('replyDelaySeconds')}
              />
            </FormField>
            <FormField
              label="Daily limit per conversation"
              description="After this many AI replies in 24 hours, the AI pauses and asks you to step in."
              error={errors.maxRepliesPerDay?.message}
            >
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={200}
                {...register('maxRepliesPerDay')}
              />
            </FormField>
          </div>
          {switchField(
            'createLeads',
            'Create leads from new Instagram contacts',
            'Everyone who messages or comments for the first time becomes a lead, tagged “instagram”.',
            false,
          )}
          {switchField(
            'collectContactDetails',
            'Ask for name and phone number',
            'After answering, the AI politely asks new customers for their name and number — at most twice — and saves them to the lead.',
            false,
          )}
        </Disclosure>
      </fieldset>

      {canEdit && (
        <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
          <p aria-live="polite" className="mr-auto type-small text-fg-muted">
            {isDirty ? 'You have unsaved changes.' : 'All changes saved.'}
          </p>
          {isDirty && (
            <Button variant="ghost" onClick={() => reset()} disabled={isSubmitting}>
              Discard changes
            </Button>
          )}
          <Button type="submit" variant="primary" loading={isSubmitting} disabled={!isDirty}>
            {isSubmitting ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      )}
    </form>
  );
}
