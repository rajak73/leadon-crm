import type { InstagramStatus } from '@leados/shared';
import { CopyButton } from '@/components/domain/copy-button';
import { Callout } from '@/components/ui/callout';

function CopyField({
  label,
  value,
  copyLabel,
}: {
  label: string;
  value: string;
  copyLabel: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="type-small font-medium text-fg">{label}</span>
      <div className="flex items-center gap-2">
        <code
          className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted px-3 py-1.5 font-mono type-small text-fg select-all"
          title={value}
        >
          {value}
        </code>
        <CopyButton value={value} label={copyLabel} />
      </div>
    </div>
  );
}

/** Callback URL + verify token to paste into the Meta dashboard, with setup warnings. */
export function WebhookValues({ status }: { status: InstagramStatus }) {
  return (
    <div className="flex flex-col gap-3">
      <CopyField
        label="Callback URL"
        copyLabel="Copy callback URL"
        value={status.webhook.callbackUrl}
      />
      <CopyField
        label="Verify token"
        copyLabel="Copy verify token"
        value={status.webhook.verifyToken}
      />
      {!status.webhook.isPublicUrl && (
        <Callout tone="warning" title="Meta can't reach this address">
          <p>
            The callback URL points at your own computer (localhost), so Instagram can't deliver
            messages to it. Open a public tunnel, for example:
          </p>
          <code className="mt-2 block overflow-x-auto rounded-md bg-surface px-3 py-2 font-mono type-caption whitespace-nowrap text-fg">
            cloudflared tunnel --url http://localhost:4000
          </code>
          <p className="mt-2">
            Then set <code className="font-mono">PUBLIC_URL</code> in <code>.env</code> to the https
            address it prints, restart LeadOS and use the new callback URL.
          </p>
        </Callout>
      )}
      {!status.appSecretConfigured && (
        <Callout tone="warning" title="The app secret isn't set">
          Add <code className="font-mono">META_APP_SECRET</code> (from your Meta app's Instagram
          settings) to <code>.env</code> and restart. LeadOS needs it to check that incoming
          webhooks really come from Instagram.
        </Callout>
      )}
    </div>
  );
}
