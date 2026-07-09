import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

/** "Continue with Google" — only renders when SSO is configured server-side. */
export function GoogleButton() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    api.get<{ google: boolean }>('/api/v1/sso/status', false).then((r) => setEnabled(r.google)).catch(() => {});
  }, []);

  if (!enabled) return null;

  return (
    <>
      <div className="row" style={{ alignItems: 'center', gap: 10, margin: '14px 0' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span className="subtle" style={{ fontSize: 12 }}>or</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>
      <a className="btn outline block" href={`${API}/api/v1/sso/google`} style={{ justifyContent: 'center', gap: 8 }}>
        <span style={{ fontWeight: 700 }}>G</span> Continue with Google
      </a>
    </>
  );
}
