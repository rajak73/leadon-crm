import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setToken, setOrgId, getOrgId } from './api';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isSuperAdmin: boolean;
}
export interface Org {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: string;
  status?: string;
}

interface AuthState {
  user: User | null;
  orgs: Org[];
  currentOrg: Org | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ twoFactorRequired: boolean; challenge?: string }>;
  loginWithToken: (token: string) => Promise<void>;
  verify2fa: (challenge: string, code: string, isBackup?: boolean) => Promise<void>;
  signup: (data: SignupData) => Promise<void>;
  logout: () => void;
  switchOrg: (orgId: string) => void;
}

interface SignupData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  workspaceName: string;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [currentOrg, setCurrentOrg] = useState<Org | null>(null);
  const [loading, setLoading] = useState(true);

  function applySession(u: User, o: Org[]) {
    setUser(u);
    setOrgs(o);
    const savedId = getOrgId();
    const found = o.find((x) => x.organizationId === savedId) || o[0] || null;
    setCurrentOrg(found);
    if (found) setOrgId(found.organizationId);
  }

  useEffect(() => {
    const t = localStorage.getItem('leados_token');
    if (!t) {
      setLoading(false);
      return;
    }
    api
      .get<{ user: User; organizations: Org[] }>('/api/v1/auth/me', false)
      .then((r) => applySession(r.user, r.organizations))
      .catch(() => {
        setToken(null);
        setOrgId(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const r = await api.post<{ token?: string; user?: User; organizations?: Org[]; twoFactorRequired?: boolean; challenge?: string }>(
      '/api/v1/auth/login',
      { email, password },
      false
    );
    // 2FA-enabled accounts return a challenge; the caller must complete via verify2fa.
    if (r.twoFactorRequired && r.challenge) {
      return { twoFactorRequired: true as const, challenge: r.challenge };
    }
    setToken(r.token!);
    applySession(r.user!, r.organizations!);
    return { twoFactorRequired: false as const };
  }

  async function loginWithToken(token: string) {
    setToken(token);
    const r = await api.get<{ user: User; organizations: Org[] }>('/api/v1/auth/me', false);
    applySession(r.user, r.organizations);
  }

  async function verify2fa(challenge: string, code: string, isBackup = false) {
    const body = isBackup ? { challenge, backupCode: code } : { challenge, token: code };
    const r = await api.post<{ token: string; user: User; organizations: Org[] }>(
      '/api/v1/2fa/login-verify',
      body,
      false
    );
    setToken(r.token);
    applySession(r.user, r.organizations);
  }

  async function signup(data: SignupData) {
    const r = await api.post<{ token: string; user: User; organizations: Org[] }>(
      '/api/v1/auth/signup',
      data,
      false
    );
    setToken(r.token);
    applySession(r.user, r.organizations);
  }

  function logout() {
    setToken(null);
    setOrgId(null);
    setUser(null);
    setOrgs([]);
    setCurrentOrg(null);
  }

  function switchOrg(id: string) {
    const found = orgs.find((o) => o.organizationId === id);
    if (found) {
      setCurrentOrg(found);
      setOrgId(id);
    }
  }

  return (
    <AuthContext.Provider
      value={{ user, orgs, currentOrg, loading, login, loginWithToken, verify2fa, signup, logout, switchOrg }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
