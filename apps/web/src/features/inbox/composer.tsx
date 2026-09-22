import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { Clock, Send, Sparkles } from 'lucide-react';
import { IG_DM_MAX_LENGTH } from '@leados/shared';
import { useSendMessage, useSuggestReply } from '@/api/instagram';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Textarea } from '@/components/ui/input';
import { isApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { notify } from '@/lib/toast';

export const REPLY_WINDOW_CLOSED =
  "You can only reply within 24 hours of the customer's last message.";

/** 503 AI_UNAVAILABLE and similar: explain in plain words instead of a server message. */
export function notifyAiUnavailable(e: unknown) {
  if (isApiError(e) && (e.status === 503 || e.code === 'AI_UNAVAILABLE'))
    notify.error(
      "AI suggestions aren't available right now. An admin can check the AI setup under Settings → Auto-reply.",
    );
  else notify.error(e, "We couldn't get a suggestion. Please try again.");
}

interface ComposerProps {
  conversationId: string;
  canReply: boolean;
}

/** Reply box: Enter sends, Shift+Enter adds a new line. */
export function Composer({ conversationId, canReply }: ComposerProps) {
  const [text, setText] = useState('');
  const [handoff, setHandoff] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const send = useSendMessage(conversationId);
  const suggest = useSuggestReply(conversationId);
  const ids = useId();
  const counterId = `${ids}-count`;
  const helpId = `${ids}-help`;

  const length = text.trim().length;
  const tooLong = length > IG_DM_MAX_LENGTH;
  const canSend = canReply && length > 0 && !tooLong;

  function submit() {
    if (!canSend) return;
    const value = text.trim();
    setText('');
    setHandoff(null);
    send.mutate(value, {
      onError: (e) => {
        // Put the text back so nothing is lost.
        setText((current) => current || value);
        notify.error(e, "We couldn't send the message.");
      },
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  function askAi() {
    suggest.mutate(undefined, {
      onSuccess: (preview) => {
        setHandoff(
          preview.handoff
            ? preview.handoffReason || 'The AI thinks a person should answer this one.'
            : null,
        );
        if (preview.reply) {
          setText(preview.reply);
          ref.current?.focus();
        }
      },
      onError: notifyAiUnavailable,
    });
  }

  return (
    <div className="border-t border-border bg-surface p-3">
      {handoff && (
        <Callout tone="warning" live title="A person should answer this" className="mb-3">
          {handoff}
        </Callout>
      )}
      {!canReply && (
        <p id={helpId} className="mb-2 flex items-center gap-2 type-small text-fg-muted">
          <Clock aria-hidden className="size-4 shrink-0" />
          {REPLY_WINDOW_CLOSED}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-col gap-2"
      >
        <label htmlFor={`${ids}-text`} className="sr-only">
          Your reply
        </label>
        <Textarea
          ref={ref}
          id={`${ids}-text`}
          rows={2}
          value={text}
          disabled={!canReply}
          placeholder={canReply ? 'Write a reply…' : 'Replies are closed for now'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          aria-invalid={tooLong || undefined}
          aria-describedby={[counterId, !canReply && helpId].filter(Boolean).join(' ')}
          className="max-h-48 min-h-16 resize-y"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            icon={<Sparkles aria-hidden />}
            disabled={!canReply}
            loading={suggest.isPending}
            onClick={askAi}
          >
            Suggest reply
          </Button>
          <span className="hidden type-caption text-fg-subtle sm:inline">
            Enter to send · Shift+Enter for a new line
          </span>
          <span
            id={counterId}
            className={cn(
              'ml-auto type-caption tabular-nums',
              tooLong ? 'font-medium text-danger-fg' : 'text-fg-subtle',
            )}
          >
            <span className="sr-only">Characters used: </span>
            {formatNumber(length)}/{formatNumber(IG_DM_MAX_LENGTH)}
            {tooLong && ' — too long for Instagram'}
          </span>
          <span aria-live="polite" className="sr-only">
            {tooLong ? `Instagram messages are limited to ${IG_DM_MAX_LENGTH} characters.` : ''}
          </span>
          <Button
            type="submit"
            size="sm"
            variant="primary"
            icon={<Send aria-hidden />}
            disabled={!canSend}
          >
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}
