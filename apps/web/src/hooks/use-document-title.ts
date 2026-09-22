import { useEffect } from 'react';
import { useSettings } from '@/api/account';

/** Sets the tab title, e.g. "Leads · Acme" (falls back to LeadOS). */
export function useDocumentTitle(title: string | null | undefined) {
  const { data: settings } = useSettings();
  const suffix = settings?.companyName || 'LeadOS';
  useEffect(() => {
    document.title = title ? `${title} · ${suffix}` : suffix;
  }, [title, suffix]);
}

/** Variant for public pages (no API calls). */
export function usePublicDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · LeadOS`;
  }, [title]);
}
