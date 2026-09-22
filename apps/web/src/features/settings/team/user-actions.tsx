import { useState } from 'react';
import { KeyRound, MoreHorizontal, ShieldCheck, ShieldOff, UserCheck, UserX } from 'lucide-react';
import type { User } from '@leados/shared';
import { useUpdateUser } from '@/api/account';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { personName } from '@/lib/format';
import { notify } from '@/lib/toast';
import { ResetPasswordDialog } from './reset-password-dialog';

/** Per-teammate actions: role, enable/disable, reset password. Never rendered for yourself. */
export function UserActions({ user }: { user: User }) {
  const update = useUpdateUser();
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const name = personName(user);
  const isAdmin = user.role === 'ADMIN';
  const disabled = user.status === 'DISABLED';

  function run(body: Parameters<typeof update.mutate>[0], success: string) {
    update.mutate(body, {
      onSuccess: () => notify.success(success),
      onError: (e) => notify.error(e, "We couldn't update this teammate."),
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={`Actions for ${name}`}
            icon={<MoreHorizontal aria-hidden />}
            loading={update.isPending}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {isAdmin ? (
            <DropdownMenuItem
              icon={<ShieldOff aria-hidden />}
              onSelect={() => run({ id: user.id, role: 'MEMBER' }, `${name} is now a member`)}
            >
              Make member
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              icon={<ShieldCheck aria-hidden />}
              onSelect={() => run({ id: user.id, role: 'ADMIN' }, `${name} is now an admin`)}
            >
              Make admin
            </DropdownMenuItem>
          )}
          <DropdownMenuItem icon={<KeyRound aria-hidden />} onSelect={() => setResetOpen(true)}>
            Reset password
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {disabled ? (
            <DropdownMenuItem
              icon={<UserCheck aria-hidden />}
              onSelect={() => run({ id: user.id, status: 'ACTIVE' }, `${name} can sign in again`)}
            >
              Enable
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              destructive
              icon={<UserX aria-hidden />}
              onSelect={() => setConfirmDisable(true)}
            >
              Disable
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmDisable}
        onOpenChange={setConfirmDisable}
        title={`Disable “${name}”?`}
        description="They'll be signed out and won't be able to sign in."
        confirmLabel="Disable"
        onConfirm={async () => {
          await update.mutateAsync({ id: user.id, status: 'DISABLED' });
          notify.success(`${name} was disabled`);
        }}
      />
      <ResetPasswordDialog user={user} open={resetOpen} onOpenChange={setResetOpen} />
    </>
  );
}
