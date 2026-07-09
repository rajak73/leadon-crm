import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Loading, Empty, Modal } from '../components/ui';

interface Contact {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  createdAt: string;
}

export default function Contacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  async function load() {
    setLoading(true);
    const r = await api.get<{ contacts: Contact[] }>('/api/v1/contacts?pageSize=100');
    setContacts(r.contacts);
    setSelected(new Set());
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const open = () => setShowNew(true);
    document.addEventListener('leados:new', open);
    return () => document.removeEventListener('leados:new', open);
  }, []);

  function toggleSel(id: string) {
    setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelected((p) => (p.size === contacts.length ? new Set() : new Set(contacts.map((c) => c.id))));
  }

  function exportCsv() {
    const base = import.meta.env.VITE_API_URL || '';
    fetch(`${base}/api/v1/contacts/export.csv`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('leados_token')}`, 'X-Org-Id': localStorage.getItem('leados_org') || '' },
    }).then((r) => r.blob()).then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'contacts.csv'; a.click();
      URL.revokeObjectURL(url);
    });
  }

  async function importCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const lines = (await file.text()).split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return;
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const rows = lines.slice(1).map((line) => {
      const cols = line.split(','); const row: any = {};
      headers.forEach((h, i) => { row[h] = (cols[i] || '').trim().replace(/^"|"$/g, ''); });
      return { name: row.name, email: row.email, phone: row.phone, company: row.company, source: row.source };
    }).filter((r) => r.name);
    try {
      const res = await api.post<{ imported: number; skipped: number }>('/api/v1/contacts/import', { rows });
      alert(`Imported ${res.imported} contacts (${res.skipped} skipped).`); load();
    } catch (err: any) { alert('Import failed: ' + err.message); }
    e.target.value = '';
  }

  async function bulkDelete() {
    if (selected.size === 0 || !confirm(`Delete ${selected.size} contact(s)?`)) return;
    setBulkBusy(true);
    try { await api.post('/api/v1/contacts/bulk', { ids: Array.from(selected), action: 'DELETE' }); await load(); }
    finally { setBulkBusy(false); }
  }

  return (
    <div>
      <div className="row between">
        <div>
          <div className="h1">Contacts</div>
          <p className="subtle" style={{ marginTop: 0 }}>People and businesses you work with.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn outline" onClick={exportCsv}>⬇ Export CSV</button>
          <label className="btn outline" style={{ cursor: 'pointer' }}>
            ⬆ Import CSV
            <input type="file" accept=".csv" style={{ display: 'none' }} onChange={importCsv} />
          </label>
          <button className="btn primary" onClick={() => setShowNew(true)}>+ New Contact</button>
        </div>
      </div>

      <div className="card card-pad mt16">
        {selected.size > 0 && (
          <div className="row between" style={{ background: 'var(--primary-50)', padding: '10px 12px', borderRadius: 10, marginBottom: 12 }}>
            <strong>{selected.size} selected</strong>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn sm outline" disabled={bulkBusy} onClick={bulkDelete}>Delete</button>
              <button className="btn sm" onClick={() => setSelected(new Set())}>Clear</button>
            </div>
          </div>
        )}
        {loading ? <Loading /> : contacts.length === 0 ? <Empty text="No contacts yet." /> : (
          <table className="table">
            <thead><tr>
              <th style={{ width: 32 }}><input type="checkbox" checked={selected.size === contacts.length && contacts.length > 0} onChange={toggleAll} /></th>
              <th>Name</th><th>Company</th><th>Contact</th><th></th>
            </tr></thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id} style={selected.has(c.id) ? { background: 'var(--primary-50)' } : undefined}>
                  <td><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSel(c.id)} /></td>
                  <td><strong>{c.name}</strong></td>
                  <td className="subtle">{c.company || '—'}</td>
                  <td className="subtle">{c.phone || c.email || '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <Link to={`/app/contacts/${c.id}`} className="btn sm outline">Customer 360 →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNew && <NewContact onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} />}
    </div>
  );
}

function NewContact({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: '', company: '', phone: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try { await api.post('/api/v1/contacts', { ...form, email: form.email || undefined }); onCreated(); }
    catch (e: any) { setErr(e.message); setBusy(false); }
  }
  return (
    <Modal title="New Contact" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field"><label>Name</label><input className="input" aria-label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
        <div className="field"><label>Company</label><input className="input" aria-label="Company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
        <div className="field"><label>Phone</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <div className="field"><label>Email</label><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        {err && <div className="error">{err}</div>}
        <button className="btn primary block mt8" disabled={busy}>{busy ? 'Saving…' : 'Create Contact'}</button>
      </form>
    </Modal>
  );
}
