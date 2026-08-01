import { useEffect, useState } from 'react';
import { Clock, Plus, Trash2, ArrowRight } from 'lucide-react';
import { api } from '../lib/api';
import { Card, Badge, EmptyState, Skeleton, SkeletonRows, Modal } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';

interface Step { id?: string; stepOrder?: number; delayHours: number; template: string; }
interface Rule { id: string; name: string; isActive: boolean; createdAt: string; steps: Step[]; }
interface Execution {
  id: string; status: string; detail?: string | null; createdAt: string;
  step?: { stepOrder: number } | null;
  conversation: { customerName?: string | null; externalId?: string | null };
}

function fmtHours(h: number): string {
  if (h % 24 === 0 && h >= 24) return `${h / 24}d`;
  return `${h}h`;
}

export default function FollowUps() {
  const { currentOrg } = useAuth();
  const toast = useToast();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);
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
    if (!confirm(`Delete "${rule.name}"? This also deletes its execution history.`)) return;
    await api.del(`/api/v1/follow-ups/${rule.id}`);
    toast.success('Sequence deleted.');
    load();
  }

  return (
    <div>
      <div className="row between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="text-display">Follow-up Sequences</div>
          <p className="subtle" style={{ marginTop: 4 }}>
            Automatically re-engage a lead with a chain of messages if they go quiet — each step only
            fires if the one before it still got no reply.
          </p>
        </div>
        {canManage && <button className="btn primary" onClick={() => setShowNew(true)}>+ New sequence</button>}
      </div>

      <div className="mt16">
        <Card title="Sequences">
          {loading ? (
            <table className="table">
              <tbody>
                {Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    <td><Skeleton width="50%" height={13} /></td>
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
              title="No follow-up sequences yet"
              description="Create one to automatically re-engage a lead who hasn't replied — e.g. check in after 24h, then again after 48h if still quiet."
              action={canManage ? <button className="btn primary sm" onClick={() => setShowNew(true)}>+ New sequence</button> : undefined}
            />
          ) : (
            <table className="table">
              <thead><tr><th>Name</th><th>Steps</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td className="text-title">{r.name}</td>
                    <td>
                      <div className="row" style={{ gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                        {r.steps.map((s, i) => (
                          <span key={i} className="row" style={{ gap: 4 }}>
                            {i > 0 && <ArrowRight size={12} style={{ color: 'var(--muted)' }} />}
                            <span className="badge gray">{fmtHours(s.delayHours)}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td><Badge value={r.isActive ? 'active' : 'gray'} /></td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn sm outline" onClick={() => setLogFor(r)}>Log</button>{' '}
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

      {showNew && <SequenceForm onClose={() => setShowNew(false)} onDone={() => { setShowNew(false); load(); }} />}
      {editing && <SequenceForm rule={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} />}
      {logFor && <ExecutionLog rule={logFor} onClose={() => setLogFor(null)} />}
    </div>
  );
}

const EMPTY_STEP: Step = { delayHours: 24, template: '' };

function SequenceForm({ rule, onClose, onDone }: { rule?: Rule; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(rule?.name ?? '');
  const [steps, setSteps] = useState<Step[]>(rule?.steps.length ? rule.steps.map((s) => ({ delayHours: s.delayHours, template: s.template })) : [{ ...EMPTY_STEP }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  function updateStep(i: number, patch: Partial<Step>) {
    setSteps((list) => list.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function addStep() {
    if (steps.length >= 5) return;
    setSteps((list) => [...list, { ...EMPTY_STEP }]);
  }
  function removeStep(i: number) {
    setSteps((list) => list.filter((_, idx) => idx !== i));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || steps.some((s) => !s.template.trim())) return;
    setBusy(true); setErr('');
    try {
      const payload = { name, isActive: rule?.isActive ?? true, steps: steps.map((s) => ({ delayHours: s.delayHours, template: s.template })) };
      if (rule) await api.patch(`/api/v1/follow-ups/${rule.id}`, payload);
      else await api.post('/api/v1/follow-ups', payload);
      toast.success(rule ? 'Sequence updated.' : 'Sequence created.');
      onDone();
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  return (
    <Modal title={rule ? 'Edit sequence' : 'New follow-up sequence'} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field"><label>Sequence name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Re-engage cold leads" required />
        </div>

        {steps.map((step, i) => (
          <div key={i} className="card card-pad mt16" style={{ background: 'var(--bg)' }}>
            <div className="row between" style={{ marginBottom: 10 }}>
              <span className="text-overline">Step {i + 1}</span>
              {steps.length > 1 && (
                <button type="button" className="btn sm" onClick={() => removeStep(i)} aria-label={`Remove step ${i + 1}`}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>
            <div className="field">
              <label>{i === 0 ? 'Send after (hours of no reply)' : `Send after (hours since step ${i} fired, if still no reply)`}</label>
              <input className="input" type="number" min={1} max={720} value={step.delayHours}
                onChange={(e) => updateStep(i, { delayHours: Number(e.target.value) })} required />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Message</label>
              <textarea className="input" rows={3} value={step.template}
                onChange={(e) => updateStep(i, { template: e.target.value })} required />
            </div>
          </div>
        ))}

        {steps.length < 5 && (
          <button type="button" className="btn sm outline mt16" onClick={addStep}>
            <Plus size={14} /> Add another step
          </button>
        )}

        {err && <div className="error">{err}</div>}
        <button className="btn primary block mt16" disabled={busy || !name.trim() || steps.some((s) => !s.template.trim())}>
          {busy ? 'Saving…' : rule ? 'Save changes' : 'Create sequence'}
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
        <EmptyState icon={Clock} title="No executions yet" description="This sequence hasn't fired for any lead yet." />
      ) : (
        <table className="table">
          <tbody>
            {executions.map((e) => (
              <tr key={e.id}>
                <td><Badge value={e.status} /></td>
                {e.step && <td className="subtle">Step {e.step.stepOrder}</td>}
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
