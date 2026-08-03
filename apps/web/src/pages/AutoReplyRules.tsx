import { useEffect, useState } from 'react';
import { Bot } from 'lucide-react';
import { api } from '../lib/api';
import { Card, Badge, EmptyState, Skeleton, Modal } from '../components/ui';
import { useAuth } from '../lib/auth';

interface Rule {
  id: string; name: string; keyword: string; matchType: string; caseInsensitive: boolean;
  action: string; replyTemplate?: string | null; priority: number; isActive: boolean;
}

const MATCH_TYPES = ['CONTAINS', 'STARTS_WITH', 'ENDS_WITH', 'EXACT'];

export default function AutoReplyRules() {
  const { currentOrg } = useAuth();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);
  const canManage = currentOrg?.role === 'OWNER' || currentOrg?.role === 'ADMIN';

  async function load() {
    setLoading(true);
    setRules(await api.get<Rule[]>('/api/v1/auto-reply-rules'));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function toggle(rule: Rule) {
    await api.patch(`/api/v1/auto-reply-rules/${rule.id}`, { isActive: !rule.isActive });
    load();
  }
  async function remove(rule: Rule) {
    await api.del(`/api/v1/auto-reply-rules/${rule.id}`);
    load();
  }

  return (
    <div>
      <div className="row between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="text-display">Auto Reply Rules</div>
          <p className="subtle" style={{ marginTop: 4 }}>
            Keyword rules for inbound DMs and comments — e.g. "contains price" → send pricing info, or assign to a human.
          </p>
        </div>
        {canManage && <button className="btn primary" onClick={() => setShowNew(true)}>+ New rule</button>}
      </div>

      <div className="mt16">
        <Card title="Rules (evaluated in priority order, lowest first)">
          {loading ? (
            <table className="table">
              <tbody>
                {Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    <td style={{ width: 60 }}><Skeleton width={20} height={13} /></td>
                    <td><Skeleton width="50%" height={13} /></td>
                    <td><Skeleton width="70%" height={13} /></td>
                    <td><Skeleton width="60%" height={13} /></td>
                    <td><Skeleton width={60} height={20} radius={999} /></td>
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
          ) : rules.length === 0 ? (
            <EmptyState
              icon={Bot}
              title="No auto-reply rules yet"
              description="Without a matching rule, every DM and comment still gets an AI-generated reply automatically — rules just let you override that with an exact message for specific keywords."
              action={canManage ? <button className="btn primary sm" onClick={() => setShowNew(true)}>+ New rule</button> : undefined}
            />
          ) : (
            <table className="table">
              <thead><tr><th>Priority</th><th>Name</th><th>Match</th><th>Action</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td className="subtle">{r.priority}</td>
                    <td className="text-title">{r.name}</td>
                    <td className="subtle">{r.matchType} "{r.keyword}"{r.caseInsensitive ? '' : ' (case-sensitive)'}</td>
                    <td>{r.action === 'ASSIGN_HUMAN' ? 'Assign human' : `Reply: ${r.replyTemplate?.slice(0, 40)}`}</td>
                    <td><Badge value={r.isActive ? 'active' : 'gray'} /></td>
                    <td style={{ textAlign: 'right' }}>
                      {canManage && <button className="btn sm outline" onClick={() => setEditing(r)}>Edit</button>}{' '}
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
      {editing && <RuleForm rule={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function RuleForm({ rule, onClose, onDone }: { rule?: Rule; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    name: rule?.name ?? '', keyword: rule?.keyword ?? '', matchType: rule?.matchType ?? 'CONTAINS',
    caseInsensitive: rule?.caseInsensitive ?? true,
    action: rule?.action ?? 'REPLY', replyTemplate: rule?.replyTemplate ?? '', priority: rule?.priority ?? 0,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const body = {
        ...form,
        replyTemplate: form.action === 'REPLY' ? form.replyTemplate : undefined,
      };
      if (rule) {
        await api.patch(`/api/v1/auto-reply-rules/${rule.id}`, body);
      } else {
        await api.post('/api/v1/auto-reply-rules', body);
      }
      onDone();
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  return (
    <Modal title={rule ? 'Edit auto-reply rule' : 'New auto-reply rule'} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field"><label>Name</label>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="field"><label>Keyword</label>
          <input className="input" value={form.keyword} onChange={(e) => setForm({ ...form, keyword: e.target.value })} required />
        </div>
        <div className="field"><label>Match type</label>
          <select className="select" value={form.matchType} onChange={(e) => setForm({ ...form, matchType: e.target.value })}>
            {MATCH_TYPES.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
          </select>
        </div>
        <div className="field">
          <label><input type="checkbox" checked={form.caseInsensitive} onChange={(e) => setForm({ ...form, caseInsensitive: e.target.checked })} /> Case insensitive</label>
        </div>
        <div className="field"><label>Action</label>
          <select className="select" value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}>
            <option value="REPLY">Send reply</option>
            <option value="ASSIGN_HUMAN">Assign to human (no auto-reply)</option>
          </select>
        </div>
        {form.action === 'REPLY' && (
          <div className="field"><label>Reply message</label>
            <textarea className="input" rows={3} value={form.replyTemplate}
              onChange={(e) => setForm({ ...form, replyTemplate: e.target.value })} required />
          </div>
        )}
        <div className="field"><label>Priority (lower = evaluated first)</label>
          <input className="input" type="number" min={0} max={1000} value={form.priority}
            onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
        </div>
        {err && <div className="error">{err}</div>}
        <button className="btn primary block mt8" disabled={busy || !form.name.trim() || !form.keyword.trim()}>
          {busy ? 'Saving…' : rule ? 'Save changes' : 'Create rule'}
        </button>
      </form>
    </Modal>
  );
}
