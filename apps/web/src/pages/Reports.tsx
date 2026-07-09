import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { StatCard, Card, Loading, Empty, money, Badge } from '../components/ui';
import { BarChart, DonutChart, LineChart } from '../components/Charts';

interface LeaderRow {
  userId: string; name: string; email: string; role: string;
  assignedLeads: number; wonLeads: number; conversionRate: number; openPipelineValue: number;
}

function Leaderboard() {
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    api.get<{ leaderboard: LeaderRow[] }>('/api/v1/reports/leaderboard')
      .then((r) => setRows(r.leaderboard)).catch(() => {}).finally(() => setLoaded(true));
  }, []);
  if (!loaded) return <Loading />;
  if (rows.length === 0) return <Empty text="No team members yet." />;
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <table className="table">
      <thead><tr><th>#</th><th>Agent</th><th>Assigned</th><th>Won</th><th>Conv.</th><th>Open Pipeline</th></tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.userId}>
            <td>{medals[i] ?? i + 1}</td>
            <td><strong>{r.name || r.email}</strong><div className="subtle" style={{ fontSize: 12 }}><Badge value={r.role} /></div></td>
            <td>{r.assignedLeads}</td>
            <td>{r.wonLeads}</td>
            <td>{r.conversionRate}%</td>
            <td>{money(r.openPipelineValue)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface Overview {
  range: { from: string; to: string; days: number };
  kpis: { totalLeads: number; leadsInRange: number; wonLeads: number; conversionRate: number; openValue: number; wonValue: number; taskCompletion: number; totalDeals: number };
  leadsByStatus: { label: string; value: number }[];
  leadsBySource: { label: string; value: number }[];
  dealValue: { label: string; value: number }[];
  trends: { leadsCreated: { label: string; value: number }[]; dealsWon: { label: string; value: number }[] };
}

const RANGES = [
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
  { days: 365, label: '1y' },
];

export default function Reports() {
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState('');
  const [days, setDays] = useState(30);

  useEffect(() => {
    setData(null); setErr('');
    api.get<Overview>(`/api/v1/reports/overview?days=${days}`).then(setData).catch((e) => setErr(e.message));
  }, [days]);

  function exportCsv() {
    const base = import.meta.env.VITE_API_URL || '';
    fetch(`${base}/api/v1/reports/export.csv?days=${days}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('leados_token')}`, 'X-Org-Id': localStorage.getItem('leados_org') || '' },
    }).then((r) => r.blob()).then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'report.csv'; a.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <div>
      <div className="row between">
        <div>
          <div className="h1">Reports & Analytics</div>
          <p className="subtle" style={{ marginTop: 0 }}>Performance and growth trends.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 4 }}>
            {RANGES.map((r) => (
              <button key={r.days} className={`btn sm ${days === r.days ? 'primary' : 'outline'}`} onClick={() => setDays(r.days)}>{r.label}</button>
            ))}
          </div>
          <button className="btn outline" onClick={exportCsv}>⬇ Export CSV</button>
        </div>
      </div>

      {err ? <Empty text={err} /> : !data ? <Loading /> : (
        <>
          <div className="grid grid-4 mt16">
            <StatCard label={`New Leads (${data.range.days}d)`} value={data.kpis.leadsInRange} />
            <StatCard label="Conversion Rate" value={`${data.kpis.conversionRate}%`} />
            <StatCard label="Won Value" value={money(data.kpis.wonValue)} />
            <StatCard label="Task Completion" value={`${data.kpis.taskCompletion}%`} />
          </div>

          <div className="grid grid-2 mt16">
            <Card title={`Leads Created (last ${data.range.days}d)`}>
              <LineChart data={data.trends.leadsCreated} color="#4f46e5" />
            </Card>
            <Card title={`Deals Won (last ${data.range.days}d)`}>
              <LineChart data={data.trends.dealsWon} color="#22c55e" />
            </Card>
          </div>

          <div className="grid grid-2 mt16">
            <Card title="Leads by Status">
              {data.leadsByStatus.every((d) => d.value === 0) ? <Empty text="No leads yet." /> : <BarChart data={data.leadsByStatus} />}
            </Card>
            <Card title="Leads by Source">
              {data.leadsBySource.length === 0 ? <Empty text="No source data yet." /> : <DonutChart data={data.leadsBySource} />}
            </Card>
          </div>

          <div className="grid grid-2 mt16">
            <Card title="Deal Value (₹)">
              {data.dealValue.every((d) => d.value === 0) ? <Empty text="No deals yet." /> : <BarChart data={data.dealValue} />}
            </Card>
            <Card title="Summary">
              <div className="row between mt8"><span className="subtle">All-time leads</span><strong>{data.kpis.totalLeads}</strong></div>
              <div className="row between mt8"><span className="subtle">Won leads</span><strong>{data.kpis.wonLeads}</strong></div>
              <div className="row between mt8"><span className="subtle">Total deals</span><strong>{data.kpis.totalDeals}</strong></div>
              <div className="row between mt8"><span className="subtle">Open pipeline value</span><strong>{money(data.kpis.openValue)}</strong></div>
            </Card>
          </div>

          <div className="mt16">
            <Card title="🏆 Agent Leaderboard">
              <Leaderboard />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
