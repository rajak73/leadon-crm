import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Card, Badge, Loading, Empty, Modal } from '../components/ui';
import { useAuth } from '../lib/auth';

interface Account {
  id: string; provider: string; externalId: string; displayName?: string | null;
  isConnected: boolean; hasAccessToken: boolean;
}
interface Platform {
  instagram: boolean; whatsapp: boolean; facebook: boolean;
  webhookVerifyTokenSet: boolean; appSecretSet: boolean;
}

export default function Integrations() {
  const { currentOrg } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const canManage = currentOrg?.role === 'OWNER' || currentOrg?.role === 'ADMIN';

  async function load() {
    setLoading(true);
    const r = await api.get<{ accounts: Account[]; platform: Platform }>('/api/v1/integrations');
    setAccounts(r.accounts);
    setPlatform(r.platform);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function disconnect(id: string) {
    await api.post(`/api/v1/integrations/${id}/disconnect`, {});
    load();
  }

  const [cal, setCal] = useState<{ configured: boolean; connected: boolean; mode: string } | null>(null);
  async function loadCal() {
    try { setCal(await api.get('/api/v1/calendar/status')); } catch { /* noop */ }
  }
  useEffect(() => { loadCal(); }, []);
  async function connectCal() {
    const r = await api.get<{ mode: string; authUrl?: string }>('/api/v1/calendar/connect');
    if (r.authUrl) window.location.href = r.authUrl; // real Google OAuth
    else loadCal(); // mock connected
  }
  async function disconnectCal() {
    await api.post('/api/v1/calendar/disconnect', {});
    loadCal();
  }

  const webhookUrl = `${import.meta.env.VITE_API_URL || ''}/api/v1/webhooks/meta`;

  return (
    <div>
      <div className="row between">
        <div>
          <div className="h1">Integrations</div>
          <p className="subtle" style={{ marginTop: 0 }}>Connect Instagram, WhatsApp & Facebook (BRD §16).</p>
        </div>
        {canManage && <button className="btn primary" onClick={() => setShowNew(true)}>+ Connect account</button>}
      </div>

      {platform && (
        <Card title="Platform status">
          <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
            <Badge value={platform.appSecretSet ? 'App secret set' : 'App secret missing'} />
            <Badge value={platform.webhookVerifyTokenSet ? 'Verify token set' : 'Verify token missing'} />
            <span className="badge gray">WhatsApp creds: {platform.whatsapp ? 'yes' : 'no'}</span>
            <span className="badge gray">Instagram creds: {platform.instagram ? 'yes' : 'no'}</span>
          </div>
          <div className="hint mt16">
            Webhook callback URL (set this in your Meta App): <code>{webhookUrl}</code>
          </div>
          {!platform.appSecretSet && (
            <div className="hint">
              Real sends & inbound events are disabled until <code>META_APP_SECRET</code> and channel
              credentials are set in the API environment. Simulation mode still works.
            </div>
          )}
        </Card>
      )}

      <div className="mt16">
        <Card title="Calendar (Google)">
          <div className="row between">
            <div>
              <div>{cal?.connected ? <Badge value="active" /> : <Badge value="gray" />} {cal?.connected ? 'Connected' : 'Not connected'}
                {cal && <span className="badge gray" style={{ marginLeft: 8 }}>mode: {cal.mode}</span>}</div>
              <div className="hint mt8">Tasks with a due date create a calendar event. {cal && !cal.configured && 'Runs in mock mode until Google credentials are configured server-side.'}</div>
            </div>
            {canManage && (cal?.connected
              ? <button className="btn outline" onClick={disconnectCal}>Disconnect</button>
              : <button className="btn primary" onClick={connectCal}>Connect calendar</button>)}
          </div>
        </Card>
      </div>

      <div className="mt16">
        <Card title="Connected accounts">
          {loading ? <Loading /> : accounts.length === 0 ? <Empty text="No accounts connected yet." /> : (
            <table className="table">
              <thead><tr><th>Provider</th><th>Account ID</th><th>Name</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td><Badge value={a.provider} /></td>
                    <td className="subtle">{a.externalId}</td>
                    <td>{a.displayName || '—'}</td>
                    <td><Badge value={a.isConnected ? 'active' : 'gray'} /> {a.hasAccessToken ? <span className="badge gray">token ✓</span> : null}</td>
                    <td style={{ textAlign: 'right' }}>
                      {canManage && a.isConnected && <button className="btn sm outline" onClick={() => disconnect(a.id)}>Disconnect</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {showNew && <ConnectForm onClose={() => setShowNew(false)} onDone={() => { setShowNew(false); load(); }} />}
    </div>
  );
}

function ConnectForm({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ provider: 'WHATSAPP', externalId: '', displayName: '', accessToken: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try { await api.post('/api/v1/integrations/connect', form); onDone(); }
    catch (e: any) { setErr(e.message); setBusy(false); }
  }
  return (
    <Modal title="Connect account" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field"><label>Provider</label>
          <select className="select" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="INSTAGRAM">Instagram</option>
            <option value="FACEBOOK">Facebook</option>
          </select>
        </div>
        <div className="field"><label>Account ID (phone-number id / page id / IG id)</label>
          <input className="input" value={form.externalId} onChange={(e) => setForm({ ...form, externalId: e.target.value })} required />
          <div className="hint">This is used to map incoming Meta webhooks to your workspace.</div>
        </div>
        <div className="field"><label>Display name (optional)</label>
          <input className="input" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
        </div>
        <div className="field"><label>Access token (optional, for real replies)</label>
          <input className="input" type="password" value={form.accessToken} onChange={(e) => setForm({ ...form, accessToken: e.target.value })} />
          <div className="hint">Stored server-side and never shown again.</div>
        </div>
        {err && <div className="error">{err}</div>}
        <button className="btn primary block mt8" disabled={busy}>{busy ? 'Connecting…' : 'Connect'}</button>
      </form>
    </Modal>
  );
}
