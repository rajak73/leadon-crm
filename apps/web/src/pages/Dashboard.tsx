import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { StatCard, Card, Loading, Empty, money } from '../components/ui';

interface DashboardData {
  counts: { leads: number; deals: number; openTasks: number; contacts: number };
  pipelineValue: number;
  wonValue: number;
  recentActivities: Array<{ id: string; type: string; message: string; createdAt: string; actor?: { firstName: string; lastName: string } }>;
}

export default function Dashboard() {
  const { t } = useI18n();
  const [data, setData] = useState<DashboardData | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get<DashboardData>('/api/v1/dashboard').then(setData).catch((e) => setErr(e.message));
  }, []);

  if (err) return <Empty text={err} />;
  if (!data) return <Loading />;

  return (
    <div>
      <div className="h1">{t('dashboard.title')}</div>
      <p className="subtle" style={{ marginTop: 0 }}>{t('dashboard.subtitle')}</p>

      <div className="grid grid-4 mt16">
        <StatCard label={t('dashboard.leads')} value={data.counts.leads} />
        <StatCard label={t('dashboard.deals')} value={data.counts.deals} />
        <StatCard label={t('dashboard.openTasks')} value={data.counts.openTasks} />
        <StatCard label={t('dashboard.contacts')} value={data.counts.contacts} />
      </div>

      <div className="grid grid-2 mt16">
        <StatCard label={t('dashboard.pipelineValue')} value={money(data.pipelineValue)} />
        <StatCard label={t('dashboard.wonValue')} value={money(data.wonValue)} />
      </div>

      <div className="mt16">
        <Card title={t('dashboard.recentActivity')}>
          {data.recentActivities.length === 0 ? (
            <Empty text="No activity yet. Create a lead or run the Social Simulator." />
          ) : (
            <table className="table">
              <tbody>
                {data.recentActivities.map((a) => (
                  <tr key={a.id}>
                    <td style={{ width: 160 }}><span className="badge gray">{a.type.replace(/_/g, ' ')}</span></td>
                    <td>{a.message}</td>
                    <td className="subtle" style={{ textAlign: 'right', width: 160 }}>
                      {new Date(a.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
