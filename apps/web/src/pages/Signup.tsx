import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import { validatePassword, PASSWORD_RULE } from '@leados/shared';
import { GoogleButton } from '../components/GoogleButton';

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', workspaceName: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const pw = validatePassword(form.password);

  function set(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!pw.valid) {
      setError(pw.errors[0]);
      return;
    }
    setBusy(true);
    try {
      await signup(form);
      navigate('/app');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Signup failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand" style={{ fontSize: 24, textAlign: 'center' }}>LeadOS</div>
        <div className="card card-pad mt16">
          <div className="h1">Create your workspace</div>
          <p className="subtle" style={{ marginTop: 0 }}>Start capturing and converting leads today.</p>
          <form onSubmit={submit}>
            <div className="grid grid-2" style={{ gap: 12 }}>
              <div className="field">
                <label>First name</label>
                <input className="input" aria-label="First name" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} required />
              </div>
              <div className="field">
                <label>Last name</label>
                <input className="input" aria-label="Last name" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} required />
              </div>
            </div>
            <div className="field">
              <label>Work email</label>
              <input className="input" aria-label="Work email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required />
            </div>
            <div className="field">
              <label>Workspace name</label>
              <input className="input" aria-label="Workspace name" value={form.workspaceName} onChange={(e) => set('workspaceName', e.target.value)} placeholder="e.g. Rao Realty" required />
            </div>
            <div className="field">
              <label>Password</label>
              <input className="input" aria-label="Password" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} required />
              <div className="hint">{PASSWORD_RULE.hint}</div>
            </div>
            {error && <div className="error">{error}</div>}
            <button className="btn primary block mt8" disabled={busy}>{busy ? 'Creating…' : 'Create workspace'}</button>
          </form>
          <GoogleButton />
          <div className="subtle mt16" style={{ textAlign: 'center' }}>
            Already have an account? <Link to="/login" style={{ color: 'var(--primary)' }}>Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
