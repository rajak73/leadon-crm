import { useState } from 'react';
import { Link } from 'react-router';
import { AlertCircle, Lock, MessageSquareReply, SkipForward, Sparkles } from 'lucide-react';
import type { IgComment } from '@leados/shared';
import { useSkipComment, useSuggestCommentReply } from '@/api/instagram';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { formatRelative, personName } from '@/lib/format';
import { notify } from '@/lib/toast';
import { CommentComposer, type ReplyText } from './comment-composer';
import { CommentDraft } from './comment-draft';
import { needsReply } from './comment-threads';
import { notifyAiUnavailable } from './composer';

/** What we sent, shown nested under the comment. */
function OurReply({ comment: c }: { comment: IgComment }) {
  const by = c.repliedBy ? 'You' : 'AI';
  return (
    <div className="flex gap-2 border-l-2 border-border py-0.5 pl-2.5">
      <Avatar name={by} size="xs" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-1.5 type-caption text-fg-muted">
          <span
            className="font-semibold text-fg"
            title={c.repliedBy ? `Replied by ${personName(c.repliedBy)}` : undefined}
          >
            {by}
          </span>
          <span aria-hidden>·</span>
          <span>Replied</span>
          {c.privateReplySent && (
            <span className="inline-flex items-center gap-1">
              <span aria-hidden>·</span>
              <Lock aria-hidden className="size-3" />
              Private DM sent
            </span>
          )}
        </p>
        {c.publicReply && (
          <p className="type-small break-words whitespace-pre-wrap text-fg">{c.publicReply}</p>
        )}
        {!c.publicReply && c.privateReply && (
          <p className="type-small break-words whitespace-pre-wrap text-fg-muted">
            {c.privateReply}
          </p>
        )}
      </div>
    </div>
  );
}

type Mode = { kind: 'idle' } | { kind: 'compose'; initial?: ReplyText; n: number };

/** One comment: who, what, our reply or draft, and reply actions. */
export function CommentRow({ comment: c, nested }: { comment: IgComment; nested?: boolean }) {
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const skip = useSkipComment();
  const suggest = useSuggestCommentReply();
  const who = c.fromUsername ? `@${c.fromUsername}` : 'Instagram user';
  const close = () => setMode({ kind: 'idle' });

  function askAi() {
    suggest.mutate(c.id, {
      onSuccess: (p) => {
        if (p.skip)
          notify.info(`The AI would skip this one: ${p.skipReason || 'no reply needed.'}`);
        setMode((m) => ({
          kind: 'compose',
          initial: { publicReply: p.publicReply, privateReply: p.privateReply },
          n: (m.kind === 'compose' ? m.n : 0) + 1,
        }));
      },
      onError: notifyAiUnavailable,
    });
  }

  function doSkip() {
    skip.mutate(c.id, {
      onSuccess: () => notify.info('Comment skipped'),
      onError: (e) => notify.error(e, "We couldn't skip the comment."),
    });
  }

  return (
    <article
      aria-label={`Comment from ${who}`}
      className={cn('flex gap-2.5', nested ? 'pt-2' : 'px-3 py-3 sm:px-4')}
    >
      <Avatar name={c.fromUsername ?? '?'} size={nested ? 'sm' : 'md'} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-x-1.5 type-small">
            {c.lead ? (
              <Link
                to={`/leads/${c.lead.id}`}
                className="font-semibold text-fg hover:underline"
                title={`Open lead: ${personName(c.lead)}`}
              >
                {who}
              </Link>
            ) : (
              <span className="font-semibold text-fg">{who}</span>
            )}
            <span aria-hidden className="text-fg-subtle">
              ·
            </span>
            <time dateTime={c.commentedAt} className="type-caption text-fg-subtle">
              {formatRelative(c.commentedAt)}
            </time>
            {c.replyStatus === 'FAILED' && <Badge tone="danger">Failed</Badge>}
            {c.replyStatus === 'SKIPPED' && <Badge tone="neutral">Skipped</Badge>}
          </p>
          <p className="type-body break-words whitespace-pre-wrap text-fg">{c.text}</p>
        </div>

        {c.replyStatus === 'FAILED' && (
          <p className="flex items-start gap-1 type-caption text-danger-fg">
            <AlertCircle aria-hidden className="mt-px size-3.5 shrink-0" />
            {c.replyError || 'The reply couldn’t be sent.'}
          </p>
        )}
        {c.replyStatus === 'SKIPPED' && c.skipReason && (
          <p className="type-caption text-fg-muted">{c.skipReason}</p>
        )}
        {c.replyStatus === 'REPLIED' && <OurReply comment={c} />}

        {mode.kind === 'compose' ? (
          <CommentComposer
            key={mode.n}
            comment={c}
            initial={mode.initial}
            onDone={close}
            onCancel={close}
            onSuggest={askAi}
            suggesting={suggest.isPending}
          />
        ) : c.replyStatus === 'DRAFT' ? (
          <CommentDraft
            comment={c}
            onEdit={() =>
              setMode({
                kind: 'compose',
                initial: { publicReply: c.publicReply, privateReply: c.privateReply },
                n: 1,
              })
            }
          />
        ) : needsReply(c) || c.replyStatus === 'SKIPPED' ? (
          <div className="-ml-2 flex flex-wrap gap-0.5">
            <Button
              size="sm"
              variant="ghost"
              icon={<MessageSquareReply aria-hidden />}
              onClick={() => setMode({ kind: 'compose', n: 1 })}
            >
              Reply
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<Sparkles aria-hidden />}
              loading={suggest.isPending}
              onClick={askAi}
            >
              Suggest
            </Button>
            {needsReply(c) && (
              <Button
                size="sm"
                variant="ghost"
                icon={<SkipForward aria-hidden />}
                loading={skip.isPending}
                onClick={doSkip}
              >
                Skip
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </article>
  );
}
