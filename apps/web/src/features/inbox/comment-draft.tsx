import { Lock, Pencil, Send, Sparkles, Trash2 } from 'lucide-react';
import type { IgComment } from '@leados/shared';
import { useDiscardCommentDraft, useReplyToComment } from '@/api/instagram';
import { Button } from '@/components/ui/button';
import { notify } from '@/lib/toast';

/** AI draft waiting under a comment: send it as is, edit it, or discard it. */
export function CommentDraft({ comment: c, onEdit }: { comment: IgComment; onEdit: () => void }) {
  const reply = useReplyToComment();
  const discard = useDiscardCommentDraft();
  const busy = reply.isPending || discard.isPending;
  const dm = c.privateReplySent ? null : c.privateReply;

  function send() {
    reply.mutate(
      { id: c.id, publicReply: c.publicReply, privateReply: dm },
      {
        onSuccess: () => notify.success('Reply sent'),
        onError: (e) => notify.error(e, "We couldn't send the draft."),
      },
    );
  }

  function drop() {
    discard.mutate(c.id, {
      onSuccess: () => notify.info('Draft discarded'),
      onError: (e) => notify.error(e, "We couldn't discard the draft."),
    });
  }

  return (
    <section
      aria-label="AI draft"
      className="rounded-lg border border-primary-subtle bg-primary-subtle/40 px-2.5 py-2"
    >
      <p className="flex items-center gap-1 type-caption font-medium text-primary-text">
        <Sparkles aria-hidden className="size-3.5" />
        AI draft
      </p>
      {c.publicReply && (
        <p className="mt-1 type-small break-words whitespace-pre-wrap text-fg">{c.publicReply}</p>
      )}
      {dm && (
        <p className="mt-1 flex gap-1.5 type-small text-fg">
          <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" />
          <span className="min-w-0 break-words whitespace-pre-wrap">
            <span className="font-medium text-fg-muted">Private DM: </span>
            {dm}
          </span>
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant="primary"
          icon={<Send aria-hidden />}
          loading={reply.isPending}
          disabled={busy}
          onClick={send}
        >
          Send
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={<Pencil aria-hidden />}
          disabled={busy}
          onClick={onEdit}
        >
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<Trash2 aria-hidden />}
          loading={discard.isPending}
          disabled={busy}
          onClick={drop}
        >
          Discard
        </Button>
      </div>
    </section>
  );
}
