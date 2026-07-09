import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Loading, Empty, money, Modal } from '../components/ui';

interface Deal { id: string; title: string; value: number; owner?: { firstName: string } | null; }
interface Column { stage: { id: string; key: string; name: string; probability: number }; deals: Deal[]; totalValue: number; count: number; }
interface PipelineData { pipeline: { id: string; name: string }; columns: Column[]; totalPipelineValue: number; }

export default function Pipeline() {
  const [data, setData] = useState<PipelineData | null>(null);
  const [err, setErr] = useState('');
  const [showNew, setShowNew] = useState(false);

  async function load() {
    try { setData(await api.get<PipelineData>('/api/v1/deals/pipeline')); }
    catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function move(dealId: string, stageId: string) {
    await api.patch(`/api/v1/deals/${dealId}/stage`, { stageId });
    load();
  }

  if (err) return <Empty text={err} />;
  if (!data) return <Loading />;

  return (
    <div>
      <div className="row between">
        <div>
          <div className="h1">Pipeline</div>
          <p className="subtle" style={{ marginTop: 0 }}>Total open value: {money(data.totalPipelineValue)}</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn outline" onClick={() => {
            const base = import.meta.env.VITE_API_URL || '';
            fetch(`${base}/api/v1/deals/export.csv`, { headers: { Authorization: `Bearer ${localStorage.getItem('leados_token')}`, 'X-Org-Id': localStorage.getItem('leados_org') || '' } })
              .then((r) => r.blob()).then((blob) => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'deals.csv'; a.click(); URL.revokeObjectURL(url); });
          }}>⬇ Export CSV</button>
          <button className="btn primary" onClick={() => setShowNew(true)}>+ New Deal</button>
        </div>
      </div>

      <div className="kanban mt16">
        {data.columns.map((col) => (
          <div key={col.stage.id} className="kanban-col">
            <h3>
              <span>{col.stage.name} <span className="subtle">({col.count})</span></span>
              <span className="subtle">{money(col.totalValue)}</span>
            </h3>
            {col.deals.length === 0 ? <div className="subtle" style={{ padding: 8, fontSize: 13 }}>No deals</div> :
              col.deals.map((d) => (
                <div key={d.id} className="deal-card">
                  <Link to={`/app/deals/${d.id}`} className="title" style={{ color: 'var(--primary)', display: 'block' }}>{d.title}</Link>
                  <div className="val">{money(d.value)}</div>
                  <select className="select mt8" style={{ fontSize: 12, padding: '6px 8px' }}
                    value={col.stage.id} onChange={(e) => move(d.id, e.target.value)}>
                    {data.columns.map((c) => <option key={c.stage.id} value={c.stage.id}>{c.stage.name}</option>)}
                  </select>
                </div>
              ))}
          </div>
        ))}
      </div>

      {showNew && <NewDeal columns={data.columns} onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} />}
    </div>
  );
}

function NewDeal({ columns, onClose, onCreated }: { columns: Column[]; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ title: '', value: 0, stageId: columns[0]?.stage.id || '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try { await api.post('/api/v1/deals', { title: form.title, value: Number(form.value), stageId: form.stageId }); onCreated(); }
    catch (e: any) { setErr(e.message); setBusy(false); }
  }
  return (
    <Modal title="New Deal" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field"><label>Title</label><input className="input" aria-label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></div>
        <div className="field"><label>Value (₹)</label><input className="input" aria-label="Value (₹)" type="number" value={form.value} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} /></div>
        <div className="field"><label>Stage</label>
          <select className="select" value={form.stageId} onChange={(e) => setForm({ ...form, stageId: e.target.value })}>
            {columns.map((c) => <option key={c.stage.id} value={c.stage.id}>{c.stage.name}</option>)}
          </select>
        </div>
        {err && <div className="error">{err}</div>}
        <button className="btn primary block mt8" disabled={busy}>{busy ? 'Saving…' : 'Create Deal'}</button>
      </form>
    </Modal>
  );
}
