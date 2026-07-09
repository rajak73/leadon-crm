import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import { GoogleButton } from '../components/GoogleButton';

export default function Login() {
  const { login, verify2fa } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState('');
  const [code, setCode] = useState('');
  const [useBackup, setUseBackup] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await login(email, password);
      if (r.twoFactorRequired && r.challenge) {
        setChallenge(r.challenge); // show 2FA step
      } else {
        navigate('/app');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  async function submit2fa(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await verify2fa(challenge, code, useBackup);
      navigate('/app');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Verification failed');
    } finally {
      setBusy(false);
    }
  }

  if (challenge) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="brand" style={{ fontSize: 24, textAlign: 'center' }}>LeadOS</div>
          <div className="card card-pad mt16">
            <div className="h1">Two-factor authentication</div>
            <p className="subtle" style={{ marginTop: 0 }}>
              {useBackup ? 'Enter a backup code.' : 'Enter the 6-digit code from your authenticator app.'}
            </p>
            <form onSubmit={submit2fa}>
              <div className="field">
                <label>{useBackup ? 'Backup code' : 'Authentication code'}</label>
                <input className="input" value={code} onChange={(e) => setCode(e.target.value)}
                  placeholder={useBackup ? 'e.g. a1b2c3d4' : '123456'} autoFocus required />
              </div>
              {error && <div className="error">{error}</div>}
              <button className="btn primary block mt8" disabled={busy}>{busy ? 'Verifying…' : 'Verify'}</button>
            </form>
            <div className="subtle mt16" style={{ textAlign: 'center' }}>
              <button className="btn sm" onClick={() => { setUseBackup(!useBackup); setCode(''); setError(''); }}>
                {useBackup ? 'Use authenticator code' : 'Use a backup code'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand" style={{ fontSize: 24, textAlign: 'center' }}>LeadOS</div>
        <div className="card card-pad mt16">
          <div className="h1">Welcome back</div>
          <p className="subtle" style={{ marginTop: 0 }}>Sign in to your workspace.</p>
          <form onSubmit={submit}>
            <div className="field">
              <label>Email</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label>Password</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <div className="error">{error}</div>}
            <button className="btn primary block mt8" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
          <GoogleButton />
          <div className="subtle mt16" style={{ textAlign: 'center' }}>
            No account? <Link to="/signup" style={{ color: 'var(--primary)' }}>Create one</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
