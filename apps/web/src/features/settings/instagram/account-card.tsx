import { useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import type { InstagramStatus } from '@leados/shared';
import { IgAvatar } from '@/components/domain/ig-avatar';
import { RelativeTime } from '@/components/domain/relative-time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Card, CardBody } from '@/components/ui/card';
import { formatDate } from '@/lib/format';
import { igAccountStatusLabels, igAccountStatusTones } from '@/lib/labels';
import { ConnectForm } from './connect-form';

type Account = NonNullable<InstagramStatus['account']>;

/** The connected account at a glance: who, whether it's working, and when it last heard from Instagram. */
export function AccountCard({ status, account }: { status: InstagramStatus; account: Account }) {
  const [reconnecting, setReconnecting] = useState(false);
  const healthy = account.status === 'ACTIVE';

  return (
    <Card>
      <CardBody className="flex flex-col gap-4 pt-5">
        <div className="flex items-center gap-3">
          <IgAvatar name={account.name || account.username} src={account.profilePictureUrl} />
          <div className="min-w-0 flex-1">
            <p className="truncate type-body font-semibold text-fg">
              {account.name || `@${account.username}`}
            </p>
            <a
              href={`https://instagram.com/${encodeURIComponent(account.username)}`}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 type-small text-fg-muted hover:text-fg hover:underline"
            >
              @{account.username}
              <ExternalLink aria-hidden className="size-3" />
              <span className="sr-only"> on Instagram (opens in a new tab)</span>
            </a>
          </div>
          <Badge tone={igAccountStatusTones[account.status]} dot>
            {igAccountStatusLabels[account.status]}
          </Badge>
        </div>

        <p className="type-small text-fg-muted">
          Last message from Instagram{' '}
          <span className="text-fg">
            {account.lastWebhookAt ? <RelativeTime date={account.lastWebhookAt} /> : 'not yet'}
          </span>
          {' · '}connected since <span className="text-fg">{formatDate(account.connectedAt)}</span>
        </p>

        {!healthy &&
          !reconnecting &&
          (status.managedByServer ? (
            <Callout tone="warning" title="Instagram isn’t working right now">
              {account.statusMessage || 'LeadOS can’t reach the account.'} Update{' '}
              <code>INSTAGRAM_ACCESS_TOKEN</code> on the server and restart LeadOS — it reconnects
              by itself.
            </Callout>
          ) : (
            <Callout
              tone={account.status === 'EXPIRED' ? 'warning' : 'danger'}
              title="Instagram needs you to reconnect"
              actions={
                <Button
                  size="sm"
                  icon={<RefreshCw aria-hidden />}
                  onClick={() => setReconnecting(true)}
                >
                  Reconnect
                </Button>
              }
            >
              {account.statusMessage ||
                'LeadOS can’t reach your account right now, so messages aren’t being answered.'}
            </Callout>
          ))}
        {reconnecting && (
          <div className="rounded-lg border border-border p-4">
            <p className="mb-3 type-small text-fg-muted">
              Generate a new token in the Meta dashboard (Instagram → API setup → Generate token)
              and paste it here.
            </p>
            <ConnectForm
              submitLabel="Reconnect"
              onDone={() => setReconnecting(false)}
              onCancel={() => setReconnecting(false)}
            />
          </div>
        )}
      </CardBody>
    </Card>
  );
}
