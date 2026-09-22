import { Link } from 'react-router';
import { Bell } from 'lucide-react';
import { useUnreadCount } from '@/api/notifications';
import { buttonClasses } from '@/components/ui/button';
import { cn } from '@/lib/cn';

export function NotificationsBell() {
  const { data: count = 0 } = useUnreadCount();
  const label = count > 0 ? `Notifications, ${count} unread` : 'Notifications';
  return (
    <Link
      to="/notifications"
      aria-label={label}
      className={cn(buttonClasses({ variant: 'ghost', iconOnly: true }), 'relative')}
    >
      <Bell aria-hidden />
      {count > 0 && (
        <span
          aria-hidden
          className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white tabular-nums"
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}
