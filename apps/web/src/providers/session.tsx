import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AuthSession, AuthStatus, User } from '@leados/shared';
import { api, logoutRequest, refreshSession, session } from '@/lib/api-client';

export type SessionStatus = 'loading' | 'needs-setup' | 'authenticated' | 'unauthenticated';

interface SessionContextValue {
  status: SessionStatus;
  user: User | null;
  isAdmin: boolean;
  /** Company name from /auth/status, available before sign-in. */
  companyName: string | null;
  signIn: (s: AuthSession) => void;
  signOut: () => Promise<void>;
  setUser: (u: User) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUserState] = useState<User | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);

  // Keep React state in sync with the API client (refreshes, forced sign-outs).
  useEffect(
    () =>
      session.subscribe((s) => {
        if (s) {
          setUserState(s.user);
          setStatus('authenticated');
        } else {
          setUserState(null);
          setStatus('unauthenticated');
          qc.clear();
        }
      }),
    [qc],
  );

  // Boot: find out whether setup is needed, then try to restore the session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const st = await api.get<AuthStatus>('/auth/status');
        if (cancelled) return;
        setCompanyName(st.companyName);
        if (st.needsSetup) {
          setStatus('needs-setup');
          return;
        }
      } catch {
        /* fall through: try to refresh anyway */
      }
      const restored = await refreshSession();
      if (!cancelled && !restored) setStatus('unauthenticated');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback((s: AuthSession) => session.set(s), []);
  const signOut = useCallback(async () => {
    await logoutRequest().catch(() => undefined);
    setStatus('unauthenticated');
    setUserState(null);
    qc.clear();
  }, [qc]);
  const setUser = useCallback((u: User) => setUserState(u), []);

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      user,
      isAdmin: user?.role === 'ADMIN',
      companyName,
      signIn,
      signOut,
      setUser,
    }),
    [status, user, companyName, signIn, signOut, setUser],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}

/** The signed-in user. Only use inside authenticated routes. */
export function useCurrentUser(): User {
  const { user } = useSession();
  if (!user) throw new Error('useCurrentUser called without a signed-in user');
  return user;
}
