import crypto from 'node:crypto';
import { env } from '../../config/env.js';

/**
 * Every Instagram Graph API call goes through this interface (Instagram API with Instagram
 * Login, graph.instagram.com). In test mode (INSTAGRAM_TEST_MODE) the in-process sandbox is
 * used instead, so the whole flow runs on localhost and in tests without network access.
 */

export interface IgMe {
  userId: string; // `user_id` — the professional account id used in webhooks
  username: string;
  name: string | null;
  profilePictureUrl: string | null;
}

export interface IgUserProfile {
  username: string | null;
  name: string | null;
  profilePictureUrl: string | null;
}

export interface IgMedia {
  permalink: string | null;
  caption: string | null;
  thumbnailUrl: string | null;
}

export interface IgTokenRefresh {
  accessToken: string;
  expiresInSeconds: number | null;
}

export interface InstagramAdapter {
  readonly kind: 'meta' | 'sandbox';
  getMe(token: string): Promise<IgMe>;
  subscribeApp(token: string): Promise<void>;
  unsubscribeApp(token: string): Promise<void>;
  refreshToken(token: string): Promise<IgTokenRefresh>;
  getUserProfile(token: string, igsid: string): Promise<IgUserProfile>;
  getMedia(token: string, mediaId: string): Promise<IgMedia>;
  /** Returns the Instagram message id. */
  sendMessage(token: string, igsid: string, text: string): Promise<{ mid: string }>;
  /** DM to the author of a comment (one per comment, within 7 days). */
  sendPrivateReply(token: string, commentId: string, text: string): Promise<{ mid: string }>;
  /** Public reply under a comment. Returns the new comment's id. */
  replyToComment(token: string, commentId: string, text: string): Promise<{ id: string }>;
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export type GraphErrorKind =
  | 'auth'
  | 'window'
  | 'unavailable'
  | 'rate_limit'
  | 'permission'
  | 'invalid'
  | 'network'
  | 'other';

/** A Graph API failure with a message that is safe to show to users. */
export class GraphError extends Error {
  constructor(
    message: string,
    readonly kind: GraphErrorKind,
    readonly code: number | null = null,
    readonly subcode: number | null = null,
    readonly detail: string | null = null, // Meta's raw message (logged, never shown)
  ) {
    super(message);
    this.name = 'GraphError';
  }
}

export const TOKEN_EXPIRED_MESSAGE =
  'Instagram access has expired or was revoked. Reconnect your account in Settings → Instagram.';

/** Maps Meta's error payload to a friendly GraphError. */
export function toGraphError(
  status: number,
  error: { message?: string; code?: number; error_subcode?: number } | undefined,
): GraphError {
  const code = typeof error?.code === 'number' ? error.code : null;
  const subcode = typeof error?.error_subcode === 'number' ? error.error_subcode : null;
  const raw = error?.message ?? `HTTP ${status}`;
  const make = (message: string, kind: GraphErrorKind) =>
    new GraphError(message, kind, code, subcode, raw);

  if (code === 190 || status === 401) return make(TOKEN_EXPIRED_MESSAGE, 'auth');
  if (subcode === 2534022 || /outside of allowed window/i.test(raw))
    return make('The 24-hour reply window has closed.', 'window');
  if (code === 551 || subcode === 1545041)
    return make("This person isn't available on Instagram right now.", 'unavailable');
  if (code !== null && [4, 17, 32, 613].includes(code))
    return make(
      'Instagram is limiting requests right now. Try again in a few minutes.',
      'rate_limit',
    );
  if (code === 10 || code === 200 || (code !== null && code >= 200 && code < 300))
    return make(
      "Instagram didn't allow this. Check the app's permissions in the Meta dashboard.",
      'permission',
    );
  if (code === 100)
    return make(
      'Instagram rejected the request. The post or comment may have been deleted.',
      'invalid',
    );
  return make('Instagram rejected the message.', 'other');
}

// ─── Meta (real) ─────────────────────────────────────────────────────────────

const GRAPH_HOST = 'https://graph.instagram.com';
const REQUEST_TIMEOUT_MS = 15_000;

type Json = Record<string, unknown>;

async function graph(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  token: string,
  options: { query?: Record<string, string>; body?: Json; versioned?: boolean } = {},
): Promise<Json> {
  const base =
    options.versioned === false ? GRAPH_HOST : `${GRAPH_HOST}/${env.INSTAGRAM_GRAPH_VERSION}`;
  const url = new URL(`${base}${path}`);
  for (const [k, v] of Object.entries(options.query ?? {})) url.searchParams.set(k, v);
  url.searchParams.set('access_token', token);

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new GraphError(
      "Couldn't reach Instagram. Check the server's internet connection and try again.",
      'network',
      null,
      null,
      err instanceof Error ? err.message : String(err),
    );
  }
  let payload: Json = {};
  try {
    payload = (await res.json()) as Json;
  } catch {
    // non-JSON body (rare) — handled below by status
  }
  if (!res.ok || payload.error) {
    throw toGraphError(res.status, payload.error as Parameters<typeof toGraphError>[1]);
  }
  return payload;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

export class MetaInstagramAdapter implements InstagramAdapter {
  readonly kind = 'meta' as const;

