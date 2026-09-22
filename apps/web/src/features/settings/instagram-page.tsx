import { Card } from '@/components/ui/card';
import { Callout } from '@/components/ui/callout';
import { ErrorState } from '@/components/ui/empty-state';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { useInstagramStatus } from '@/api/instagram';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { errorMessage } from '@/lib/api-client';
import { AccountCard } from './instagram/account-card';
import { AdvancedSection } from './instagram/advanced-section';
import { Disclosure } from '@/components/ui/disclosure';
import { SetupGuide } from './instagram/setup-guide';
import { SimulateCard } from './instagram/simulate-card';

export default function InstagramSettingsPage() {
  useDocumentTitle('Instagram settings');
  const { data: status, isLoading, error, refetch, isRefetching } = useInstagramStatus();

  if (isLoading)
    return (
      <LoadingRegion label="Loading Instagram settings…">
        <Card className="space-y-4 p-5">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-2/3" />
        </Card>
      </LoadingRegion>
    );
  if (!status)
    return (
      <ErrorState
        message={errorMessage(error)}
        onRetry={() => void refetch()}
        retrying={isRefetching}
      />
    );

  const account = status.connected ? status.account : null;
  return (
    <div className="flex flex-col gap-4">
      {account ? (
        <AccountCard status={status} account={account} />
      ) : status.managedByServer ? (
        <Callout tone="warning" title="Instagram isn’t connected yet">
          LeadOS connects by itself using <code>INSTAGRAM_ACCESS_TOKEN</code> when the server
          starts. If this stays here, check that token on the server and restart LeadOS.
        </Callout>
      ) : (
        <SetupGuide status={status} />
      )}

      {account && <AdvancedSection status={status} />}

      {status.testMode && (
        <Disclosure
          title="Test tools"
          description="Test mode is on: nothing is sent to Instagram. Try the inbox with fake messages."
        >
          <SimulateCard />
        </Disclosure>
      )}
    </div>
  );
}
