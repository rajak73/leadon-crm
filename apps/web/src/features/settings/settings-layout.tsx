import { NavLink, Outlet } from 'react-router';
import {
  Bot,
  Instagram,
  KanbanSquare,
  SlidersHorizontal,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/cn';
import { useSession } from '@/providers/session';

interface SettingsNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

const items: SettingsNavItem[] = [
  { to: 'profile', label: 'Profile', icon: UserRound },
  { to: 'team', label: 'Team', icon: Users, adminOnly: true },
  { to: 'pipelines', label: 'Pipelines', icon: KanbanSquare, adminOnly: true },
  { to: 'general', label: 'General', icon: SlidersHorizontal, adminOnly: true },
  { to: 'instagram', label: 'Instagram', icon: Instagram, adminOnly: true },
  { to: 'auto-reply', label: 'Auto-reply', icon: Bot },
];

export default function SettingsLayout() {
  const { isAdmin } = useSession();
  const visible = items.filter((i) => !i.adminOnly || isAdmin);

  return (
    <>
      <PageHeader
        title="Settings"
        description={
          isAdmin
            ? 'Your profile, your team and how LeadOS works for your company.'
            : 'Your profile, your password and how auto-reply is set up.'
        }
      />
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-4">
        <nav
          aria-label="Settings"
          className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0"
        >
          <ul className="flex gap-1 border-b border-border lg:flex-col lg:border-b-0">
            {visible.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex h-10 items-center gap-2 px-3 type-body font-medium whitespace-nowrap transition-colors',
                      '-mb-px border-b-2 lg:mb-0 lg:h-9 lg:rounded-md lg:border-b-0',
                      isActive
                        ? 'border-primary text-fg lg:bg-primary-subtle lg:text-primary-subtle-fg'
                        : 'border-transparent text-fg-muted hover:text-fg lg:hover:bg-muted',
                    )
                  }
                >
                  <item.icon aria-hidden className="size-4" />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </>
  );
}
