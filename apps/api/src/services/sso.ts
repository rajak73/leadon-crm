/**
 * Google SSO (OAuth 2.0 login). Blank credentials → SSO disabled. Reuses the
 * Google client id/secret; the login redirect URI is separate from Calendar.
 */
import { config } from '../config.js';

export function isSsoConfigured(): boolean {
  return Boolean(config.sso.googleClientId && config.sso.googleClientSecret && config.sso.googleLoginRedirectUri);
}

export function getGoogleLoginUrl(state: string): string | null {
  if (!isSsoConfigured()) return null;
  const params = new URLSearchParams({
    client_id: config.sso.googleClientId,
    redirect_uri: config.sso.googleLoginRedirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export interface GoogleProfile {
  googleId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
}

/** Exchange an OAuth code for the user's Google profile. */
export async function exchangeCodeForProfile(code: string): Promise<GoogleProfile> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.sso.googleClientId,
      client_secret: config.sso.googleClientSecret,
      redirect_uri: config.sso.googleLoginRedirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) throw new Error(`Google token exchange failed ${tokenRes.status}`);
  const tokens: any = await tokenRes.json();

  const profRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profRes.ok) throw new Error(`Google userinfo failed ${profRes.status}`);
  const p: any = await profRes.json();

  return {
    googleId: p.sub,
    email: (p.email as string).toLowerCase(),
    firstName: p.given_name || (p.name ? String(p.name).split(' ')[0] : 'User'),
    lastName: p.family_name || '',
    avatarUrl: p.picture,
  };
}
