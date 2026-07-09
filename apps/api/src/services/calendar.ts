/**
 * Calendar integration (BRD §15.2). Google Calendar via OAuth 2.0.
 *
 * Free-default behavior: if Google credentials aren't configured, calendar
 * "connect" and event creation run in MOCK mode — nothing is sent to Google and
 * we never claim a real event was created (mirrors §11.3 honesty). When
 * GOOGLE_CLIENT_ID/SECRET + a connected account with a refresh token exist, we
 * exchange for an access token and create a real event.
 *
 * The connected account is stored on IntegrationAccount with
 * provider = 'GOOGLE_CALENDAR' and the refresh token in accessToken (encrypt at
 * rest in production).
 */
import { prisma } from '../prisma.js';
import { config } from '../config.js';

export const CALENDAR_PROVIDER = 'GOOGLE_CALENDAR';

export function isCalendarConfigured(): boolean {
  return Boolean(config.calendar.googleClientId && config.calendar.googleClientSecret);
}

/** Build the Google OAuth consent URL to start the connect flow. */
export function getGoogleAuthUrl(state: string): string | null {
  if (!isCalendarConfigured() || !config.calendar.googleRedirectUri) return null;
  const params = new URLSearchParams({
    client_id: config.calendar.googleClientId,
    redirect_uri: config.calendar.googleRedirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.events',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/** Exchange an OAuth code for tokens (real mode only). */
export async function exchangeCodeForTokens(code: string): Promise<{ refreshToken: string; email?: string }> {
  if (!isCalendarConfigured()) throw new Error('Calendar not configured');
  const body = new URLSearchParams({
    code,
    client_id: config.calendar.googleClientId,
    client_secret: config.calendar.googleClientSecret,
    redirect_uri: config.calendar.googleRedirectUri,
    grant_type: 'authorization_code',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Google token exchange failed ${res.status}`);
  const data: any = await res.json();
  return { refreshToken: data.refresh_token };
}

async function getAccessToken(refreshToken: string): Promise<string> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: config.calendar.googleClientId,
    client_secret: config.calendar.googleClientSecret,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Google token refresh failed ${res.status}`);
  const data: any = await res.json();
  return data.access_token;
}

export interface CalendarEventResult {
  created: boolean;
  mode: 'google' | 'mock';
  externalEventId?: string;
  reason?: string;
}

/**
 * Create a calendar event for a task's due date (BRD §15.2). Best-effort:
 * returns mode='mock' when calendar isn't connected — never throws to callers.
 */
export async function createEventForTask(params: {
  organizationId: string;
  title: string;
  dueDate: Date;
  description?: string;
}): Promise<CalendarEventResult> {
  const { organizationId, title, dueDate, description } = params;

  const account = await prisma.integrationAccount.findFirst({
    where: { organizationId, provider: CALENDAR_PROVIDER, isConnected: true },
  });

  // Mock mode: no configured creds or no connected account with a token.
  if (!isCalendarConfigured() || !account?.accessToken) {
    return { created: false, mode: 'mock', reason: 'Calendar not connected (mock).' };
  }

  try {
    const token = await getAccessToken(account.accessToken);
    const start = new Date(dueDate);
    const end = new Date(start.getTime() + 30 * 60 * 1000); // 30-min event
    const res = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          summary: title,
          description: description ?? 'Created by LeadOS',
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
        }),
      }
    );
    if (!res.ok) return { created: false, mode: 'google', reason: `Google API ${res.status}` };
    const data: any = await res.json();
    return { created: true, mode: 'google', externalEventId: data.id };
  } catch (err) {
    return { created: false, mode: 'google', reason: err instanceof Error ? err.message : 'error' };
  }
}
