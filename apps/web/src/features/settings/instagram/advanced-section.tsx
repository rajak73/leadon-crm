import { useState } from 'react';
import { Unplug } from 'lucide-react';
import type { InstagramStatus } from '@leados/shared';
import { useDisconnectInstagram } from '@/api/instagram';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatDate } from '@/lib/format';
import { notify } from '@/lib/toast';
import { ConnectForm } from './connect-form';
import { Disclosure } from '@/components/ui/disclosure';
import { WebhookValues } from './webhook-values';

/** Webhook values, token details, switching accounts and disconnecting — hidden by default. */
export function AdvancedSection({ status }: { status: InstagramStatus }) {
  const [switching, setSwitching] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const disconnect = useDisconnectInstagram();
  const account = status.account;

  return (
    <Disclosure
      title="Advanced"
      description="Webhook details and connection options. Only needed if you change the Meta app."
    >
      <section aria-labelledby="ig-webhook" className="flex flex-col gap-3">
        <h3 id="ig-webhook" className="type-body font-semibold text-fg">
          Webhook
        </h3>
        <WebhookValues status={status} />
      </section>

      {account && (
        <section aria-labelledby="ig-token" className="flex flex-col gap-3">
          <h3 id="ig-token" className="type-body font-semibold text-fg">
            Access token
          </h3>
          <p className="type-small text-fg-muted">
            {status.managedByServer
              ? 'Comes from INSTAGRAM_ACCESS_TOKEN on the server. '
              : 'Pasted in LeadOS. '}
            {account.tokenExpiresAt
              ? `LeadOS renews it automatically before ${formatDate(account.tokenExpiresAt)}.`
              : 'It doesn’t expire.'}
          </p>
          {!status.managedByServer &&
            (switching ? (
              <ConnectForm
                submitLabel="Use this token"
                onDone={() => setSwitching(false)}
                onCancel={() => setSwitching(false)}
              />
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setSwitching(true)}>
                  Use a different token
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Unplug aria-hidden />}
                  onClick={() => setConfirmOpen(true)}
                >
                  Disconnect
                </Button>
              </div>
            ))}
        </section>
      )}

      {account && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`Disconnect @${account.username}?`}
          description="LeadOS stops receiving and answering Instagram messages and comments. Conversations you already have stay in the inbox."
          confirmLabel="Disconnect"
          onConfirm={async () => {
            await disconnect.mutateAsync();
            notify.success('Instagram disconnected');
          }}
        />
      )}
    </Disclosure>
  );
}