  async getMe(token: string): Promise<IgMe> {
    const me = await graph('GET', '/me', token, {
      query: { fields: 'user_id,username,name,profile_picture_url' },
    });
    const userId =
      str(me.user_id) ?? (me.user_id != null ? String(me.user_id) : null) ?? str(me.id);
    const username = str(me.username);
    if (!userId || !username)
      throw new GraphError("Instagram didn't return the account details.", 'other');
    return { userId, username, name: str(me.name), profilePictureUrl: str(me.profile_picture_url) };
  }

  async subscribeApp(token: string): Promise<void> {
    await graph('POST', '/me/subscribed_apps', token, {
      query: { subscribed_fields: 'messages,comments' },
    });
  }

  async unsubscribeApp(token: string): Promise<void> {
    await graph('DELETE', '/me/subscribed_apps', token);
  }

  async refreshToken(token: string): Promise<IgTokenRefresh> {
    const r = await graph('GET', '/refresh_access_token', token, {
      query: { grant_type: 'ig_refresh_token' },
      versioned: false,
    });
    const accessToken = str(r.access_token);
    if (!accessToken) throw new GraphError("Instagram didn't return a new token.", 'other');
    return {
      accessToken,
      expiresInSeconds: typeof r.expires_in === 'number' ? r.expires_in : null,
    };
  }

  async getUserProfile(token: string, igsid: string): Promise<IgUserProfile> {
    const p = await graph('GET', `/${encodeURIComponent(igsid)}`, token, {
      query: { fields: 'name,username,profile_pic' },
    });
    return { username: str(p.username), name: str(p.name), profilePictureUrl: str(p.profile_pic) };
  }

  async getMedia(token: string, mediaId: string): Promise<IgMedia> {
    const m = await graph('GET', `/${encodeURIComponent(mediaId)}`, token, {
      query: { fields: 'permalink,caption,thumbnail_url,media_url,media_type' },
    });
    return {
      permalink: str(m.permalink),
      caption: str(m.caption),
      // Videos have a thumbnail_url; images only a media_url.
      thumbnailUrl: str(m.thumbnail_url) ?? (m.media_type === 'VIDEO' ? null : str(m.media_url)),
    };
  }

  async sendMessage(token: string, igsid: string, text: string): Promise<{ mid: string }> {
    const r = await graph('POST', '/me/messages', token, {
      body: { recipient: { id: igsid }, message: { text } },
    });
    return { mid: str(r.message_id) ?? `unknown-${crypto.randomUUID()}` };
  }

  async sendPrivateReply(token: string, commentId: string, text: string): Promise<{ mid: string }> {
    const r = await graph('POST', '/me/messages', token, {
      body: { recipient: { comment_id: commentId }, message: { text } },
    });
    return { mid: str(r.message_id) ?? `unknown-${crypto.randomUUID()}` };
  }

  async replyToComment(token: string, commentId: string, text: string): Promise<{ id: string }> {
    const r = await graph('POST', `/${encodeURIComponent(commentId)}/replies`, token, {
      body: { message: text },
    });
    return { id: str(r.id) ?? `unknown-${crypto.randomUUID()}` };
  }
}

// ─── Sandbox (test mode) ─────────────────────────────────────────────────────

export const SANDBOX_ACCOUNT: IgMe = {
  userId: '17841400000000001',
  username: 'leados_test',
  name: 'Test account',
  profilePictureUrl: null,
};

/** Deterministic, in-process stand-in for the Graph API. Sends always succeed with fake ids. */
export class SandboxInstagramAdapter implements InstagramAdapter {
  readonly kind = 'sandbox' as const;
  private readonly profiles = new Map<string, IgUserProfile>();

  /** Lets /instagram/simulate make profile lookups return the simulated username. */
  registerProfile(igsid: string, profile: Partial<IgUserProfile>): void {
    this.profiles.set(igsid, {
      username: profile.username ?? null,
      name: profile.name ?? null,
      profilePictureUrl: profile.profilePictureUrl ?? null,
    });
  }

  async getMe(): Promise<IgMe> {
    return { ...SANDBOX_ACCOUNT };
  }
  async subscribeApp(): Promise<void> {}
  async unsubscribeApp(): Promise<void> {}
  async refreshToken(token: string): Promise<IgTokenRefresh> {
    return { accessToken: token, expiresInSeconds: 60 * 24 * 60 * 60 };
  }
  async getUserProfile(_token: string, igsid: string): Promise<IgUserProfile> {
    return this.profiles.get(igsid) ?? { username: null, name: null, profilePictureUrl: null };
  }
  async getMedia(_token: string, mediaId: string): Promise<IgMedia> {
    return {
      permalink: `https://www.instagram.com/p/${mediaId}/`,
      caption: 'Test post',
      thumbnailUrl: null,
    };
  }
  async sendMessage(): Promise<{ mid: string }> {
    return { mid: `sandbox_mid_${crypto.randomUUID()}` };
  }
  async sendPrivateReply(): Promise<{ mid: string }> {
    return { mid: `sandbox_mid_${crypto.randomUUID()}` };
  }
  async replyToComment(): Promise<{ id: string }> {
    return { id: `sandbox_comment_${crypto.randomUUID()}` };
  }
}

export const sandboxAdapter = new SandboxInstagramAdapter();
const metaAdapter = new MetaInstagramAdapter();

/** Chosen per call so INSTAGRAM_TEST_MODE can be flipped in tests. */
export const getAdapter = (): InstagramAdapter =>
  env.INSTAGRAM_TEST_MODE ? sandboxAdapter : metaAdapter;
