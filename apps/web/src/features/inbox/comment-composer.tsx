import { useId, useState, type FormEvent } from 'react';
import { Send, Sparkles } from 'lucide-react';
import {
  commentReplySchema,
  IG_COMMENT_MAX_LENGTH,
  IG_DM_MAX_LENGTH,
  type IgComment,
} from '@leados/shared';
import { useReplyToComment } from '@/api/instagram';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { notify } from '@/lib/toast';

type Errors = { publicReply?: string; privateReply?: string; form?: string };

export interface ReplyText {
  publicReply: string | null;
  privateReply: string | null;
}

interface CommentComposerProps {
  comment: IgComment;
  initial?: ReplyText;
  submitLabel?: string;
  onDone: () => void;
  onCancel: () => void;
  onSuggest?: () => void;
  suggesting?: boolean;
}

function Counter({ value, max }: { value: string; max: number }) {
  const n = value.trim().length;
  return (
    <span className={cn('tabular-nums', n > max && 'font-medium text-danger-fg')}>
      {formatNumber(n)}/{formatNumber(max)}
    </span>
  );
}

/** Inline reply under a comment: public reply, plus an optional private DM. */
export function CommentComposer({
  comment,
  initial,
  submitLabel = 'Send',
  onDone,
  onCancel,
  onSuggest,
  suggesting,
}: CommentComposerProps) {
  const dmLocked = comment.privateReplySent && comment.replyStatus !== 'FAILED';
  const [publicReply, setPublicReply] = useState(initial?.publicReply ?? '');
  const [privateReply, setPrivateReply] = useState(dmLocked ? '' : (initial?.privateReply ?? ''));
  const [withDm, setWithDm] = useState(!dmLocked && Boolean(initial?.privateReply));
  const [errors, setErrors] = useState<Errors>({});
  const reply = useReplyToComment();
  const ids = useId();
  const who = comment.fromUsername ? `@${comment.fromUsername}` : 'the commenter';

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = commentReplySchema.safeParse({
      publicReply,
      privateReply: withDm ? privateReply : null,
    });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'publicReply' || key === 'privateReply')
          next[key] ??=
            issue.code === 'too_big'
              ? `Keep it under ${formatNumber(key === 'publicReply' ? IG_COMMENT_MAX_LENGTH : IG_DM_MAX_LENGTH)} characters`
              : issue.message;
        else next.form ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    reply.mutate(
      { id: comment.id, ...parsed.data },
      {
        onSuccess: () => {
          notify.success('Reply sent');
          onDone();
        },
        onError: (err) => notify.error(err, "We couldn't send the reply."),
      },
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-label={`Reply to ${who}`}
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-2.5"
    >
      <FormField
        label="Public reply"
        hideLabel
        description={<Counter value={publicReply} max={IG_COMMENT_MAX_LENGTH} />}
        error={errors.publicReply}
      >
        <Textarea
          rows={2}
          autoFocus
          placeholder={`Reply to ${who} publicly…`}
          value={publicReply}
          onChange={(e) => setPublicReply(e.target.value)}
          className="resize-y"
        />
      </FormField>
      <div className="flex items-center gap-2">
        <Switch
          id={`${ids}-dm`}
          checked={withDm}
          disabled={dmLocked}
          onCheckedChange={setWithDm}
          aria-describedby={dmLocked ? `${ids}-dm-note` : undefined}
        />
        <label htmlFor={`${ids}-dm`} className="type-small text-fg">
          Also send a private DM
        </label>
      </div>
      {dmLocked && (
        <p id={`${ids}-dm-note`} className="type-caption text-fg-subtle">
          You’ve already sent {who} a private message about this comment. Instagram allows only one.
        </p>
      )}
      {withDm && (
        <FormField
          label="Private message"
          description={
            <>
              Sent to {who} as a direct message ·{' '}
              <Counter value={privateReply} max={IG_DM_MAX_LENGTH} />
            </>
          }
          error={errors.privateReply}
        >
          <Textarea
            rows={2}
            value={privateReply}
            onChange={(e) => setPrivateReply(e.target.value)}
            className="resize-y"
          />
        </FormField>
      )}
      <div aria-live="polite">
        {errors.form && <p className="type-caption font-medium text-danger-fg">{errors.form}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {onSuggest && (
          <Button
            size="sm"
            variant="ghost"
            icon={<Sparkles aria-hidden />}
            loading={suggesting}
            disabled={reply.isPending}
            onClick={onSuggest}
          >
            Suggest
          </Button>
        )}
        <span className="ml-auto" />
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={reply.isPending}>
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          variant="primary"
          icon={<Send aria-hidden />}
          loading={reply.isPending}
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
