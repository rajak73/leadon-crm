import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Card, Loading, Empty, money } from '../components/ui';
import { useAuth } from '../lib/auth';

interface PlanDef {
  key: string; name: string; priceMonthly: number;
  limits: { leads: number; members: number; deals: number };
  features: string[];
}
interface Sub {
  plan: string; status: string;
  usage: { leads: number; members: number; deals: number };
  limits: { leads: number; members: number; deals: number };
  mode: string;
}

function lim(n: number) { return n < 0 ? '∞' : n; }

export default function Billing() {
  const { currentOrg } = useAuth();
  const [plans, setPlans] = useState<PlanDef[]>([]);
  const [sub, setSub] = useState<Sub | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');

  const canManage = currentOrg?.role === 'OWNER' || currentOrg?.role === 'ADMIN';

  async function load() {
    try {
      const [p, s] = await Promise.all([
        api.get<{ plans: PlanDef[] }>('/api/v1/billing/plans', false),
        api.get<Sub>('/api/v1/billing/subscription'),
      ]);
      setPlans(p.plans);
      setSub(s);
    } catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function choose(plan: string) {
    setBusy(plan);
    try { await api.post('/api/v1/billing/change-plan', { plan }); await load(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(''); }
  }

  if (err) return <Empty text={err} />;
  if (!sub) return <Loading />;

  return (
    <div>
      <div className="h1">Billing & Plan</div>
      <p className="subtle" style={{ marginTop: 0 }}>
        Current plan: <strong>{sub.plan}</strong> · Status {sub.status} · Mode {sub.mode}
      </p>

      <Card title="Usage this period">
        <div className="grid grid-3">
          {(['leads', 'members', 'deals'] as const).map((k) => (
            <div key={k}>
              <div className="subtle" style={{ textTransform: 'capitalize' }}>{k}</div>
              <div className="value" style={{ fontSize: 22, fontWeight: 800 }}>
                {sub.usage[k]} <span className="subtle" style={{ fontSize: 14 }}>/ {lim(sub.limits[k])}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-4 mt16">
        {plans.map((p) => {
          const current = p.key === sub.plan;
          return (
            <div key={p.key} className="card price-card" style={current ? { borderColor: 'var(--primary)', boxShadow: 'var(--shadow-lg)' } : {}}>
              <div className="h2">{p.name}</div>
              <div className="amt">{p.priceMonthly < 0 ? "Let's talk" : p.priceMonthly === 0 ? 'Free' : money(p.priceMonthly)}</div>
              <div className="subtle">{p.priceMonthly > 0 ? 'per month' : ''}</div>
              <div className="mt16" style={{ textAlign: 'left' }}>
                <div className="mt8">✓ {lim(p.limits.leads)} leads</div>
                <div className="mt8">✓ {lim(p.limits.members)} members</div>
                {p.features.map((f) => <div key={f} className="mt8">✓ {f}</div>)}
              </div>
              <button
                className={`btn ${current ? 'outline' : 'primary'} block mt16`}
                disabled={current || !canManage || busy === p.key}
                onClick={() => choose(p.key)}
              >
                {current ? 'Current plan' : busy === p.key ? 'Updating…' : `Switch to ${p.name}`}
              </button>
            </div>
          );
        })}
      </div>
      {!canManage && <div className="hint mt16">Only owners/admins can change the plan.</div>}
    </div>
  );
}
