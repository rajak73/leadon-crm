import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Card, StatCard, Badge, Loading, Empty } from '../components/ui';

interface OrgDetail {
  id: string; name: string; slug: string; status: string; createdAt: string; plan?: string | null;
  counts: { members: number; leads: number; contacts: number; deals: number; conversations: number; messages: number; tasks: number };
}
interface Member { userId: string; name: string; email: string; role: string; isSuperAdmin: boolean; joinedAt: string }
interface Activity { id: string; action: string; actorEmail?: string | null; entityType?: string | null; createdAt: string }

export default function AdminOrgDetail() {
  const { id } = useParams();
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [err, setErr] = useState('');

  async function load() {
    try {
      const [o, m, a] = await Promise.all([
        api.get<OrgDetail>(`/api/v1/admin/organizations/${id}`, false),
        api.get<Member[]>(`/api/v1/admin/organizations/${id}/members`, false),
        api.get<Activity[]>(`/api/v1/admin/organizations/${id}/activity`, false),
      ]);
      setOrg(o); setMembers(m); setActivity(a);
    } catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  async function toggleStatus() {
    if (!org) return;
    const status = org.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    await api.patch(`/api/v1/admin/organizations/${org.id}/status`, { status }, false);
    load();
  }

  if (err) return <Empty text={err} />;
  if (!org) return <Loading />;

  return (
    <div>
      <Link to="/admin" className="subtle">← Super Admin</Link>
      <div className="row between mt8">
        <div>
          <div className="h1" style={{ marginBottom: 2 }}>{org.name}</div>
          <div className="row" style={{ gap: 8 }}>
            <span className="subtle">{org.slug}</span>
            <Badge value={org.status} />
            {org.plan && <span className="badge gray">{org.plan}</span>}
          </div>
        </div>
        <button className="btn outline" onClick={toggleStatus}>{org.status === 'ACTIVE' ? 'Suspend org' : 'Reactivate org'}</button>
      </div>

      <div className="grid grid-4 mt16">
        <StatCard label="Members" value={org.counts.members} />
        <StatCard label="Leads" value={org.counts.leads} />
        <StatCard label="Deals" value={org.counts.deals} />
        <StatCard label="Tasks" value={org.counts.tasks} />
      </div>
      <div className="grid grid-4 mt16">
        <StatCard label="Contacts" value={org.counts.contacts} />
        <StatCard label="Conversations" value={org.counts.conversations} />
        <StatCard label="Messages" value={org.counts.messages} />
        <StatCard label="Created" value={new Date(org.createdAt).toLocaleDateString()} />
      </div>

      <div className="grid grid-2 mt16">
        <Card title={`Members (${members.length})`}>
          {members.length === 0 ? <Empty text="No members." /> : (
            <table className="table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.userId}>
                    <td><strong>{m.name || '—'}</strong>{m.isSuperAdmin && <span className="badge gray" style={{ marginLeft: 6 }}>super</span>}</td>
                    <td className="subtle">{m.email}</td>
                    <td><Badge value={m.role} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Recent Activity">
          {activity.length === 0 ? <Empty text="No recent activity." /> : activity.map((a) => (
            <div key={a.id} className="row" style={{ gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <Badge value={a.action.replace(/_/g, ' ')} />
              <div className="subtle" style={{ fontSize: 12 }}>{a.actorEmail || 'system'} · {new Date(a.createdAt).toLocaleString()}</div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
