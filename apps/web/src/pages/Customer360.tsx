import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Card, Loading, Empty, Badge, money } from '../components/ui';

interface Customer360 {
  identity: { id: string; name: string; email?: string | null; phone?: string | null; company?: string | null; source?: string | null; notes?: string | null; createdAt: string };
  deals: Array<{ id: string; title: string; value: number; stage?: { name: string } | null }>;
  tasks: Array<{ id: string; title: string; status: string; dueDate?: string | null }>;
  timeline: Array<{ id: string; type: string; message: string; createdAt: string }>;
  nextAction: { id: string; title: string; dueDate?: string | null } | null;
}

export default function Customer360Page() {
  const { id } = useParams();
  const [data, setData] = useState<Customer360 | null>(null);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', source: '' });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try { setData(await api.get<Customer360>(`/api/v1/contacts/${id}/customer360`)); }
    catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  function startEdit() {
    if (!data) return;
    const c = data.identity;
    setForm({ name: c.name, email: c.email || '', phone: c.phone || '', company: c.company || '', source: c.source || '' });
    setEditing(true);
  }
  async function save() {
    setBusy(true);
    try {
      await api.patch(`/api/v1/contacts/${id}`, {
        name: form.name, email: form.email || undefined, phone: form.phone || undefined,
        company: form.company || undefined, source: form.source || undefined,
      });
      setEditing(false);
      await load();
    } finally { setBusy(false); }
  }
  async function addNote() {
    if (!note.trim()) return;
    setBusy(true);
    try { await api.post(`/api/v1/contacts/${id}/notes`, { note }); setNote(''); await load(); }
    finally { setBusy(false); }
  }

  if (err) return <Empty text={err} />;
  if (!data) return <Loading />;
  const c = data.identity;

  return (
    <div>
      <Link to="/app/contacts" className="subtle">← Contacts</Link>
      <div className="row between mt8">
        <div>
          <div className="h1" style={{ marginBottom: 2 }}>{c.name}</div>
          <p className="subtle" style={{ margin: 0 }}>{c.company || 'Customer 360 profile'}</p>
        </div>
        {!editing && <button className="btn outline" onClick={startEdit}>✏️ Edit</button>}
      </div>

      <div className="grid grid-3 mt16">
        <Card title="Identity">
          {editing ? (
            <div>
              <div className="field"><label>Name</label><input className="input" aria-label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="field"><label>Company</label><input className="input" aria-label="Company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
              <div className="field"><label>Phone</label><input className="input" aria-label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="field"><label>Email</label><input className="input" aria-label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="field"><label>Source</label><input className="input" aria-label="Source" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></div>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn primary" onClick={save} disabled={busy || !form.name.trim()}>{busy ? 'Saving…' : 'Save'}</button>
                <button className="btn outline" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div>
              <div className="mt8"><strong>Phone:</strong> {c.phone || '—'}</div>
              <div className="mt8"><strong>Email:</strong> {c.email || '—'}</div>
              <div className="mt8"><strong>Company:</strong> {c.company || '—'}</div>
              <div className="mt8"><strong>Source:</strong> {c.source || '—'}</div>
              <div className="mt8"><strong>Since:</strong> {new Date(c.createdAt).toLocaleDateString()}</div>
            </div>
          )}
        </Card>
        <Card title="Next Action">
          {data.nextAction ? (
            <div>
              <div><strong>{data.nextAction.title}</strong></div>
              {data.nextAction.dueDate && <div className="subtle mt8">Due {new Date(data.nextAction.dueDate).toLocaleDateString()}</div>}
            </div>
          ) : <Empty text="No open tasks" />}
        </Card>
        <Card title="Deals">
          {data.deals.length === 0 ? <Empty text="No deals" /> : data.deals.map((d) => (
            <div key={d.id} className="row between mt8">
              <Link to={`/app/deals/${d.id}`} style={{ color: 'var(--primary)' }}>{d.title}</Link><span className="subtle">{money(d.value)}</span>
            </div>
          ))}
        </Card>
      </div>

      <div className="grid grid-2 mt16">
        <Card title="Tasks">
          {data.tasks.length === 0 ? <Empty text="No tasks" /> : (
            <table className="table">
              <tbody>
                {data.tasks.map((t) => (
                  <tr key={t.id}><td>{t.title}</td><td style={{ textAlign: 'right' }}><Badge value={t.status} /></td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Timeline">
          <div className="field">
            <div className="row" style={{ gap: 8 }}>
              <input className="input" placeholder="Add a note…" value={note}
                onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNote()} />
              <button className="btn primary" onClick={addNote} disabled={busy || !note.trim()}>Add</button>
            </div>
          </div>
          {data.timeline.length === 0 ? <Empty text="No activity" /> : data.timeline.map((a) => (
            <div key={a.id} className="mt8" style={{ paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
              <span className="badge gray">{a.type.replace(/_/g, ' ')}</span> {a.message}
              <div className="subtle" style={{ fontSize: 12 }}>{new Date(a.createdAt).toLocaleString()}</div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
