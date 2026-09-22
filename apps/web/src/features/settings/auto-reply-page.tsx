import { Card } from '@/components/ui/card';
import { Callout } from '@/components/ui/callout';
import { ErrorState } from '@/components/ui/empty-state';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { useAutoReplySettings } from '@/api/auto-reply';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { errorMessage } from '@/lib/api-client';
import { useSession } from '@/providers/session';
import { AutoReplyForm } from './auto-reply/auto-reply-form';
import { TryItPanel } from './auto-reply/try-it-panel';

export default function AutoReplyPage() {
  useDocumentTitle('Auto-reply settings');
  const { isAdmin } = useSession();
  const { data: settings, isLoading, error, refetch, isRefetching } = useAutoReplySettings();

  if (isLoading)
    return (
      <LoadingRegion label="Loading auto-reply settings…" className="flex flex-col gap-4">
        {[2, 4, 2].map((n, i) => (
          <Card key={i} className="space-y-4 p-5">
            <Skeleton className="h-5 w-40" />
            {Array.from({ length: n }, (_, j) => (
              <Skeleton key={j} className="h-9 w-full" />
            ))}
          </Card>
        ))}
      </LoadingRegion>
    );
  if (!settings)
    return (
      <ErrorState
        message={errorMessage(error)}
        onRetry={() => void refetch()}
        retrying={isRefetching}
      />
    );

  return (
    <div className="flex flex-col gap-4">
      {settings.aiProvider === 'rules' && (
        <Callout tone="warning" title="AI replies are off">
          Add <code className="font-mono">GEMINI_API_KEY</code> or{' '}
          <code className="font-mono">GROQ_API_KEY</code> on the server and restart LeadOS to turn
          on AI replies. Both have a free tier.
        </Callout>
      )}
      {!isAdmin && (
        <Callout tone="info" title="Only admins can change these settings">
          You can see how auto-reply is set up and try it below.
        </Callout>
      )}
      <AutoReplyForm settings={settings} canEdit={isAdmin} />
      <TryItPanel />
    </div>
  );
}
