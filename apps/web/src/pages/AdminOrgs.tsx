import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Badge, StatCard, Loading, Empty } from '../components/ui';
import { useAuth } from '../lib/auth';

interface OrgRow {
  id: string; name: string; slug: string; status: string; createdAt: string;
  counts: { members: number; leads: number; contacts: number; deals: number; conversations: number; messages: number; tasks: number };
}
interface Metrics {
  totalOrganizations: number; activeOrganizations: number; suspendedOrganizations: number;
  totalUsers: number; totalLeads: number; totalDeals: number; totalMessages: number; totalTasks: number; totalConversations: number;
}
interface UserRow { id: string; name: string; email: string; isSuperAdmin: boolean; twoFactorEnabled: boolean; organizations: number; createdAt: string }
interface ActivityRow { id: string; action: string; actorEmail?: string | null; organization: string; entityType?: string | null; createdAt: string }

type Tab = 'overview' | 'orgs' | 'users' | 'activity';

export default function AdminPanel() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ organizations: any[]; users: any[] } | null>(null);

  async function search(term: string) {
    setQ(term);
    if (!term.trim()) { setResults(null); return; }
    try { setResults(await api.get(`/api/v1/admin/search?q=${encodeURIComponent(term)}`, false)); }
    catch { setResults(null); }
  }
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  async function loadOverview() {
    const [m, list] = await Promise.all([
      api.get<Metrics>('/api/v1/admin/metrics', false),
      api.get<{ organizations: OrgRow[] }>('/api/v1/admin/organizations?pageSize=100', false),
    ]);
    setMetrics(m); setOrgs(list.organizations);
  }
  async function loadUsers() { setUsers((await api.get<{ users: UserRow[] }>('/api/v1/admin/users?pageSize=100', false)).users); }
  async function loadActivity() { setActivity(await api.get<ActivityRow[]>('/api/v1/admin/activity', false)); }

  async function loadAll() {
    setLoading(true); setErr('');
    try { await Promise.all([loadOverview(), loadUsers(), loadActivity()]); }
    catch (e: any) { setErr(e.message); }
    setLoading(false);
  }
  useEffect(() => { loadAll(); }, []);

  async function toggleStatus(o: OrgRow) {
    const status = o.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    await api.patch(`/api/v1/admin/organizations/${o.id}/status`, { status }, false);
    loadOverview();
  }
  async function toggleSuperAdmin(u: UserRow) {
    if (!confirm(`${u.isSuperAdmin ? 'Revoke' : 'Grant'} Super Admin for ${u.email}?`)) return;
    try { await api.patch(`/api/v1/admin/users/${u.id}/super-admin`, { isSuperAdmin: !u.isSuperAdmin }, false); loadUsers(); }
    catch (e: any) { alert(e.message); }
  }

  if (err) return <Empty text={err} />;

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'orgs', label: 'Organizations' },
    { key: 'users', label: 'Users' },
    { key: 'activity', label: 'Activity' },
  ];

  return (
    <div>
      <div className="h1">🛡️ Super Admin</div>
      <p className="subtle" style={{ marginTop: 0 }}>Platform control panel. Aggregate, non-secret data only — no impersonation (BRD §20).</p>

      <div style={{ position: 'relative', maxWidth: 480, marginTop: 12 }}>
        <input
          className="input"
          placeholder="🔎 Search organizations & users across the platform…"
          value={q}
          onChange={(e) => search(e.target.value)}
        />
        {results && (results.organizations.length > 0 || results.users.length > 0) && (
          <div className="card" style={{ position: 'absolute', top: 44, left: 0, right: 0, zIndex: 20, padding: 0, maxHeight: 340, overflowY: 'auto' }}>
            {results.organizations.length > 0 && <div className="subtle" style={{ padding: '8px 12px', fontSize: 12, fontWeight: 700 }}>ORGANIZATIONS</div>}
            {results.organizations.map((o) => (
              <div key={o.id} onClick={() => { setResults(null); setQ(''); navigate(`/admin/organizations/${o.id}`); }}
                style={{ padding: '8px 12px', cursor: 'pointer', borderTop: '1px solid var(--border)' }}>
                🏢 <strong>{o.name}</strong> <span className="subtle">· {o.slug}</span> <Badge value={o.status} />
              </div>
            ))}
            {results.users.length > 0 && <div className="subtle" style={{ padding: '8px 12px', fontSize: 12, fontWeight: 700 }}>USERS</div>}
            {results.users.map((u) => (
              <div key={u.id} onClick={() => { setResults(null); setQ(''); setTab('users'); }}
                style={{ padding: '8px 12px', cursor: 'pointer', borderTop: '1px solid var(--border)' }}>
                👤 <strong>{u.name || u.email}</strong> <span className="subtle">· {u.email}</span>{u.isSuperAdmin && <span className="badge gray" style={{ marginLeft: 6 }}>super</span>}
              </div>
            ))}
          </div>
        )}
        {results && results.organizations.length === 0 && results.users.length === 0 && (
          <div className="card card-pad" style={{ position: 'absolute', top: 44, left: 0, right: 0, zIndex: 20 }}>
            <span className="subtle">No matches for "{q}"</span>
          </div>
        )}
      </div>

      <div className="row" style={{ gap: 6, margin: '16px 0' }}>
        {TABS.map((t) => (
          <button key={t.key} className={`btn sm ${tab === t.key ? 'primary' : 'outline'}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {loading ? <Loading /> : (
        <>
          {tab === 'overview' && metrics && (
            <>
              <div className="grid grid-4">
                <StatCard label="Organizations" value={metrics.totalOrganizations} />
                <StatCard label="Active" value={metrics.activeOrganizations} />
                <StatCard label="Suspended" value={metrics.suspendedOrganizations} />
                <StatCard label="Total Users" value={metrics.totalUsers} />
              </div>
              <div className="grid grid-4 mt16">
                <StatCard label="Total Leads" value={metrics.totalLeads} />
                <StatCard label="Total Deals" value={metrics.totalDeals} />
                <StatCard label="Total Tasks" value={metrics.totalTasks} />
                <StatCard label="Messages" value={metrics.totalMessages} />
              </div>
            </>
          )}

          {tab === 'orgs' && (
            <div className="card card-pad">
              {orgs.length === 0 ? <Empty text="No organizations." /> : (
                <table className="table">
                  <thead><tr><th>Organization</th><th>Status</th><th>Members</th><th>Leads</th><th>Deals</th><th>Messages</th><th></th></tr></thead>
                  <tbody>
                    {orgs.map((o) => (
                      <tr key={o.id}>
                        <td><Link to={`/admin/organizations/${o.id}`} style={{ color: 'var(--primary)', fontWeight: 600 }}>{o.name}</Link><div className="subtle" style={{ fontSize: 12 }}>{o.slug}</div></td>
                        <td><Badge value={o.status} /></td>
                        <td>{o.counts.members}</td>
                        <td>{o.counts.leads}</td>
                        <td>{o.counts.deals}</td>
                        <td>{o.counts.messages}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn sm outline" onClick={() => toggleStatus(o)}>{o.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'users' && (
            <div className="card card-pad">
              {users.length === 0 ? <Empty text="No users." /> : (
                <table className="table">
                  <thead><tr><th>Name</th><th>Email</th><th>Orgs</th><th>2FA</th><th>Super Admin</th><th></th></tr></thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td><strong>{u.name || '—'}</strong></td>
                        <td className="subtle">{u.email}</td>
                        <td>{u.organizations}</td>
                        <td>{u.twoFactorEnabled ? '🔒' : '—'}</td>
                        <td>{u.isSuperAdmin ? <Badge value="active" /> : '—'}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn sm outline" disabled={u.id === user?.id && u.isSuperAdmin} onClick={() => toggleSuperAdmin(u)}>
                            {u.isSuperAdmin ? 'Revoke admin' : 'Make admin'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'activity' && (
            <div className="card card-pad">
              {activity.length === 0 ? <Empty text="No recent activity." /> : (
                <table className="table">
                  <thead><tr><th>When</th><th>Action</th><th>Actor</th><th>Org</th></tr></thead>
                  <tbody>
                    {activity.map((a) => (
                      <tr key={a.id}>
                        <td className="subtle" style={{ whiteSpace: 'nowrap' }}>{new Date(a.createdAt).toLocaleString()}</td>
                        <td><Badge value={a.action.replace(/_/g, ' ')} /></td>
                        <td className="subtle">{a.actorEmail || 'system'}</td>
                        <td className="subtle">{a.organization}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
