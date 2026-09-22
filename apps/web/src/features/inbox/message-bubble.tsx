import { AlertCircle, ExternalLink, Paperclip, RotateCw, Sparkles } from 'lucide-react';
import type { IgAttachment, IgMessage } from '@leados/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { formatDateTime, formatTime, personName } from '@/lib/format';
import { attachmentTypeLabels, messageAuthorLabels } from '@/lib/labels';

function Attachment({ attachment: a, outbound }: { attachment: IgAttachment; outbound: boolean }) {
  const label = attachmentTypeLabels[a.type];
  if (a.type === 'image' && a.url)
    return (
      <a
        href={a.url}
        target="_blank"
        rel="noreferrer noopener"
        className="block overflow-hidden rounded-lg"
      >
        <img
          src={a.url}
          alt={outbound ? 'Photo you sent' : 'Photo from the customer'}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="max-h-60 w-auto max-w-full object-cover"
        />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  if (!a.url)
    return (
      <span className="inline-flex items-center gap-1.5 type-small opacity-80">
        <Paperclip aria-hidden className="size-3.5" />
        {label}
      </span>
    );
  return (
    <a
      href={a.url}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1.5 type-small font-medium underline underline-offset-2"
    >
      <Paperclip aria-hidden className="size-3.5" />
      Open {label.toLowerCase()}
      <ExternalLink aria-hidden className="size-3" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** Who wrote an outbound message, in plain words. */
export function authorLabel(m: IgMessage, currentUserId: string | undefined): string {
  if (m.author === 'USER' && m.sentBy && m.sentBy.id !== currentUserId) return personName(m.sentBy);
  return messageAuthorLabels[m.author];
}

interface MessageBubbleProps {
  message: IgMessage;
  currentUserId?: string;
  customerName: string;
  onRetry?: (m: IgMessage) => void;
  retrying?: boolean;
}

/** One message: customer on the left, the business (you, teammates, AI) on the right. */
export function MessageBubble({
  message: m,
  currentUserId,
  customerName,
  onRetry,
  retrying,
}: MessageBubbleProps) {
  const outbound = m.direction === 'OUTBOUND';
  const failed = m.status === 'FAILED';
  const who = outbound ? authorLabel(m, currentUserId) : customerName;
  const at = m.sentAt ?? m.createdAt;

  return (
    <div className={cn('flex flex-col gap-1', outbound ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'flex max-w-[85%] flex-col gap-2 rounded-2xl px-3.5 py-2 type-body break-words whitespace-pre-wrap sm:max-w-[70%]',
          !outbound && 'rounded-bl-md bg-muted text-fg',
          outbound && m.author === 'USER' && 'rounded-br-md bg-primary text-primary-fg',
          outbound && m.author === 'AI' && 'rounded-br-md bg-primary-subtle text-primary-subtle-fg',
          outbound &&
            m.author === 'INSTAGRAM_APP' &&
            'rounded-br-md border border-border bg-surface text-fg',
          failed && 'opacity-80 ring-2 ring-danger',
          m.status === 'SENDING' && 'opacity-70',
        )}
      >
        <span className="sr-only">{who}: </span>
        {m.text}
        {m.attachments.map((a, i) => (
          <Attachment key={i} attachment={a} outbound={outbound} />
        ))}
      </div>
      <p className="flex flex-wrap items-center gap-x-1.5 px-1 type-caption text-fg-subtle">
        {outbound && (
          <span aria-hidden className="inline-flex items-center gap-1">
            {m.author === 'AI' && <Sparkles className="size-3" />}
            {who}
          </span>
        )}
        {outbound && <span aria-hidden>·</span>}
        {m.status === 'SENDING' ? (
          <span>Sending…</span>
        ) : (
          <time dateTime={at} title={formatDateTime(at)}>
            {formatTime(at)}
          </time>
        )}
      </p>
      {failed && (
        <div className="flex flex-wrap items-center justify-end gap-2 px-1">
          <p className="inline-flex items-center gap-1 type-caption font-medium text-danger-fg">
            <AlertCircle aria-hidden className="size-3.5" />
            Not sent{m.error ? ` — ${m.error}` : ''}
          </p>
          {onRetry && m.text && (
            <Button
              size="sm"
              variant="ghost"
              loading={retrying}
              icon={<RotateCw aria-hidden />}
              onClick={() => onRetry(m)}
            >
              Retry
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
