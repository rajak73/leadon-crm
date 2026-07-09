import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { Badge, Card, Loading, Empty, Modal } from '../components/ui';
import { LEAD_STATUSES, LEAD_SOURCES } from '@leados/shared';

interface Lead {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  source: string;
  status: string;
  score: number;
  createdAt: string;
}

export default function Leads() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [source, setSource] = useState('');
  const [assignee, setAssignee] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [views, setViews] = useState<{ id: string; name: string; filters: any }[]>([]);
  const [members, setMembers] = useState<{ userId: string; firstName: string; lastName: string }[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);

  function toggleSel(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) => (prev.size === leads.length ? new Set() : new Set(leads.map((l) => l.id))));
  }

  async function loadViews() {
    try { setViews(await api.get('/api/v1/saved-views?resource=LEADS')); } catch { /* ignore */ }
  }
  async function saveView() {
    const name = prompt('Name this view:');
    if (!name) return;
    await api.post('/api/v1/saved-views', { name, resource: 'LEADS', filters: { status, source, q, assignee } });
    loadViews();
  }
  function applyView(v: { filters: any }) {
    setStatus(v.filters.status || '');
    setSource(v.filters.source || '');
    setAssignee(v.filters.assignee || '');
    setQ(v.filters.q || '');
    setTimeout(load, 0);
  }
  async function deleteView(id: string) {
    await api.del(`/api/v1/saved-views/${id}`);
    loadViews();
  }

  async function bulk(action: 'SET_STATUS' | 'ASSIGN' | 'DELETE', extra: any = {}) {
    if (selected.size === 0) return;
    if (action === 'DELETE' && !confirm(`Delete ${selected.size} lead(s)?`)) return;
    setBulkBusy(true);
    try {
      await api.post('/api/v1/leads/bulk', { ids: Array.from(selected), action, ...extra });
      setSelected(new Set());
      await load();
    } finally { setBulkBusy(false); }
  }

  async function scoreAll() {
    setScoring(true);
    try { await api.post('/api/v1/ai/score-all', {}); await load(); }
    finally { setScoring(false); }
  }

  function exportCsv() {
    const base = import.meta.env.VITE_API_URL || '';
    // Include auth via a fetch → blob download (headers can't go on a link).
    fetch(`${base}/api/v1/leads/export.csv`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('leados_token')}`,
        'X-Org-Id': localStorage.getItem('leados_org') || '',
      },
    })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'leads.csv'; a.click();
        URL.revokeObjectURL(url);
      });
  }

  async function importCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return;
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const rows = lines.slice(1).map((line) => {
      const cols = line.split(',');
      const row: any = {};
      headers.forEach((h, i) => { row[h] = (cols[i] || '').trim().replace(/^"|"$/g, ''); });
      return { name: row.name, email: row.email, phone: row.phone, source: row.source, status: row.status };
    }).filter((r) => r.name);
    try {
      const res = await api.post<{ imported: number; skipped: number }>('/api/v1/leads/import', { rows });
      alert(`Imported ${res.imported} leads (${res.skipped} skipped).`);
      load();
    } catch (err: any) { alert('Import failed: ' + err.message); }
    e.target.value = '';
  }

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (source) params.set('source', source);
    if (assignee === '__unassigned__') params.set('assignedUserId', 'none');
    else if (assignee) params.set('assignedUserId', assignee);
    if (q) params.set('q', q);
    params.set('pageSize', '100');
    const r = await api.get<{ leads: Lead[] }>(`/api/v1/leads?${params}`);
    setLeads(r.leads);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status, source, assignee]);
  useEffect(() => { loadViews(); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    api.get<{ userId: string; firstName: string; lastName: string }[]>('/api/v1/organizations/members')
      .then(setMembers).catch(() => {});
  }, []);
  useEffect(() => {
    const open = () => setShowNew(true);
    document.addEventListener('leados:new', open);
    return () => document.removeEventListener('leados:new', open);
  }, []);

  return (
    <div>
      <div className="row between">
        <div>
          <div className="h1">{t('leads.title')}</div>
          <p className="subtle" style={{ marginTop: 0 }}>{t('leads.subtitle')}</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn outline" onClick={exportCsv}>⬇ {t('leads.export')}</button>
          <label className="btn outline" style={{ cursor: 'pointer' }}>
            ⬆ {t('leads.import')}
            <input type="file" accept=".csv" style={{ display: 'none' }} onChange={importCsv} />
          </label>
          <button className="btn outline" onClick={scoreAll} disabled={scoring}>{scoring ? '…' : '✨ ' + t('leads.scoreAll')}</button>
          <button className="btn primary" onClick={() => setShowNew(true)}>+ {t('leads.new')}</button>
        </div>
      </div>

      {/* Saved views */}
      {views.length > 0 && (
        <div className="row mt16" style={{ gap: 8, flexWrap: 'wrap' }}>
          <span className="subtle" style={{ fontSize: 13 }}>Saved views:</span>
          {views.map((v) => (
            <span key={v.id} className="badge gray" style={{ cursor: 'pointer' }} onClick={() => applyView(v)}>
              {v.name}
              <span onClick={(e) => { e.stopPropagation(); deleteView(v.id); }} style={{ marginLeft: 6, opacity: 0.6 }}>✕</span>
            </span>
          ))}
        </div>
      )}

      <div className="card card-pad mt16">
        <div className="row" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <input className="input" style={{ maxWidth: 240 }} placeholder={t('common.search')} value={q}
            onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} />
          <select className="select" style={{ maxWidth: 180 }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t('common.allStatuses')}</option>
            {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
          <select className="select" style={{ maxWidth: 160 }} value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">{t('common.source')}: all</option>
            {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="select" style={{ maxWidth: 170 }} value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Assignee filter">
            <option value="">Assignee: all</option>
            {user && <option value={user.id}>My leads</option>}
            <option value="__unassigned__">Unassigned</option>
            {members.filter((m) => m.userId !== user?.id).map((m) => <option key={m.userId} value={m.userId}>{m.firstName} {m.lastName}</option>)}
          </select>
          <button className="btn outline" onClick={load}>{t('common.search')}</button>
          <button className="btn outline" onClick={saveView} title="Save current filters as a view">💾 Save view</button>
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="row between" style={{ background: 'var(--primary-50)', padding: '10px 12px', borderRadius: 10, marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <strong>{selected.size} selected</strong>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <select className="select sm" style={{ maxWidth: 180 }} disabled={bulkBusy}
                onChange={(e) => { if (e.target.value) { bulk('SET_STATUS', { status: e.target.value }); e.target.value = ''; } }}>
                <option value="">Set status…</option>
                {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
              <select className="select sm" style={{ maxWidth: 180 }} disabled={bulkBusy} aria-label="Assign to"
                onChange={(e) => {
                  if (e.target.value === '') return;
                  bulk('ASSIGN', { assignedUserId: e.target.value === '__unassign__' ? null : e.target.value });
                  e.target.value = '';
                }}>
                <option value="">Assign to…</option>
                <option value="__unassign__">Unassign</option>
                {members.map((m) => <option key={m.userId} value={m.userId}>{m.firstName} {m.lastName}</option>)}
              </select>
              <button className="btn sm outline" disabled={bulkBusy} onClick={() => bulk('DELETE')}>Delete</button>
              <button className="btn sm" onClick={() => setSelected(new Set())}>Clear</button>
            </div>
          </div>
        )}

        {loading ? <Loading /> : leads.length === 0 ? <Empty text={t('leads.empty')} /> : (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 32 }}><input type="checkbox" checked={selected.size === leads.length && leads.length > 0} onChange={toggleAll} /></th>
                <th>{t('common.name')}</th><th>{t('leads.contact')}</th><th>{t('common.source')}</th><th>{t('common.status')}</th><th>{t('leads.score')}</th><th>{t('common.created')}</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} style={selected.has(l.id) ? { background: 'var(--primary-50)' } : undefined}>
                  <td><input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleSel(l.id)} /></td>
                  <td><Link to={`/app/leads/${l.id}`} style={{ color: 'var(--primary)', fontWeight: 600 }}>{l.name}</Link></td>
                  <td className="subtle">{l.phone || l.email || '—'}</td>
                  <td><Badge value={l.source} /></td>
                  <td><Badge value={l.status} /></td>
                  <td>{l.score}</td>
                  <td className="subtle">{new Date(l.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNew && <NewLead onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} />}
    </div>
  );
}

function NewLead({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', source: 'MANUAL', status: 'NEW' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      await api.post('/api/v1/leads', { ...form, email: form.email || undefined });
      onCreated();
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  return (
    <Modal title="New Lead" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field"><label>Name</label><input className="input" aria-label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
        <div className="field"><label>Phone</label><input className="input" aria-label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <div className="field"><label>Email</label><input className="input" aria-label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="field"><label>Source</label>
            <select className="select" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
              {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="field"><label>Status</label>
            <select className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
        </div>
        {err && <div className="error">{err}</div>}
        <button className="btn primary block mt8" disabled={busy}>{busy ? 'Saving…' : 'Create Lead'}</button>
      </form>
    </Modal>
  );
}
