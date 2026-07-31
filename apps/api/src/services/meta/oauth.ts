/**
 * Instagram Business Account connection via Meta OAuth. Mirrors the Google
 * SSO pattern in services/sso.ts: a signed short-lived JWT carries state
 * across the redirect, plain fetch() calls against the Graph API, blank
 * credentials → feature disabled.
 *
 * Supports two, mutually incompatible Meta connection modes (config.meta.apiMode):
 *
 *  - 'facebook_login' (Facebook Login for Business): the org authorizes via
 *    facebook.com, we list their Facebook Pages, find which have a linked IG
 *    Business Account, they pick one if there's more than one, we get a Page
 *    access token. Calls go to graph.facebook.com.
 *  - 'instagram_login' (Instagram API with Instagram Login): the org
 *    authorizes directly via instagram.com — no Facebook Page involved at
 *    all, one account = one token, no picker step needed. Calls go to
 *    graph.instagram.com. Token exchange uses different grant types
 *    (ig_exchange_token / ig_refresh_token, not fb_exchange_token).
 */
import { config, isInstagramOAuthConfigured } from '../../config.js';
import { prisma } from '../../prisma.js';
import { encryptSecret, decryptSecret } from '../../lib/crypto.js';
import { igGraphBase } from './graph.js';

const GRAPH_VERSION = config.meta.graphVersion;
const FACEBOOK_GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export { isInstagramOAuthConfigured };

