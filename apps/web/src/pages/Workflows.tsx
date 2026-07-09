import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Card, Badge, Loading, Empty, Modal } from '../components/ui';
import { useAuth } from '../lib/auth';
import { LEAD_STATUSES } from '@leados/shared';

interface Workflow {
  id: string; name: string; isActive: boolean;
  definition: { trigger: { event: string; status?: string }; action: { type: string; taskTitle?: string; taskPriority?: string; score?: number } } | null;
}

export default function Workflows() {
  const { currentOrg } = useAuth();
  const [items, setItems] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const canManage = currentOrg?.role === 'OWNER' || currentOrg?.role === 'ADMIN';

  async function load() {
    setLoading(true);
    setItems(await api.get<Workflow[]>('/api/v1/workflows'));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function toggle(w: Workflow) {
    await api.patch(`/api/v1/workflows/${w.id}`, { isActive: !w.isActive });
    load();
  }
  async function remove(id: string) {
    await api.del(`/api/v1/workflows/${id}`);
    load();
  }

  return (
    <div>
      <div className="row between">
        <div>
          <div className="h1">Workflows</div>
          <p className="subtle" style={{ marginTop: 0 }}>Automate follow-ups with trigger → action rules.</p>
        </div>
        {canManage && <button className="btn primary" onClick={() => setShowNew(true)}>+ New Workflow</button>}
      </div>

      <div className="card card-pad mt16">
        {loading ? <Loading /> : items.length === 0 ? <Empty text="No workflows yet. Create one to auto-create tasks when a lead changes stage." /> : (
          <table className="table">
            <thead><tr><th>Name</th><th>When</th><th>Then</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {items.map((w) => (
                <tr key={w.id}>
                  <td><strong>{w.name}</strong></td>
                  <td className="subtle">{w.definition?.trigger.event.replace(/_/g, ' ')}{w.definition?.trigger.status ? ` = ${w.definition.trigger.status}` : ''}</td>
                  <td className="subtle">{w.definition?.action.type.replace(/_/g, ' ')}{w.definition?.action.taskTitle ? `: ${w.definition.action.taskTitle}` : ''}</td>
                  <td><Badge value={w.isActive ? 'active' : 'gray'} /></td>
                  <td style={{ textAlign: 'right' }}>
                    {canManage && (
                      <>
                        <button className="btn sm outline" onClick={() => toggle(w)}>{w.isActive ? 'Pause' : 'Activate'}</button>{' '}
                        <button className="btn sm outline" onClick={() => remove(w.id)}>Delete</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNew && <NewWorkflow onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} />}
    </div>
  );
}

function NewWorkflow({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [status, setStatus] = useState('QUALIFIED');
  const [taskTitle, setTaskTitle] = useState('Follow up with qualified lead');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      await api.post('/api/v1/workflows', {
        name,
        isActive: true,
        definition: {
          trigger: { event: 'LEAD_STATUS_CHANGED', status },
          action: { type: 'CREATE_TASK', taskTitle, taskPriority: 'HIGH' },
        },
      });
      onCreated();
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  return (
    <Modal title="New Workflow" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field"><label>Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Auto-task on qualify" /></div>
        <div className="field"><label>When a lead reaches status</label>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div className="field"><label>Then create a task titled</label><input className="input" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} required /></div>
        {err && <div className="error">{err}</div>}
        <button className="btn primary block mt8" disabled={busy}>{busy ? 'Saving…' : 'Create Workflow'}</button>
      </form>
    </Modal>
  );
}
