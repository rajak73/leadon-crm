import { Link, useLocation } from 'react-router';
import { ArrowLeft, ExternalLink, Info, UserPlus, UserRound } from 'lucide-react';
import type { IgConversation } from '@leados/shared';
import { useCreateConversationLead, useUpdateConversation } from '@/api/instagram';
import { IgAvatar, igDisplayName } from '@/components/domain/ig-avatar';
import { Button, buttonClasses } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Switch } from '@/components/ui/switch';
import { Tooltip } from '@/components/ui/tooltip';
import { personName } from '@/lib/format';
import { notify } from '@/lib/toast';

const AUTO_REPLY_HELP =
  'When on, the AI answers new messages in this chat using your business info. It pauses by itself when a person should step in, or when you reply from the Instagram app.';

export function ThreadHeader({ conversation: c }: { conversation: IgConversation }) {
  const { search } = useLocation();
  const update = useUpdateConversation(c.id);
  const createLead = useCreateConversationLead(c.id);
  const name = igDisplayName(c);

  function setAi(aiEnabled: boolean) {
    update.mutate(
      { aiEnabled },
      {
        onSuccess: () => notify.success(aiEnabled ? 'Auto-reply is on' : 'Auto-reply is off'),
        onError: (e) => notify.error(e, "We couldn't change auto-reply."),
      },
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-3 sm:px-4">
        <Link
          to={`/inbox${search}`}
          aria-label="Back to conversations"
          className={buttonClasses({ variant: 'ghost', iconOnly: true, className: 'md:hidden' })}
        >
          <ArrowLeft aria-hidden />
        </Link>
        <IgAvatar name={name} src={c.profilePictureUrl} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate type-section text-fg">{name}</h2>
          {c.username && (
            <a
              href={`https://instagram.com/${encodeURIComponent(c.username)}`}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 type-small text-fg-muted hover:text-fg hover:underline"
            >
              @{c.username}
              <ExternalLink aria-hidden className="size-3" />
              <span className="sr-only"> on Instagram (opens in a new tab)</span>
            </a>
          )}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {c.lead ? (
            <Link
              to={`/leads/${c.lead.id}`}
              className="inline-flex h-8 max-w-48 items-center gap-1.5 rounded-full border border-border bg-surface px-3 type-small font-medium text-fg hover:bg-muted"
            >
              <UserRound aria-hidden className="size-3.5 shrink-0" />
              <span className="sr-only">Lead: </span>
              <span className="truncate">{personName(c.lead)}</span>
            </Link>
          ) : (
            <Button
              size="sm"
              icon={<UserPlus aria-hidden />}
              loading={createLead.isPending}
              onClick={() =>
                createLead.mutate(undefined, {
                  onSuccess: () => notify.success('Lead created'),
                  onError: (e) => notify.error(e, "We couldn't create the lead."),
                })
              }
            >
              Create lead
            </Button>
          )}
          <div className="flex items-center gap-1.5 sm:ml-2">
            <label htmlFor={`ai-${c.id}`} className="type-small font-medium text-fg">
              Auto-reply
            </label>
            <Switch
              id={`ai-${c.id}`}
              checked={c.aiEnabled}
              disabled={update.isPending}
              onCheckedChange={setAi}
              aria-describedby={`ai-help-${c.id}`}
            />
            <span id={`ai-help-${c.id}`} className="sr-only">
              {AUTO_REPLY_HELP}
            </span>
            <Tooltip content={AUTO_REPLY_HELP}>
              <button
                type="button"
                aria-label="What does auto-reply do?"
                className="flex size-6 items-center justify-center rounded-full text-fg-subtle hover:text-fg"
              >
                <Info aria-hidden className="size-4" />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
      {!c.aiEnabled && c.aiPausedReason && (
        <Callout
          tone="warning"
          title="Auto-reply is paused for this chat"
          className="mx-3 mt-3 sm:mx-4"
          actions={
            <Button size="sm" loading={update.isPending} onClick={() => setAi(true)}>
              Turn auto-reply back on
            </Button>
          }
        >
          {c.aiPausedReason}
        </Callout>
      )}
    </>
  );
}
