import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Badge, Loading, Empty, Modal } from '../components/ui';
import { ORG_ROLES, ORG_ROLE_LABELS, type OrgRole } from '@leados/shared';
import { useAuth } from '../lib/auth';
import { TwoFactorSettings } from '../components/TwoFactorSettings';

interface Member { id: string; firstName: string; lastName: string; email: string; role: string; }

export default function Team() {
  const { currentOrg } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  const canManage = currentOrg?.role === 'OWNER' || currentOrg?.role === 'ADMIN';

  async function load() {
    setLoading(true);
    setMembers(await api.get<Member[]>('/api/v1/organizations/members'));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function changeRole(id: string, role: string) {
    await api.patch(`/api/v1/organizations/members/${id}`, { role });
    load();
  }

  return (
    <div>
      <div className="row between">
        <div>
          <div className="h1">Team</div>
          <p className="subtle" style={{ marginTop: 0 }}>Manage members and roles for this workspace.</p>
        </div>
        {canManage && <button className="btn primary" onClick={() => setShowNew(true)}>+ Add Member</button>}
      </div>

      <div className="card card-pad mt16">
        {loading ? <Loading /> : members.length === 0 ? <Empty text="No members." /> : (
          <table className="table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td><strong>{m.firstName} {m.lastName}</strong></td>
                  <td className="subtle">{m.email}</td>
                  <td>
                    {canManage && m.role !== 'OWNER' ? (
                      <select className="select" style={{ maxWidth: 220 }} value={m.role} onChange={(e) => changeRole(m.id, e.target.value)}>
                        {ORG_ROLES.map((r) => <option key={r} value={r}>{ORG_ROLE_LABELS[r as OrgRole]}</option>)}
                      </select>
                    ) : <Badge value={m.role} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt16">
        <div className="h2">My Security</div>
        <TwoFactorSettings />
      </div>

      {showNew && <NewMember onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} />}
    </div>
  );
}

function NewMember({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: 'LeadOS@123', role: 'SALES_AGENT' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try { await api.post('/api/v1/organizations/members', form); onCreated(); }
    catch (e: any) { setErr(e.message); setBusy(false); }
  }
  return (
    <Modal title="Add Team Member" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="field"><label>First name</label><input className="input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required /></div>
          <div className="field"><label>Last name</label><input className="input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required /></div>
        </div>
        <div className="field"><label>Email</label><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
        <div className="field"><label>Temp password</label><input className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
        <div className="field"><label>Role</label>
          <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ORG_ROLES.filter((r) => r !== 'OWNER').map((r) => <option key={r} value={r}>{ORG_ROLE_LABELS[r as OrgRole]}</option>)}
          </select>
        </div>
        {err && <div className="error">{err}</div>}
        <button className="btn primary block mt8" disabled={busy}>{busy ? 'Adding…' : 'Add Member'}</button>
      </form>
    </Modal>
  );
}
