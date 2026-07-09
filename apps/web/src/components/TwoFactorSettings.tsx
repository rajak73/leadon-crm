import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Card } from './ui';

export function TwoFactorSettings() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<{ qrDataUrl: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await api.get<{ enabled: boolean }>('/api/v1/2fa/status');
    setEnabled(r.enabled);
  }
  useEffect(() => { load(); }, []);

  async function startSetup() {
    setErr(''); setBusy(true);
    try { setSetup(await api.post('/api/v1/2fa/setup', {})); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function enable() {
    setErr(''); setBusy(true);
    try {
      const r = await api.post<{ enabled: boolean; backupCodes: string[] }>('/api/v1/2fa/enable', { token: code });
      setBackupCodes(r.backupCodes);
      setSetup(null); setCode('');
      await load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function disable() {
    setErr(''); setBusy(true);
    try { await api.post('/api/v1/2fa/disable', { password }); setPassword(''); await load(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  if (enabled === null) return null;

  return (
    <Card title="Two-Factor Authentication (2FA)">
      {backupCodes && (
        <div className="card card-pad" style={{ background: 'var(--warning-50)', marginBottom: 12 }}>
          <strong>Save your backup codes</strong>
          <p className="subtle" style={{ marginTop: 4 }}>Each can be used once if you lose your device. They won't be shown again.</p>
          <div style={{ fontFamily: 'ui-monospace, monospace', columns: 2 }}>
            {backupCodes.map((c) => <div key={c}>{c}</div>)}
          </div>
        </div>
      )}

      {enabled ? (
        <div>
          <p>✅ 2FA is <strong>enabled</strong> on your account.</p>
          <div className="field" style={{ maxWidth: 320 }}>
            <label>Enter your password to disable</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {err && <div className="error">{err}</div>}
          <button className="btn outline" onClick={disable} disabled={busy || !password}>Disable 2FA</button>
        </div>
      ) : setup ? (
        <div>
          <p className="subtle">Scan this QR in Google Authenticator / Authy, then enter the 6-digit code.</p>
          <img src={setup.qrDataUrl} alt="2FA QR" style={{ width: 180, height: 180 }} />
          <p className="hint">Or enter this secret manually: <code>{setup.secret}</code></p>
          <div className="field" style={{ maxWidth: 200 }}>
            <label>6-digit code</label>
            <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
          </div>
          {err && <div className="error">{err}</div>}
          <button className="btn primary" onClick={enable} disabled={busy || code.length < 6}>Verify & Enable</button>
        </div>
      ) : (
        <div>
          <p className="subtle">Add an extra layer of security. You'll enter a code from your authenticator app when signing in.</p>
          {err && <div className="error">{err}</div>}
          <button className="btn primary" onClick={startSetup} disabled={busy}>Enable 2FA</button>
        </div>
      )}
    </Card>
  );
}
