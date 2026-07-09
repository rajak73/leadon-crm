import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

/** Consumes the token from #token=... after Google redirects back, then routes in. */
export default function SsoCallback() {
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const token = hash.get('token');
    if (!token) { setError('No token returned from Google.'); return; }
    // Clear the token from the URL for safety.
    window.history.replaceState({}, '', '/sso-callback');
    loginWithToken(token)
      .then(() => navigate('/app', { replace: true }))
      .catch(() => setError('Sign-in failed. Please try again.'));
  }, []);

  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div className="brand" style={{ fontSize: 24 }}>LeadOS</div>
        <div className="card card-pad mt16">
          {error ? <div className="error">{error}</div> : <div className="subtle">Signing you in…</div>}
        </div>
      </div>
    </div>
  );
}
