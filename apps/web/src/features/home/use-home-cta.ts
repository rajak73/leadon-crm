import { useSession } from '@/providers/session';

export interface HomeCta {
  to: string;
  label: string;
}

/** Where the main call-to-action goes depends on who is looking at the page. */
export function useHomeCta(): HomeCta & { signedIn: boolean } {
  const { status } = useSession();
  if (status === 'authenticated')
    return { to: '/dashboard', label: 'Open dashboard', signedIn: true };
  if (status === 'needs-setup') return { to: '/setup', label: 'Set up LeadOS', signedIn: false };
  return { to: '/login', label: 'Sign in', signedIn: false };
}
