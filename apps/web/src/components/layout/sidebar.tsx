import { NavLink, useMatch, useResolvedPath } from 'react-router';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Tooltip } from '@/components/ui/tooltip';
import { useSettings } from '@/api/account';
import { useInboxCounts } from '@/api/instagram';
import { mainNav, settingsNav, type NavItem } from './nav-items';

export function BrandMark({ collapsed }: { collapsed?: boolean }) {
  const { data: settings } = useSettings();
  return (
    <div className={cn('flex h-14 items-center gap-2.5', collapsed ? 'justify-center' : 'px-3')}>
      <span
        aria-hidden
        className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent type-small font-bold text-accent-fg"
      >
        L
      </span>
      {!collapsed && (
        <span className="min-w-0">
          <span className="block truncate type-body font-semibold text-fg">
            {settings?.companyName || 'LeadOS'}
          </span>
        </span>
      )}
    </div>
  );
}

/** Conversations that are unread or waiting for a person; 0 while loading or on error. */
function useInboxBadge(): number {
  const { data } = useInboxCounts();
  return data ? data.unreadConversations + data.needsAttention : 0;
}

function NavEntry({
  item,
  collapsed,
  onNavigate,
  count = 0,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
  count?: number;
}) {
  const countText = count > 99 ? '99+' : String(count);
  // Resolve "active" here and pass a plain string className: the collapsed tooltip wraps the
  // link in a Radix Slot, which can't merge NavLink's className-function.
  const isActive = useMatch({ path: useResolvedPath(item.to).pathname, end: item.end ?? false });
  const link = (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      aria-label={
        collapsed || count > 0
          ? `${item.label}${count > 0 ? `, ${countText} need${count === 1 ? 's' : ''} you` : ''}`
          : undefined
      }
      className={cn(
        'flex items-center rounded-md type-body font-medium transition-colors',
        collapsed ? 'mx-auto size-10 justify-center' : 'h-9 gap-3 px-2.5',
        isActive
          ? 'bg-surface text-fg shadow-sm ring-1 ring-border'
          : 'text-fg-muted hover:bg-muted hover:text-fg',
      )}
    >
      <span className="relative flex">
        <item.icon aria-hidden className="size-4 shrink-0" />
        {collapsed && count > 0 && (
          <span
            aria-hidden
            className="absolute -top-1 -right-1.5 size-2 rounded-full bg-accent ring-2 ring-background"
          />
        )}
      </span>
      {!collapsed && <span className="truncate">{item.label}</span>}
      {!collapsed && count > 0 && (
        <span
          aria-hidden
          className="ml-auto rounded-full bg-accent px-1.5 type-caption font-semibold text-accent-fg tabular-nums"
        >
          {countText}
        </span>
      )}
    </NavLink>
  );
  return collapsed ? (
    <Tooltip content={item.label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
}

interface SidebarNavProps {
  collapsed?: boolean;
  onNavigate?: () => void;
}

/** Navigation list shared by the desktop sidebar and the mobile drawer. NavLink sets aria-current. */
export function SidebarNav({ collapsed = false, onNavigate }: SidebarNavProps) {
  const inboxCount = useInboxBadge();
  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 px-2 py-2">
      {mainNav.map((item) => (
        <NavEntry
          key={item.to}
          item={item}
          collapsed={collapsed}
          onNavigate={onNavigate}
          count={item.badge === 'inbox' ? inboxCount : 0}
        />
      ))}
      <div className="mt-auto pt-2">
        <NavEntry item={settingsNav} collapsed={collapsed} onNavigate={onNavigate} />
      </div>
    </nav>
  );
}

export function DesktopSidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <aside
      className={cn(
        'relative z-20 hidden h-full shrink-0 flex-col border-r border-border/70 bg-background/80 backdrop-blur-md transition-[width] duration-200 md:flex',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <BrandMark collapsed={collapsed} />
      <SidebarNav collapsed={collapsed} />
      <div className={cn('border-t border-border p-2', collapsed && 'flex justify-center')}>
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          className={cn(
            'flex h-9 items-center gap-3 rounded-md px-2.5 type-small text-fg-muted hover:bg-muted hover:text-fg',
            collapsed ? 'w-9 justify-center px-0' : 'w-full',
          )}
        >
          {collapsed ? (
            <PanelLeftOpen aria-hidden className="size-4" />
          ) : (
            <PanelLeftClose aria-hidden className="size-4" />
          )}
          {!collapsed && 'Collapse'}
        </button>
      </div>
    </aside>
  );
}
