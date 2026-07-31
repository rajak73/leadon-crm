import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { api } from '../lib/api';
import { Card, Badge, EmptyState, Skeleton, SkeletonRows, Modal } from '../components/ui';
import { useAuth } from '../lib/auth';

interface Rule { id: string; name: string; delayHours: number; template: string; isActive: boolean; createdAt: string; }
interface Execution { id: string; status: string; detail?: string | null; createdAt: string; conversation: { customerName?: string | null; externalId?: string | null } }

export default function FollowUps() {
  const { currentOrg } = useAuth();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [logFor, setLogFor] = useState<Rule | null>(null);
  const canManage = currentOrg?.role === 'OWNER' || currentOrg?.role === 'ADMIN';

  async function load() {
    setLoading(true);
    setRules(await api.get<Rule[]>('/api/v1/follow-ups'));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function toggle(rule: Rule) {
    await api.patch(`/api/v1/follow-ups/${rule.id}`, { isActive: !rule.isActive });
    load();
  }
  async function remove(rule: Rule) {
    await api.del(`/api/v1/follow-ups/${rule.id}`);
    load();
  }

  return (
    <div>
      <div className="row between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="text-display">Follow-up Sequences</div>
          <p className="subtle" style={{ marginTop: 4 }}>
            Automatically message a lead if they haven't replied within a set number of hours.
          </p>
        </div>
        {canManage && <button className="btn primary" onClick={() => setShowNew(true)}>+ New rule</button>}
      </div>

      <div className="mt16">
        <Card title="Rules">
          {loading ? (
            <table className="table">
              <tbody>
                {Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    <td><Skeleton width="50%" height={13} /></td>
                    <td><Skeleton width="40%" height={13} /></td>
                    <td><Skeleton width="70%" height={13} /></td>
                    <td><Skeleton width={60} height={20} radius={999} /></td>
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
          ) : rules.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="No follow-up rules yet"
              description="Create a rule to automatically re-engage a lead who hasn't replied within a set number of hours."
              action={canManage ? <button className="btn primary sm" onClick={() => setShowNew(true)}>+ New rule</button> : undefined}
            />
          ) : (
            <table className="table">
              <thead><tr><th>Name</th><th>Delay</th><th>Template</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td className="subtle">{r.delayHours}h no reply</td>
                    <td className="subtle" style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.template}</td>
                    <td><Badge value={r.isActive ? 'active' : 'gray'} /></td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn sm outline" onClick={() => setLogFor(r)}>Log</button>{' '}
                      {canManage && <button className="btn sm outline" onClick={() => toggle(r)}>{r.isActive ? 'Disable' : 'Enable'}</button>}{' '}
                      {canManage && <button className="btn sm outline" onClick={() => remove(r)}>Delete</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {showNew && <RuleForm onClose={() => setShowNew(false)} onDone={() => { setShowNew(false); load(); }} />}
      {logFor && <ExecutionLog rule={logFor} onClose={() => setLogFor(null)} />}
    </div>
  );
}

function RuleForm({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ name: '', delayHours: 24, template: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try { await api.post('/api/v1/follow-ups', form); onDone(); }
    catch (e: any) { setErr(e.message); setBusy(false); }
  }

  return (
    <Modal title="New follow-up rule" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field"><label>Name</label>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="field"><label>Send after (hours of no reply)</label>
          <input className="input" type="number" min={1} max={720} value={form.delayHours}
            onChange={(e) => setForm({ ...form, delayHours: Number(e.target.value) })} required />
        </div>
        <div className="field"><label>Message template</label>
          <textarea className="input" rows={4} value={form.template}
            onChange={(e) => setForm({ ...form, template: e.target.value })} required />
        </div>
        {err && <div className="error">{err}</div>}
        <button className="btn primary block mt8" disabled={busy || !form.name.trim() || !form.template.trim()}>
          {busy ? 'Saving…' : 'Create rule'}
        </button>
      </form>
    </Modal>
  );
}

function ExecutionLog({ rule, onClose }: { rule: Rule; onClose: () => void }) {
  const [executions, setExecutions] = useState<Execution[] | null>(null);
  useEffect(() => {
    api.get<Execution[]>(`/api/v1/follow-ups/${rule.id}/executions`).then(setExecutions);
  }, [rule.id]);

  return (
    <Modal title={`Execution log — ${rule.name}`} onClose={onClose}>
      {!executions ? <SkeletonRows rows={3} /> : executions.length === 0 ? (
        <EmptyState icon={Clock} title="No executions yet" description="This rule hasn't fired for any lead yet." />
      ) : (
        <table className="table">
          <tbody>
            {executions.map((e) => (
              <tr key={e.id}>
                <td><Badge value={e.status} /></td>
                <td>{e.conversation.customerName || e.conversation.externalId || 'Unknown'}</td>
                <td className="subtle" style={{ fontSize: 12 }}>{new Date(e.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
