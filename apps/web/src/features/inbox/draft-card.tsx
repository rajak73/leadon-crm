import { useEffect, useId, useState } from 'react';
import { Send, Sparkles, Trash2 } from 'lucide-react';
import { IG_DM_MAX_LENGTH, type IgMessage } from '@leados/shared';
import { useDraftAction } from '@/api/instagram';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { formatNumber } from '@/lib/format';
import { notify } from '@/lib/toast';
import { REPLY_WINDOW_CLOSED } from './composer';

/** The newest pending AI draft in a thread, if any. */
export function pendingDraft(messages: IgMessage[]): IgMessage | undefined {
  return [...messages].reverse().find((m) => m.status === 'DRAFT');
}

interface DraftCardProps {
  conversationId: string;
  draft: IgMessage;
  canReply: boolean;
}

/** AI draft waiting for approval, pinned above the composer. Edit, send or discard it. */
export function DraftCard({ conversationId, draft, canReply }: DraftCardProps) {
  const original = draft.text ?? '';
  const [text, setText] = useState(original);
  const action = useDraftAction(conversationId);
  const ids = useId();

  // A newer draft replaces the old one: start again from its text.
  useEffect(() => setText(draft.text ?? ''), [draft.id, draft.text]);

  const trimmed = text.trim();
  const edited = trimmed !== original.trim();
  const tooLong = trimmed.length > IG_DM_MAX_LENGTH;
  const pending = action.isPending ? action.variables?.action : undefined;

  function sendDraft() {
    if (!trimmed || tooLong) return;
    action.mutate(
      edited
        ? { messageId: draft.id, action: 'send', text: trimmed }
        : { messageId: draft.id, action: 'send' },
      {
        onSuccess: () => notify.success('Reply sent'),
        onError: (e) => notify.error(e, "We couldn't send the draft."),
      },
    );
  }

  function discard() {
    action.mutate(
      { messageId: draft.id, action: 'discard' },
      {
        onSuccess: () => notify.info('Draft discarded'),
        onError: (e) => notify.error(e, "We couldn't discard the draft."),
      },
    );
  }

  return (
    <section
      aria-labelledby={`${ids}-title`}
      className="border-t border-border bg-primary-subtle/40 px-3 pt-3 pb-2"
    >
      <div className="mb-2 flex items-center gap-2">
        <Sparkles aria-hidden className="size-4 text-primary-text" />
        <h3 id={`${ids}-title`} className="type-small font-semibold text-fg">
          AI draft — waiting for you
        </h3>
      </div>
      <label htmlFor={`${ids}-text`} className="sr-only">
        Draft reply
      </label>
      <Textarea
        id={`${ids}-text`}
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-invalid={tooLong || !trimmed || undefined}
        aria-describedby={`${ids}-hint`}
        className="max-h-48 resize-y bg-surface"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <p id={`${ids}-hint`} className="mr-auto type-caption text-fg-subtle" aria-live="polite">
          {!canReply
            ? REPLY_WINDOW_CLOSED
            : tooLong
              ? `Instagram messages are limited to ${formatNumber(IG_DM_MAX_LENGTH)} characters.`
              : !trimmed
                ? 'Write a message first.'
                : edited
                  ? 'Your edits will be sent.'
                  : 'Edit it if you like, then send.'}
        </p>
        <Button
          size="sm"
          variant="ghost"
          icon={<Trash2 aria-hidden />}
          loading={pending === 'discard'}
          disabled={action.isPending}
          onClick={discard}
        >
          Discard
        </Button>
        <Button
          size="sm"
          variant="primary"
          icon={<Send aria-hidden />}
          loading={pending === 'send'}
          disabled={!canReply || !trimmed || tooLong || action.isPending}
          onClick={sendDraft}
        >
          Send
        </Button>
      </div>
    </section>
  );
}
