import { useNavigate } from 'react-router';
import { LogOut, UserCog } from 'lucide-react';
import { useSession } from '@/providers/session';
import { personName } from '@/lib/format';
import { userRoleLabels } from '@/lib/labels';
import { Avatar } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function UserMenu() {
  const { user, signOut } = useSession();
  const navigate = useNavigate();
  if (!user) return null;
  const name = personName(user);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${name}`}
        className="flex items-center gap-2 rounded-full p-0.5 hover:bg-muted"
      >
        <Avatar name={name} size="md" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56">
        <div className="px-2.5 py-2">
          <p className="truncate type-body font-medium text-fg">{name}</p>
          <p className="truncate type-small text-fg-muted">{user.email}</p>
          <p className="mt-0.5 type-caption text-fg-subtle">{userRoleLabels[user.role]}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          icon={<UserCog aria-hidden />}
          onSelect={() => navigate('/settings/profile')}
        >
          Profile and password
        </DropdownMenuItem>
        <DropdownMenuItem
          icon={<LogOut aria-hidden />}
          onSelect={async () => {
            await signOut();
            navigate('/login', { replace: true });
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