export function getInstagramConnectUrl(state: string): string | null {
  if (!isInstagramOAuthConfigured()) return null;

  if (config.meta.apiMode === 'instagram_login') {
    const params = new URLSearchParams({
      client_id: config.meta.igAppId,
      redirect_uri: config.meta.igRedirectUri,
      response_type: 'code',
      scope: ['instagram_business_basic', 'instagram_business_manage_messages', 'instagram_business_manage_comments'].join(','),
      state,
    });
    return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
  }

  const params = new URLSearchParams({
    client_id: config.meta.igAppId,
    redirect_uri: config.meta.igRedirectUri,
    response_type: 'code',
    scope: [
      'instagram_basic',
      'instagram_manage_messages',
      'instagram_manage_comments',
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_metadata',
    ].join(','),
    state,
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

interface TokenResult {
  accessToken: string;
  expiresInSeconds?: number;
}

// ---------------------------------------------------------------------------
// facebook_login mode
// ---------------------------------------------------------------------------

/** Exchange an OAuth `code` for a short-lived user access token. */
export async function exchangeCodeForUserToken(code: string): Promise<TokenResult> {
  const params = new URLSearchParams({
    client_id: config.meta.igAppId,
    client_secret: config.meta.igAppSecret,
    redirect_uri: config.meta.igRedirectUri,
    code,
  });
  const res = await fetch(`${FACEBOOK_GRAPH_BASE}/oauth/access_token?${params.toString()}`);
  if (!res.ok) throw new Error(`Meta code exchange failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  return { accessToken: data.access_token, expiresInSeconds: data.expires_in };
}

/** Upgrade a short-lived user token to a long-lived one (~60 days). */
export async function getLongLivedToken(shortToken: string): Promise<TokenResult> {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: config.meta.igAppId,
    client_secret: config.meta.igAppSecret,
    fb_exchange_token: shortToken,
  });
  const res = await fetch(`${FACEBOOK_GRAPH_BASE}/oauth/access_token?${params.toString()}`);
  if (!res.ok) throw new Error(`Meta long-lived token exchange failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  return { accessToken: data.access_token, expiresInSeconds: data.expires_in };
}

export interface EligiblePage {
  pageId: string; // for instagram_login mode this is the IG user id itself (no real Page)
  pageName: string;
  pageAccessToken: string;
  igUserId: string;
  igUsername?: string;
}

/** List the user's Facebook Pages that have a linked Instagram Business Account. */
export async function listPagesWithInstagram(userToken: string): Promise<EligiblePage[]> {
  const res = await fetch(
    `${FACEBOOK_GRAPH_BASE}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(userToken)}`
  );
  if (!res.ok) throw new Error(`Meta pages lookup failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  const pages: any[] = data.data ?? [];
  return pages
    .filter((p) => p.instagram_business_account?.id)
    .map((p) => ({
      pageId: p.id,
      pageName: p.name,
      pageAccessToken: p.access_token,
      igUserId: p.instagram_business_account.id,
      igUsername: p.instagram_business_account.username,
    }));
}

// ---------------------------------------------------------------------------
// instagram_login mode
// ---------------------------------------------------------------------------

/** Exchange an OAuth `code` for a short-lived (~1h) Instagram user token. */
export async function exchangeCodeForInstagramLoginToken(code: string): Promise<TokenResult & { userId: string }> {
  const body = new URLSearchParams({
    client_id: config.meta.igAppId,
    client_secret: config.meta.igAppSecret,
    grant_type: 'authorization_code',
    redirect_uri: config.meta.igRedirectUri,
    code,
  });
  const res = await fetch('https://api.instagram.com/oauth/access_token', { method: 'POST', body });
  if (!res.ok) throw new Error(`Instagram code exchange failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  return { accessToken: data.access_token, userId: String(data.user_id) };
}

/** Upgrade a short-lived Instagram Login token to a long-lived one (~60 days). */
export async function getInstagramLoginLongLivedToken(shortToken: string): Promise<TokenResult> {
  const params = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: config.meta.igAppSecret,
    access_token: shortToken,
  });
  const res = await fetch(`https://graph.instagram.com/access_token?${params.toString()}`);
  if (!res.ok) throw new Error(`Instagram long-lived token exchange failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  return { accessToken: data.access_token, expiresInSeconds: data.expires_in };
}

/** Refresh a long-lived Instagram Login token before it expires. */
export async function refreshInstagramLoginToken(token: string): Promise<TokenResult> {
  const params = new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: token });
  const res = await fetch(`https://graph.instagram.com/refresh_access_token?${params.toString()}`);
  if (!res.ok) throw new Error(`Instagram token refresh failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  return { accessToken: data.access_token, expiresInSeconds: data.expires_in };
}

/**
 * Fetch the connected account's canonical id + username via /me. The id
 * returned by the OAuth token exchange (used as a fallback here) is NOT
 * always the same id Meta uses in webhook `entry.id` — confirmed empirically:
 * a real webhook delivery referenced a different numeric id than what the
 * token exchange returned for the same account. /me?fields=id,username is
 * the canonical "who does this token belong to" identity and is what
 * webhook events actually reference, so it must be used as the stored
 * externalId, not the token-exchange userId.
 */
export async function getInstagramLoginProfile(
  userId: string,
  accessToken: string
): Promise<{ id: string; username?: string }> {
  const res = await fetch(`${igGraphBase()}/me?fields=id,username&access_token=${encodeURIComponent(accessToken)}`);
  if (!res.ok) return { id: userId };
  const data: any = await res.json().catch(() => ({}));
  return { id: data.id ?? userId, username: data.username };
}

// ---------------------------------------------------------------------------
// Shared (both modes)
// ---------------------------------------------------------------------------

/** Subscribe an account to the webhook fields our app needs (messages + comments). */
export async function subscribePageWebhook(pageOrUserId: string, accessToken: string): Promise<void> {
  const params = new URLSearchParams({ subscribed_fields: 'messages,comments', access_token: accessToken });
  const res = await fetch(`${igGraphBase()}/${pageOrUserId}/subscribed_apps?${params.toString()}`, { method: 'POST' });
  if (!res.ok) throw new Error(`Webhook subscribe failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/** Best-effort unsubscribe on disconnect. */
export async function unsubscribePageWebhook(pageOrUserId: string, accessToken: string): Promise<void> {
  await fetch(`${igGraphBase()}/${pageOrUserId}/subscribed_apps?access_token=${encodeURIComponent(accessToken)}`, {
    method: 'DELETE',
  }).catch(() => undefined);
}

/**
 * Persist a chosen account's Instagram connection for an org: upsert the
 * IntegrationAccount, subscribe the webhook, store the encrypted token.
 */
export async function connectInstagramAccount(
  organizationId: string,
  page: EligiblePage,
  longLivedToken: string,
  expiresInSeconds: number | undefined
): Promise<void> {
  await subscribePageWebhook(page.pageId, page.pageAccessToken);

  const tokenExpiresAt = expiresInSeconds ? new Date(Date.now() + expiresInSeconds * 1000) : null;
  const existing = await prisma.integrationAccount.findFirst({
    where: { organizationId, provider: 'INSTAGRAM', externalId: page.igUserId },
  });

  const data = {
    displayName: page.igUsername ?? page.pageName,
    accessToken: encryptSecret(page.pageAccessToken),
    pageId: page.pageId,
    igUserId: page.igUserId,
    tokenExpiresAt,
    webhookSubscribed: true,
    isConnected: true,
  };

  if (existing) {
    await prisma.integrationAccount.update({ where: { id: existing.id }, data });
  } else {
    await prisma.integrationAccount.create({
      data: { organizationId, provider: 'INSTAGRAM', externalId: page.igUserId, ...data },
    });
  }
}

/** Refresh tokens expiring within the next 7 days (called from the cron drain). */
export async function refreshExpiringInstagramTokens(): Promise<{ refreshed: number; failed: number }> {
  if (!isInstagramOAuthConfigured()) return { refreshed: 0, failed: 0 };
  const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const accounts = await prisma.integrationAccount.findMany({
    where: { provider: 'INSTAGRAM', isConnected: true, tokenExpiresAt: { lte: soon } },
  });

  let refreshed = 0;
  let failed = 0;
  const refresh = config.meta.apiMode === 'instagram_login' ? refreshInstagramLoginToken : getLongLivedToken;
  for (const account of accounts) {
    try {
      const currentToken = decryptSecret(account.accessToken);
      if (!currentToken) throw new Error('No token to refresh');
      const { accessToken, expiresInSeconds } = await refresh(currentToken);
      await prisma.integrationAccount.update({
        where: { id: account.id },
        data: {
          accessToken: encryptSecret(accessToken),
          tokenExpiresAt: expiresInSeconds ? new Date(Date.now() + expiresInSeconds * 1000) : null,
        },
      });
      refreshed++;
    } catch {
      failed++;
    }
  }
  return { refreshed, failed };
}
