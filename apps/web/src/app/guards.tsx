import { Navigate, Outlet, useLocation } from 'react-router';
import { ShieldAlert } from 'lucide-react';
import { useSession } from '@/providers/session';
import { FullPageSpinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { buttonClasses } from '@/components/ui/button';
import { Link } from 'react-router';

/** Signed-in area. Sends people to /setup on first run and /login otherwise. */
export function RequireAuth() {
  const { status } = useSession();
  const location = useLocation();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'needs-setup') return <Navigate to="/setup" replace />;
  if (status === 'unauthenticated') {
    const from = location.pathname + location.search;
    return <Navigate to="/login" replace state={from !== '/dashboard' ? { from } : undefined} />;
  }
  return <Outlet />;
}

/** Login screen: skip it when already signed in. */
export function PublicOnly() {
  const { status } = useSession();
  const location = useLocation();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'needs-setup' && location.pathname !== '/setup')
    return <Navigate to="/setup" replace />;
  if (status !== 'needs-setup' && location.pathname === '/setup')
    return <Navigate to={status === 'authenticated' ? '/dashboard' : '/login'} replace />;
  if (status === 'authenticated') {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from || '/dashboard'} replace />;
  }
  return <Outlet />;
}

/** Admin-only pages. Members see a friendly explanation instead. */
export function RequireAdmin() {
  const { isAdmin } = useSession();
  if (!isAdmin)
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Only admins can open this page"
        text="Ask an admin on your team if you need something changed here."
        action={
          <Link to="/dashboard" className={buttonClasses({ variant: 'secondary' })}>
            Back to dashboard
          </Link>
        }
      />
    );
  return <Outlet />;
}
