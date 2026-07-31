import { useEffect, useState } from 'react';
import { Download, ScrollText } from 'lucide-react';
import { api } from '../lib/api';
import { Badge, Empty, EmptyState, Skeleton } from '../components/ui';

interface Entry {
  id: string;
  action: string;
  actorEmail?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  createdAt: string;
}

export default function AuditLog() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [action, setAction] = useState('');

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const params = new URLSearchParams({ pageSize: '100' });
      if (action) params.set('action', action);
      const r = await api.get<{ entries: Entry[]; total: number }>(`/api/v1/audit?${params}`);
      setEntries(r.entries);
      setTotal(r.total);
    } catch (e: any) {
      setErr(e.message);
    }
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  if (err) return <Empty text={err} />;

  return (
    <div>
      <div className="row between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="text-display">Audit Log</div>
          <p className="subtle" style={{ marginTop: 4 }}>Compliance trail of who did what in this organization ({total} events).</p>
        </div>
        <button className="btn outline" onClick={() => {
          const base = import.meta.env.VITE_API_URL || '';
          fetch(`${base}/api/v1/audit/export.csv`, { headers: { Authorization: `Bearer ${localStorage.getItem('leados_token')}`, 'X-Org-Id': localStorage.getItem('leados_org') || '' } })
            .then((r) => r.blob()).then((blob) => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'audit-log.csv'; a.click(); URL.revokeObjectURL(url); });
        }}><Download size={14} /> Export CSV</button>
      </div>

      <div className="card card-pad mt16">
        <div className="row" style={{ marginBottom: 12 }}>
          <input className="input" style={{ maxWidth: 260 }} placeholder="Filter by action (e.g. LEAD_CREATED)"
            value={action} onChange={(e) => setAction(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} />
          <button className="btn outline" onClick={load}>Filter</button>
        </div>

        {loading ? (
          <table className="table">
            <tbody>
              {Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  <td><Skeleton width={120} height={13} /></td>
                  <td><Skeleton width="60%" height={13} /></td>
                  <td><Skeleton width={90} height={20} radius={999} /></td>
                  <td><Skeleton width="50%" height={13} /></td>
                  <td><Skeleton width="70%" height={13} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : entries.length === 0 ? (
          <EmptyState icon={ScrollText} title="No audit events yet" description="Actions taken in this organization will be recorded here for compliance." />
        ) : (
          <table className="table">
            <thead>
              <tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="subtle" style={{ whiteSpace: 'nowrap' }}>{new Date(e.createdAt).toLocaleString()}</td>
                  <td className="subtle">{e.actorEmail || 'system'}</td>
                  <td><Badge value={e.action.replace(/_/g, ' ')} /></td>
                  <td className="subtle">{e.entityType || '—'}</td>
                  <td className="subtle" style={{ fontSize: 12, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.metadata ? JSON.stringify(e.metadata) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
