import { useNavigate } from 'react-router';
import {
  AlarmClock,
  Briefcase,
  CheckSquare,
  Flame,
  Hand,
  Instagram,
  MessageCircle,
  MessageSquare,
  Sparkles,
  UserPlus,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import type { Notification, NotificationType } from '@leados/shared';
import { useMarkNotificationRead } from '@/api/notifications';
import { RelativeTime } from '@/components/domain/relative-time';
import { cn } from '@/lib/cn';
import { notificationTypeLabels } from '@/lib/labels';

const icons: Record<NotificationType, LucideIcon> = {
  LEAD_ASSIGNED: UserPlus,
  DEAL_ASSIGNED: Briefcase,
  TASK_ASSIGNED: CheckSquare,
  TASK_DUE: AlarmClock,
  LEAD_SCORED: Flame,
  WORKFLOW: Workflow,
  INSTAGRAM_MESSAGE: MessageCircle,
  INSTAGRAM_COMMENT: MessageSquare,
  AI_HANDOFF: Hand,
  AI_DRAFT_READY: Sparkles,
  INSTAGRAM_CONNECTION: Instagram,
};

function targetOf(n: Notification): string | null {
  switch (n.entityType) {
    case null:
      return null;
    case 'task':
      return '/tasks';
    case 'ig_comment':
      return '/inbox/comments';
    case 'instagram':
      return '/settings/instagram';
    case 'ig_conversation':
      return n.entityId ? `/inbox/${n.entityId}` : '/inbox';
  }
  if (!n.entityId) return null;
  const base = { lead: '/leads', contact: '/contacts', deal: '/deals' }[n.entityType];
  return `${base}/${n.entityId}`;
}

export function NotificationItem({ notification: n }: { notification: Notification }) {
  const navigate = useNavigate();
  const markRead = useMarkNotificationRead();
  const unread = !n.readAt;
  const Icon = icons[n.type];
  const target = targetOf(n);

  function open() {
    if (unread) markRead.mutate(n.id);
    if (target) void navigate(target);
  }

  return (
    <button
      type="button"
      onClick={open}
      className={cn(
        'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60',
        unread && 'bg-primary-subtle/40',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
          unread ? 'bg-primary-subtle text-primary-subtle-fg' : 'bg-muted text-fg-muted',
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          {unread && <span className="sr-only">Unread: </span>}
          <span className={cn('type-body text-fg', unread ? 'font-semibold' : 'font-medium')}>
            {n.title}
          </span>
          <span className="type-caption text-fg-subtle">{notificationTypeLabels[n.type]}</span>
        </span>
        {n.body && <span className="mt-0.5 block type-small text-fg-muted">{n.body}</span>}
        <RelativeTime date={n.createdAt} className="mt-1 block type-caption text-fg-subtle" />
      </span>
      {unread && <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-accent" />}
    </button>
  );
}
