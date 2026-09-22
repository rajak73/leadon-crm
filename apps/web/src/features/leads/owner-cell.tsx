import type { UserRef } from '@leados/shared';
import { Avatar } from '@/components/ui/avatar';
import { personName } from '@/lib/format';

/** Avatar + name, or a muted "Unassigned". */
export function OwnerCell({ user }: { user: UserRef | null }) {
  if (!user) return <span className="type-small text-fg-subtle">Unassigned</span>;
  const name = personName(user);
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Avatar name={name} size="sm" />
      <span className="truncate type-small text-fg">{name}</span>
    </span>
  );
}
