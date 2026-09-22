import { useState } from 'react';
import { UserPlus, Users } from 'lucide-react';
import type { User } from '@leados/shared';
import { useUsers } from '@/api/account';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { RelativeTime } from '@/components/domain/relative-time';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { errorMessage } from '@/lib/api-client';
import { personName, pluralize } from '@/lib/format';
import { userRoleLabels, userStatusLabels } from '@/lib/labels';
import { useCurrentUser } from '@/providers/session';
import { AddTeammateDialog } from './team/add-teammate-dialog';
import { UserActions } from './team/user-actions';

function NameCell({ user, isMe }: { user: User; isMe: boolean }) {
  const name = personName(user);
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={name} />
      <div className="min-w-0">
        <p className="truncate type-body font-medium text-fg">
          {name}
          {isMe && <span className="font-normal text-fg-muted"> (you)</span>}
        </p>
        <p className="truncate type-small text-fg-muted">{user.email}</p>
      </div>
    </div>
  );
}

function StatusBadge({ user }: { user: User }) {
  return (
    <Badge tone={user.status === 'ACTIVE' ? 'success' : 'neutral'} dot>
      {userStatusLabels[user.status]}
    </Badge>
  );
}

function LastSignIn({ user }: { user: User }) {
  return user.lastLoginAt ? (
    <RelativeTime date={user.lastLoginAt} />
  ) : (
    <span className="text-fg-subtle">Never</span>
  );
}

export default function TeamPage() {
  useDocumentTitle('Team settings');
  const me = useCurrentUser();
  const { data: users, isLoading, error, refetch } = useUsers();
  const [addOpen, setAddOpen] = useState(false);
  const sorted = [...(users ?? [])].sort(
    (a, b) =>
      (a.status === b.status ? 0 : a.status === 'ACTIVE' ? -1 : 1) ||
      a.firstName.localeCompare(b.firstName),
  );
  const activeCount = sorted.filter((u) => u.status === 'ACTIVE').length;

  let body;
  if (isLoading) {
    body = (
      <LoadingRegion label="Loading your team…" className="space-y-4 px-4 pb-5">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
          </div>
        ))}
      </LoadingRegion>
    );
  } else if (error && !users) {
    body = <ErrorState compact message={errorMessage(error)} onRetry={() => void refetch()} />;
  } else if (sorted.length === 0) {
    body = (
      <EmptyState
        compact
        icon={Users}
        title="No teammates yet"
        text="Add someone so they can sign in."
      />
    );
  } else {
    body = (
      <>
        <ul className="divide-y divide-border border-t border-border md:hidden">
          {sorted.map((u) => {
            const isMe = u.id === me.id;
            return (
              <li key={u.id} className="flex items-start gap-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <NameCell user={u} isMe={isMe} />
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-11 type-small text-fg-muted">
                    <span>{userRoleLabels[u.role]}</span>
                    <StatusBadge user={u} />
                    <span>
                      Last sign-in: <LastSignIn user={u} />
                    </span>
                  </div>
                </div>
                {!isMe && <UserActions user={u} />}
              </li>
            );
          })}
        </ul>
        <TableContainer className="hidden border-t border-border md:block">
          <Table>
            <THead>
              <tr>
                <TH className="pl-4">Name</TH>
                <TH>Role</TH>
                <TH>Status</TH>
                <TH>Last sign-in</TH>
                <TH className="pr-4">
                  <span className="sr-only">Actions</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {sorted.map((u) => {
                const isMe = u.id === me.id;
                return (
                  <TR key={u.id}>
                    <TD className="max-w-72 pl-4">
                      <NameCell user={u} isMe={isMe} />
                    </TD>
                    <TD>{userRoleLabels[u.role]}</TD>
                    <TD>
                      <StatusBadge user={u} />
                    </TD>
                    <TD className="text-fg-muted">
                      <LastSignIn user={u} />
                    </TD>
                    <TD className="pr-4 text-right">{!isMe && <UserActions user={u} />}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </TableContainer>
      </>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Team"
        description={
          users ? `${pluralize(activeCount, 'active teammate')}` : 'Who can sign in to LeadOS'
        }
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<UserPlus aria-hidden />}
            onClick={() => setAddOpen(true)}
          >
            Add teammate
          </Button>
        }
      />
      {body}
      <AddTeammateDialog open={addOpen} onOpenChange={setAddOpen} />
    </Card>
  );
}
