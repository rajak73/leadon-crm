import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { StatCard, Card, Badge, Loading, Empty } from '../components/ui';

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
  if (!data) return <Loading />;

  return (
    <div>
      <div className="h1">Dashboard</div>
      <p className="subtle" style={{ marginTop: 0 }}>Your Instagram inbox at a glance.</p>

      <div className="mt16">
        <Card title="Instagram connection">
          {data.connection.connected ? (
            <div className="row between">
              <div>
                <Badge value="active" /> Connected as <strong>@{data.connection.displayName}</strong>
                <div className="hint mt8">
                  Webhook: {data.connection.webhookSubscribed ? 'subscribed' : 'not subscribed'}
                  {data.connection.tokenExpiresAt && ` · Token expires ${new Date(data.connection.tokenExpiresAt).toLocaleDateString()}`}
                </div>
              </div>
            </div>
          ) : (
            <div className="row between">
              <span>No Instagram account connected yet.</span>
              <Link className="btn primary sm" to="/app/integrations">Connect Instagram</Link>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-4 mt16">
        <StatCard label="Today's messages" value={data.counts.todayMessages} />
        <StatCard label="Today's comments" value={data.counts.todayComments} />
        <StatCard label="Today's leads" value={data.counts.todayLeads} />
        <StatCard label="Avg. response time" value={data.avgResponseMinutes !== null ? `${data.avgResponseMinutes}m` : '—'} />
      </div>
      <div className="grid grid-3 mt16">
        <StatCard label="Pending replies" value={data.counts.pendingReplies} />
        <StatCard label="Unread conversations" value={data.counts.unreadConversations} />
        <StatCard label="Automation triggers today" value={data.counts.automationTriggerCount} />
      </div>

      <div className="grid grid-2 mt16">
        <Card title="Recent conversations">
          {data.recentConversations.length === 0 ? (
            <Empty text="No conversations yet." />
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

        <Card title="Webhook / API health">
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
