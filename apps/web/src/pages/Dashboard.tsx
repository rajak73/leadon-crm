import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  MessageCircle, AtSign, Target, Timer, Inbox as InboxIcon, Zap, Camera, Activity,
} from 'lucide-react';
import { api } from '../lib/api';
import { StatCard, Card, Badge, Empty, EmptyState, Skeleton, SkeletonRows } from '../components/ui';

interface DashboardData {
  connection: { connected: boolean; displayName?: string | null; webhookSubscribed?: boolean; tokenExpiresAt?: string | null };
  counts: { todayMessages: number; todayComments: number; todayLeads: number; pendingReplies: number; unreadConversations: number; automationTriggerCount: number };
  avgResponseMinutes: number | null;
  recentConversations: Array<{ id: string; channel: string; type: string; customerName?: string | null; lastMessage?: { body: string } | null; updatedAt: string }>;
  webhookHealth: { lastEventAt: string | null; lastEventStatus: string | null; failedCount: number };
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get<DashboardData>('/api/v1/dashboard').then(setData).catch((e) => setErr(e.message));
  }, []);

  if (err) return <Empty text={err} />;

  if (!data) {
    return (
      <div>
        <div className="text-display">Dashboard</div>
        <p className="subtle" style={{ marginTop: 4 }}>Your Instagram inbox at a glance.</p>
        <div className="grid grid-4 mt24">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card card-pad stat">
              <Skeleton width="50%" height={11} />
              <Skeleton width="40%" height={26} style={{ marginTop: 10 }} />
            </div>
          ))}
        </div>
        <div className="grid grid-2 mt16">
          <Card title="Recent conversations"><SkeletonRows rows={4} /></Card>
          <Card title="Webhook / API health"><SkeletonRows rows={2} /></Card>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="text-display">Dashboard</div>
          <p className="subtle" style={{ marginTop: 4 }}>Your Instagram inbox at a glance.</p>
        </div>
      </div>

      <div className="mt24">
        <div className={`card card-pad row between ${data.connection.connected ? 'ig-status-ok' : ''}`}>
          {data.connection.connected ? (
            <>
              <div className="row" style={{ gap: 12 }}>
                <div className="ig-status-ic"><Camera size={18} /></div>
                <div>
                  <div className="text-title">Connected as @{data.connection.displayName}</div>
                  <div className="text-small mt8" style={{ marginTop: 2 }}>
                    Webhook {data.connection.webhookSubscribed ? 'subscribed' : 'not subscribed'}
                    {data.connection.tokenExpiresAt && ` · Token expires ${new Date(data.connection.tokenExpiresAt).toLocaleDateString()}`}
                  </div>
                </div>
              </div>
              <Badge value="active" />
            </>
          ) : (
            <>
              <div className="row" style={{ gap: 12 }}>
                <div className="ig-status-ic"><Camera size={18} /></div>
                <span className="text-title">No Instagram account connected yet</span>
              </div>
              <Link className="btn primary sm" to="/app/integrations">Connect Instagram</Link>
            </>
          )}
        </div>
      </div>

      <div className="text-overline mt24" style={{ marginBottom: 10 }}>Today</div>
      <div className="grid grid-4">
        <StatCard icon={MessageCircle} label="Messages" value={data.counts.todayMessages} />
        <StatCard icon={AtSign} label="Comments" value={data.counts.todayComments} />
        <StatCard icon={Target} label="New leads" value={data.counts.todayLeads} />
        <StatCard icon={Timer} label="Avg. response time" value={data.avgResponseMinutes !== null ? `${data.avgResponseMinutes}m` : '—'} />
      </div>

      <div className="text-overline mt24" style={{ marginBottom: 10 }}>Needs attention</div>
      <div className="grid grid-3">
        <StatCard icon={InboxIcon} label="Pending replies" value={data.counts.pendingReplies} />
        <StatCard icon={MessageCircle} label="Unread conversations" value={data.counts.unreadConversations} />
        <StatCard icon={Zap} label="Automation triggers today" value={data.counts.automationTriggerCount} />
      </div>

      <div className="grid grid-2 mt24">
        <Card title="Recent conversations" action={<Link className="btn sm outline" to="/app/inbox">Open Inbox</Link>}>
          {data.recentConversations.length === 0 ? (
            <EmptyState
              icon={InboxIcon}
              title="No conversations yet"
              description="Once someone DMs or comments on your connected Instagram account, it'll show up here."
              action={<Link className="btn primary sm" to="/app/integrations">Check connection</Link>}
            />
          ) : (
            <table className="table">
              <tbody>
                {data.recentConversations.map((c) => (
                  <tr key={c.id}>
                    <td style={{ width: 90 }}><Badge value={c.type} /></td>
                    <td>{c.customerName || 'Unknown'}</td>
                    <td className="subtle" style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.lastMessage?.body || '—'}
                    </td>
                    <td className="subtle" style={{ textAlign: 'right', width: 140 }}>{new Date(c.updatedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Webhook / API health" action={<Activity size={16} style={{ color: 'var(--muted)' }} />}>
          <div className="hint">
            Last event: {data.webhookHealth.lastEventAt ? new Date(data.webhookHealth.lastEventAt).toLocaleString() : 'none yet'}
            {data.webhookHealth.lastEventStatus && ` (${data.webhookHealth.lastEventStatus})`}
          </div>
          <div className="hint mt8">Failed events: {data.webhookHealth.failedCount}</div>
        </Card>
      </div>
    </div>
  );
}
