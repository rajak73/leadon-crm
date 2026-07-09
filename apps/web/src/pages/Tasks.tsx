import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Badge, Loading, Empty, Modal } from '../components/ui';
import { TaskStatus, TaskPriority } from '@leados/shared';

interface Task { id: string; title: string; status: string; priority: string; dueDate?: string | null; assignedUser?: { firstName: string; lastName: string } | null; }

export default function Tasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [status, setStatus] = useState('');
  const [assignee, setAssignee] = useState('');
  const [members, setMembers] = useState<{ userId: string; firstName: string; lastName: string }[]>([]);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams({ pageSize: '100' });
    if (status) params.set('status', status);
    if (assignee === '__unassigned__') params.set('assignedUserId', 'none');
    else if (assignee) params.set('assignedUserId', assignee);
    const r = await api.get<{ tasks: Task[] }>(`/api/v1/tasks?${params}`);
    setTasks(r.tasks);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status, assignee]);
  useEffect(() => {
    const open = () => setShowNew(true);
    document.addEventListener('leados:new', open);
    api.get<{ userId: string; firstName: string; lastName: string }[]>('/api/v1/organizations/members').then(setMembers).catch(() => {});
    return () => document.removeEventListener('leados:new', open);
  }, []);

  async function toggle(t: Task) {
    const next = t.status === 'DONE' ? 'OPEN' : 'DONE';
    await api.patch(`/api/v1/tasks/${t.id}`, { status: next });
    load();
  }

  function myOpenTasks() {
    if (user) setAssignee(user.id);
    setStatus('OPEN');
  }

  return (
    <div>
      <div className="row between">
        <div>
          <div className="h1">Tasks & Follow-ups</div>
          <p className="subtle" style={{ marginTop: 0 }}>Never miss a follow-up.</p>
        </div>
        <button className="btn primary" onClick={() => setShowNew(true)}>+ New Task</button>
      </div>

      <div className="card card-pad mt16">
        <div className="row" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <button className="btn sm outline" onClick={myOpenTasks}>⭐ My open tasks</button>
          <select className="select sm" style={{ maxWidth: 170 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
            <option value="">All statuses</option>
            {Object.values(TaskStatus).map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
          <select className="select sm" style={{ maxWidth: 180 }} value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Assignee filter">
            <option value="">Assignee: all</option>
            {user && <option value={user.id}>My tasks</option>}
            <option value="__unassigned__">Unassigned</option>
            {members.filter((m) => m.userId !== user?.id).map((m) => <option key={m.userId} value={m.userId}>{m.firstName} {m.lastName}</option>)}
          </select>
          {(status || assignee) && <button className="btn sm" onClick={() => { setStatus(''); setAssignee(''); }}>Clear</button>}
        </div>

        {loading ? <Loading /> : tasks.length === 0 ? <Empty text="No tasks yet." /> : (
          <table className="table">
            <thead><tr><th></th><th>Title</th><th>Assignee</th><th>Priority</th><th>Due</th><th>Status</th></tr></thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td style={{ width: 30 }}>
                    <input type="checkbox" checked={t.status === 'DONE'} onChange={() => toggle(t)} />
                  </td>
                  <td style={{ textDecoration: t.status === 'DONE' ? 'line-through' : 'none' }}>{t.title}</td>
                  <td className="subtle">{t.assignedUser ? `${t.assignedUser.firstName} ${t.assignedUser.lastName}` : '—'}</td>
                  <td><Badge value={t.priority} /></td>
                  <td className="subtle">{t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—'}</td>
                  <td><Badge value={t.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNew && <NewTask onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} />}
    </div>
  );
}

function NewTask({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ title: '', priority: 'MEDIUM', status: 'OPEN', dueDate: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      await api.post('/api/v1/tasks', {
        title: form.title, priority: form.priority, status: form.status,
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
      });
      onCreated();
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }
  return (
    <Modal title="New Task" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field"><label>Title</label><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></div>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="field"><label>Priority</label>
            <select className="select" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {Object.values(TaskPriority).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="field"><label>Status</label>
            <select className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {Object.values(TaskStatus).map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
        </div>
        <div className="field"><label>Due date</label><input className="input" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
        {err && <div className="error">{err}</div>}
        <button className="btn primary block mt8" disabled={busy}>{busy ? 'Saving…' : 'Create Task'}</button>
      </form>
    </Modal>
  );
}
