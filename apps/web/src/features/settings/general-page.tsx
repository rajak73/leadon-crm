import { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Sparkles } from 'lucide-react';
import type { z } from 'zod';
import { updateSettingsSchema, type AppSettings } from '@leados/shared';
import { useSettings, useUpdateSettings } from '@/api/account';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { errorMessage } from '@/lib/api-client';
import { aiSummary } from './auto-reply/ai-summary';
import { applyApiErrors } from '@/lib/forms';
import { notify } from '@/lib/toast';

type FormIn = z.input<typeof updateSettingsSchema>;
type FormOut = z.output<typeof updateSettingsSchema>;

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AUD', 'CAD', 'SGD', 'AED', 'JPY'];

function currencyLabel(code: string) {
  try {
    const name = new Intl.DisplayNames(undefined, { type: 'currency' }).of(code);
    return name && name !== code ? `${code} · ${name}` : code;
  } catch {
    return code;
  }
}

function supportedTimeZones(): string[] | null {
  try {
    return typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : null;
  } catch {
    return null;
  }
}

function SettingsForm({ settings }: { settings: AppSettings }) {
  const update = useUpdateSettings();
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormIn, unknown, FormOut>({ resolver: zodResolver(updateSettingsSchema) });

  useEffect(() => {
    reset({
      companyName: settings.companyName,
      defaultCurrency: settings.defaultCurrency,
      timezone: settings.timezone,
      aiScoringAuto: settings.aiScoringAuto,
    });
  }, [settings, reset]);

  const currencyOptions = useMemo(() => {
    const codes = CURRENCIES.includes(settings.defaultCurrency)
      ? CURRENCIES
      : [settings.defaultCurrency, ...CURRENCIES];
    return codes.map((c) => ({ value: c, label: currencyLabel(c) }));
  }, [settings.defaultCurrency]);

  const timeZoneOptions = useMemo(() => {
    const zones = supportedTimeZones();
    if (!zones) return null;
    const all = zones.includes(settings.timezone) ? zones : [settings.timezone, ...zones];
    return all.map((z) => ({ value: z, label: z.replaceAll('_', ' ') }));
  }, [settings.timezone]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await update.mutateAsync(values);
      notify.success('Settings saved');
    } catch (e) {
      applyApiErrors(e, setError, { fallback: "We couldn't save the settings." });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title="Company"
          description="Shown across LeadOS and used for money and dates."
        />
        <CardBody className="flex flex-col gap-4">
          <FormField label="Company name" required error={errors.companyName?.message}>
            <Input autoComplete="organization" {...register('companyName')} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Default currency"
              description="Used for new deals and dashboard totals."
              error={errors.defaultCurrency?.message}
            >
              <Controller
                control={control}
                name="defaultCurrency"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    options={currencyOptions}
                  />
                )}
              />
            </FormField>
            <FormField
              label="Time zone"
              description="Decides when “today” starts for tasks and reports."
              error={errors.timezone?.message}
            >
              {timeZoneOptions ? (
                <Controller
                  control={control}
                  name="timezone"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      options={timeZoneOptions}
                    />
                  )}
                />
              ) : (
                <Input placeholder="e.g. Asia/Kolkata" {...register('timezone')} />
              )}
            </FormField>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="AI lead scoring"
          description="Scores help your team focus on the leads most likely to buy."
        />
        <CardBody className="flex flex-col gap-4">
          <Controller
            control={control}
            name="aiScoringAuto"
            render={({ field }) => (
              <div className="flex items-start justify-between gap-4">
                <div>
                  <label htmlFor="ai-scoring-auto" className="type-body font-medium text-fg">
                    Score leads automatically
                  </label>
                  <p id="ai-scoring-auto-description" className="type-small text-fg-muted">
                    Rescore a lead when it's created, its status changes or someone adds a note.
                  </p>
                </div>
                <Switch
                  id="ai-scoring-auto"
                  aria-describedby="ai-scoring-auto-description"
                  checked={Boolean(field.value)}
                  onCheckedChange={field.onChange}
                />
              </div>
            )}
          />
          <p className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 type-small text-fg-muted">
            <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-medium text-fg">
                {settings.aiProvider === 'rules'
                  ? aiSummary('rules', null)
                  : `AI: ${aiSummary(settings.aiProvider, settings.aiModel)}`}
              </span>
              <span className="block">
                {settings.aiProvider === 'rules'
                  ? 'Scores come from built-in rules and AI replies are off. Add a Gemini or Groq key on the server to use AI.'
                  : 'The same AI scores leads and writes Instagram replies.'}
              </span>
            </span>
          </p>
        </CardBody>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={isSubmitting} disabled={!isDirty}>
          {isSubmitting ? 'Saving…' : 'Save settings'}
        </Button>
      </div>
    </form>
  );
}

export default function GeneralPage() {
  useDocumentTitle('General settings');
  const { data: settings, isLoading, error, refetch } = useSettings();

  if (isLoading)
    return (
      <LoadingRegion label="Loading settings…" className="flex flex-col gap-4">
        {[3, 2].map((n, i) => (
          <Card key={i} className="space-y-4 p-5">
            <Skeleton className="h-5 w-40" />
            {Array.from({ length: n }, (_, j) => (
              <Skeleton key={j} className="h-9 w-full" />
            ))}
          </Card>
        ))}
      </LoadingRegion>
    );
  if (!settings) return <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />;
  return <SettingsForm settings={settings} />;
}
