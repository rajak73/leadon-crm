import { useState, type FormEvent, type ReactNode } from 'react';
import { FlaskConical, Lock, Mail, Phone, Sparkles, UserRound } from 'lucide-react';
import { testAutoReplySchema, type TestAutoReplyInput } from '@leados/shared';
import { useTestAutoReply, type AutoReplyTestResult } from '@/api/auto-reply';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Disclosure } from '@/components/ui/disclosure';
import { FormField } from '@/components/ui/form-field';
import { Textarea } from '@/components/ui/input';
import { SegmentedControl } from '@/features/tasks/segmented-control';
import { errorMessage, isApiError } from '@/lib/api-client';
import { aiSummary } from './ai-summary';

const KINDS = [
  { value: 'dm', label: 'Direct message' },
  { value: 'comment', label: 'Comment' },
] as const;

function Reply({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 type-caption font-medium text-fg-subtle">
        {icon}
        {label}
      </p>
      <p className="rounded-2xl rounded-br-md bg-primary-subtle px-3.5 py-2 type-body whitespace-pre-wrap text-primary-subtle-fg">
        {children}
      </p>
    </div>
  );
}

function Result({ result }: { result: AutoReplyTestResult }) {
  const { preview } = result;
  return (
    <div className="flex flex-col gap-3">
      {result.kind === 'dm' ? (
        <>
          {result.preview.reply ? (
            <Reply label="The AI would reply" icon={<Sparkles aria-hidden className="size-3" />}>
              {result.preview.reply}
            </Reply>
          ) : (
            <p className="type-body text-fg-muted">The AI wouldn’t reply to this one.</p>
          )}
          {result.preview.handoff && (
            <Callout tone="warning" title="A person should answer">
              {result.preview.handoffReason || 'The AI would hand this conversation to you.'}
            </Callout>
          )}
          {(result.preview.extracted.name ||
            result.preview.extracted.email ||
            result.preview.extracted.phone) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 type-small text-fg-muted">
              <span className="font-medium text-fg">Would be saved to the lead:</span>
              {result.preview.extracted.name && (
                <span className="inline-flex items-center gap-1">
                  <UserRound aria-hidden className="size-3.5" />
                  {result.preview.extracted.name}
                </span>
              )}
              {result.preview.extracted.email && (
                <span className="inline-flex items-center gap-1">
                  <Mail aria-hidden className="size-3.5" />
                  {result.preview.extracted.email}
                </span>
              )}
              {result.preview.extracted.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone aria-hidden className="size-3.5" />
                  {result.preview.extracted.phone}
                </span>
              )}
            </div>
          )}
        </>
      ) : result.preview.skip ? (
        <Callout tone="info" title="The AI would skip this comment">
          {result.preview.skipReason || 'It doesn’t need a reply.'}
        </Callout>
      ) : (
        <>
          {result.preview.publicReply && (
            <Reply label="Public reply" icon={<Sparkles aria-hidden className="size-3" />}>
              {result.preview.publicReply}
            </Reply>
          )}
          {result.preview.privateReply && (
            <Reply label="Private message" icon={<Lock aria-hidden className="size-3" />}>
              {result.preview.privateReply}
            </Reply>
          )}
          {!result.preview.publicReply && !result.preview.privateReply && (
            <p className="type-body text-fg-muted">The AI didn’t write a reply.</p>
          )}
        </>
      )}
      <p className="type-caption text-fg-subtle">
        Answered by {aiSummary(preview.provider, preview.model)}. Nothing was sent.
      </p>
    </div>
  );
}

/** Try the AI with a sample message using the saved settings. Nothing is stored or sent. */
export function TryItPanel() {
  const [kind, setKind] = useState<TestAutoReplyInput['kind']>('dm');
  const [text, setText] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const test = useTestAutoReply();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = testAutoReplySchema.safeParse({ kind, text });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message);
      return;
    }
    setFieldError(undefined);
    test.mutate(parsed.data);
  }

  const unavailable =
    test.error &&
    isApiError(test.error) &&
    (test.error.status === 503 || test.error.code === 'AI_UNAVAILABLE');

  return (
    <Disclosure
      title="Try it"
      description="See how the AI would answer, using your saved settings. Nothing is sent."
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <SegmentedControl
          label="Sample type"
          value={kind}
          onChange={setKind}
          options={KINDS}
          className="self-start"
        />
        <FormField label="Sample message" error={fieldError}>
          <Textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              kind === 'dm'
                ? 'Hi! Price kya hai? Sunday ko visit kar sakte hain?'
                : 'Price please? 😍'
            }
          />
        </FormField>
        <Button
          type="submit"
          variant="primary"
          className="self-start"
          icon={<FlaskConical aria-hidden />}
          loading={test.isPending}
        >
          {test.isPending ? 'Asking the AI…' : 'Try it'}
        </Button>
      </form>
      <div aria-live="polite" className="mt-4 empty:mt-0">
        {test.error ? (
          <Callout
            tone="danger"
            title={unavailable ? 'The AI isn’t available' : 'That didn’t work'}
          >
            {unavailable
              ? 'Check that an AI key is set on the server, then try again in a moment.'
              : errorMessage(test.error)}
          </Callout>
        ) : test.data ? (
          <Result result={test.data} />
        ) : null}
      </div>
    </Disclosure>
  );
}
