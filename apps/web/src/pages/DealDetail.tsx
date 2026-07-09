import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Card, Badge, Loading, Empty, money } from '../components/ui';

interface Stage { id: string; name: string; key: string }
interface Deal {
  id: string; title: string; value: number; status: string; probability: number;
  expectedCloseDate?: string | null;
  stage?: Stage | null;
  pipeline?: { stages: Stage[] } | null;
  owner?: { firstName: string; lastName: string } | null;
  lead?: { id: string; name: string } | null;
  contact?: { id: string; name: string } | null;
  tasks: { id: string; title: string; status: string }[];
  activities: { id: string; type: string; message: string; createdAt: string }[];
  notes?: string | null;
  createdAt: string;
}

export default function DealDetail() {
  const { id } = useParams();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ title: '', value: 0, expectedCloseDate: '', notes: '' });
  const [busy, setBusy] = useState(false);

  async function load() {
    try { setDeal(await api.get<Deal>(`/api/v1/deals/${id}`)); }
    catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  async function moveStage(stageId: string) {
    await api.patch(`/api/v1/deals/${id}/stage`, { stageId });
    load();
  }
  function startEdit() {
    if (!deal) return;
    setForm({
      title: deal.title,
      value: deal.value,
      expectedCloseDate: deal.expectedCloseDate ? deal.expectedCloseDate.slice(0, 10) : '',
      notes: deal.notes || '',
    });
    setEditing(true);
  }
  async function save() {
    setBusy(true);
    try {
      await api.patch(`/api/v1/deals/${id}`, {
        title: form.title,
        value: Number(form.value),
        expectedCloseDate: form.expectedCloseDate ? new Date(form.expectedCloseDate).toISOString() : undefined,
        notes: form.notes || undefined,
      });
      setEditing(false);
      await load();
    } finally { setBusy(false); }
  }

  if (err) return <Empty text={err} />;
  if (!deal) return <Loading />;
  const stages = deal.pipeline?.stages ?? [];

  return (
    <div>
      <Link to="/app/pipeline" className="subtle">← Pipeline</Link>
      <div className="row between mt8">
        <div>
          <div className="h1" style={{ marginBottom: 2 }}>{deal.title}</div>
          <div className="row" style={{ gap: 8 }}>
            <Badge value={deal.status} />
            {deal.stage && <Badge value={deal.stage.name} />}
            <span className="subtle">{money(deal.value)} · {deal.probability}%</span>
          </div>
        </div>
        {!editing && <button className="btn outline" onClick={startEdit}>✏️ Edit</button>}
      </div>

      <div className="grid grid-3 mt16">
        <Card title="Deal">
          {editing ? (
            <div>
              <div className="field"><label>Title</label><input className="input" aria-label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div className="field"><label>Value (₹)</label><input className="input" aria-label="Value" type="number" value={form.value} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} /></div>
              <div className="field"><label>Expected close</label><input className="input" aria-label="Expected close" type="date" value={form.expectedCloseDate} onChange={(e) => setForm({ ...form, expectedCloseDate: e.target.value })} /></div>
              <div className="field"><label>Notes</label><textarea className="textarea" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn primary" onClick={save} disabled={busy || !form.title.trim()}>{busy ? 'Saving…' : 'Save'}</button>
                <button className="btn outline" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div>
              <div className="mt8"><strong>Value:</strong> {money(deal.value)}</div>
              <div className="mt8"><strong>Probability:</strong> {deal.probability}%</div>
              <div className="mt8"><strong>Expected close:</strong> {deal.expectedCloseDate ? new Date(deal.expectedCloseDate).toLocaleDateString() : '—'}</div>
              <div className="mt8"><strong>Owner:</strong> {deal.owner ? `${deal.owner.firstName} ${deal.owner.lastName}` : 'Unassigned'}</div>
              {deal.notes && <div className="mt8"><strong>Notes:</strong> {deal.notes}</div>}
              <div className="field mt16">
                <label>Move stage</label>
                <select className="select" value={deal.stage?.id} onChange={(e) => moveStage(e.target.value)}>
                  {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
          )}
        </Card>

        <Card title="Related">
          <div className="mt8"><strong>Lead:</strong> {deal.lead ? <Link to={`/app/leads/${deal.lead.id}`} style={{ color: 'var(--primary)' }}>{deal.lead.name}</Link> : '—'}</div>
          <div className="mt8"><strong>Contact:</strong> {deal.contact ? <Link to={`/app/contacts/${deal.contact.id}`} style={{ color: 'var(--primary)' }}>{deal.contact.name}</Link> : '—'}</div>
          <div className="mt8"><strong>Created:</strong> {new Date(deal.createdAt).toLocaleDateString()}</div>
        </Card>

        <Card title={`Tasks (${deal.tasks.length})`}>
          {deal.tasks.length === 0 ? <Empty text="No tasks" /> : deal.tasks.map((t) => (
            <div key={t.id} className="row between mt8"><span>{t.title}</span><Badge value={t.status} /></div>
          ))}
        </Card>
      </div>

      <div className="mt16">
        <Card title="Related Activity">
          {deal.activities.length === 0 ? <Empty text="No related activity." /> : deal.activities.map((a) => (
            <div key={a.id} className="row" style={{ gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span className="badge gray">{a.type.replace(/_/g, ' ')}</span>
              <div><div style={{ fontSize: 14 }}>{a.message}</div><div className="subtle" style={{ fontSize: 12 }}>{new Date(a.createdAt).toLocaleString()}</div></div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
