import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import type { InstagramStatus } from '@leados/shared';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConnectForm } from './connect-form';
import { WebhookValues } from './webhook-values';

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-subtle type-small font-semibold text-primary-subtle-fg"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <h3 className="type-body font-semibold text-fg">
          <span className="sr-only">Step {n}: </span>
          {title}
        </h3>
        <div className="mt-1 flex flex-col gap-3 type-small text-fg-muted">{children}</div>
      </div>
    </li>
  );
}

function External({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1 font-medium text-primary-text hover:underline"
    >
      {children}
      <ExternalLink aria-hidden className="size-3" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** Step-by-step instructions for connecting an Instagram professional account. */
export function SetupGuide({ status }: { status: InstagramStatus }) {
  return (
    <Card>
      <CardHeader
        title="Connect your Instagram account"
        description="About 10 minutes, once. You need an Instagram Business or Creator account."
      />
      <CardBody>
        <ol className="flex flex-col gap-4">
          <Step n={1} title="Create a Meta app with the Instagram API">
            <p>
              In{' '}
              <External href="https://developers.facebook.com/apps">Meta for Developers</External>,
              create an app of type “Business” and add the <strong>Instagram</strong> product.
              Choose “API setup with Instagram login”.
            </p>
          </Step>
          <Step n={2} title="Add your Instagram professional account">
            <p>
              Under “Generate access tokens”, add the Instagram account you want to answer from and
              allow the messaging and comment permissions it asks for.
            </p>
          </Step>
          <Step n={3} title="Set up the webhook">
            <p>
              Under “Configure webhooks”, paste these two values, click “Verify and save”, then
              subscribe to the <strong>messages</strong> and <strong>comments</strong> fields.
            </p>
            <WebhookValues status={status} />
          </Step>
          <Step n={4} title="Generate an access token and paste it here">
            <p>
              Click “Generate token” next to your account, copy the long token and paste it below.
              LeadOS refreshes it automatically before it expires.
            </p>
            <ConnectForm />
          </Step>
        </ol>
      </CardBody>
    </Card>
  );
}
