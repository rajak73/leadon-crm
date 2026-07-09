import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Card, Badge, Loading, Empty, money } from '../components/ui';
import { LEAD_STATUSES, LEAD_SOURCES } from '@leados/shared';

interface Lead {
  id: string; name: string; email?: string | null; phone?: string | null;
  source: string; status: string; score: number; notes?: string | null;
  assignedUser?: { firstName: string; lastName: string } | null;
  createdAt: string; lastActivityAt?: string | null;
  deals: { id: string; title: string; value: number; stage?: { name: string } | null }[];
  tasks: { id: string; title: string; status: string; dueDate?: string | null }[];
  activities: { id: string; type: string; message: string; createdAt: string }[];
  conversations: { id: string; channel: string; messages: { id: string; direction: string; body: string }[] }[];
}

const ACT_ICON: Record<string, string> = {
  LEAD_CREATED: '➕', LEAD_STATUS_CHANGED: '🔀', NOTE_ADDED: '📝',
  LEAD_DETAILS_CAPTURED: '📇', LEAD_SCORED: '✨', DEAL_CREATED: '🗂️', WORKFLOW_RUN: '⚙️',
};

export default function LeadDetail() {
  const { id } = useParams();
  const [lead, setLead] = useState<Lead | null>(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', source: 'MANUAL', score: 0 });

  async function load() {
    try { setLead(await api.get<Lead>(`/api/v1/leads/${id}`)); }
    catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  async function setStatus(status: string) {
    await api.patch(`/api/v1/leads/${id}`, { status });
    load();
  }
  async function addNote() {
    if (!note.trim()) return;
    setBusy(true);
    try { await api.post(`/api/v1/leads/${id}/notes`, { note }); setNote(''); await load(); }
    finally { setBusy(false); }
  }
  async function scoreLead() {
    await api.post(`/api/v1/ai/score-lead/${id}`, {});
    load();
  }
  function startEdit() {
    if (!lead) return;
    setForm({
      name: lead.name,
      email: lead.email || '',
      phone: lead.phone || '',
      source: lead.source,
      score: lead.score,
    });
    setEditing(true);
  }
  async function saveEdit() {
    setBusy(true);
    try {
      await api.patch(`/api/v1/leads/${id}`, {
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        source: form.source,
        score: Number(form.score),
      });
      setEditing(false);
      await load();
    } finally { setBusy(false); }
  }

  if (err) return <Empty text={err} />;
  if (!lead) return <Loading />;

  return (
    <div>
      <Link to="/app/leads" className="subtle">← Leads</Link>
      <div className="row between mt8">
        <div>
          <div className="h1" style={{ marginBottom: 2 }}>{lead.name}</div>
          <div className="row" style={{ gap: 8 }}>
            <Badge value={lead.status} /> <Badge value={lead.source} />
            <span className="subtle">Score: <strong>{lead.score}</strong></span>
          </div>
        </div>
        <button className="btn outline" onClick={scoreLead}>✨ Re-score</button>
      </div>

      <div className="grid grid-3 mt16">
        <Card title="Details" action={!editing ? <button className="btn sm outline" onClick={startEdit}>✏️ Edit</button> : undefined}>
          {editing ? (
            <div>
              <div className="field"><label>Name</label><input className="input" aria-label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="field"><label>Phone</label><input className="input" aria-label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="field"><label>Email</label><input className="input" aria-label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="field"><label>Source</label>
                <select className="select" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                  {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="field"><label>Score (0–100)</label><input className="input" type="number" min={0} max={100} value={form.score} onChange={(e) => setForm({ ...form, score: Number(e.target.value) })} /></div>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn primary" onClick={saveEdit} disabled={busy || !form.name.trim()}>{busy ? 'Saving…' : 'Save'}</button>
                <button className="btn outline" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div>
              <div className="mt8"><strong>Phone:</strong> {lead.phone || '—'}</div>
              <div className="mt8"><strong>Email:</strong> {lead.email || '—'}</div>
              <div className="mt8"><strong>Assigned:</strong> {lead.assignedUser ? `${lead.assignedUser.firstName} ${lead.assignedUser.lastName}` : 'Unassigned'}</div>
              <div className="mt8"><strong>Created:</strong> {new Date(lead.createdAt).toLocaleDateString()}</div>
              <div className="field mt16">
                <label>Change status</label>
                <select className="select" value={lead.status} onChange={(e) => setStatus(e.target.value)}>
                  {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
            </div>
          )}
        </Card>

        <Card title={`Deals (${lead.deals.length})`}>
          {lead.deals.length === 0 ? <Empty text="No deals" /> : lead.deals.map((d) => (
            <div key={d.id} className="row between mt8">
              <span>{d.title} <span className="subtle">· {d.stage?.name}</span></span>
              <strong>{money(d.value)}</strong>
            </div>
          ))}
        </Card>

        <Card title={`Tasks (${lead.tasks.length})`}>
          {lead.tasks.length === 0 ? <Empty text="No tasks" /> : lead.tasks.map((t) => (
            <div key={t.id} className="row between mt8">
              <span>{t.title}</span><Badge value={t.status} />
            </div>
          ))}
        </Card>
      </div>

      <div className="grid grid-2 mt16">
        <Card title="Activity Timeline">
          <div className="field">
            <div className="row" style={{ gap: 8 }}>
              <input className="input" placeholder="Add a note…" value={note}
                onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNote()} />
              <button className="btn primary" onClick={addNote} disabled={busy || !note.trim()}>Add</button>
            </div>
          </div>
          {lead.activities.length === 0 ? <Empty text="No activity yet." /> : (
            <div style={{ position: 'relative' }}>
              {lead.activities.map((a) => (
                <div key={a.id} className="row" style={{ gap: 10, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span>{ACT_ICON[a.type] ?? '•'}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14 }}>{a.message}</div>
                    <div className="subtle" style={{ fontSize: 12 }}>{a.type.replace(/_/g, ' ')} · {new Date(a.createdAt).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Conversations">
          {lead.conversations.length === 0 ? <Empty text="No conversations" /> : lead.conversations.map((c) => (
            <div key={c.id} style={{ marginBottom: 12 }}>
              <div className="row between"><Badge value={c.channel} /></div>
              {c.messages.slice().reverse().map((m) => (
                <div key={m.id} className={`msg ${m.direction === 'INBOUND' ? 'in' : 'out'}`} style={{ maxWidth: '90%', marginTop: 6 }}>{m.body}</div>
              ))}
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
