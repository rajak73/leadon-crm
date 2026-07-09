import dotenv from 'dotenv';
dotenv.config();

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

export const config = {
  port: parseInt(process.env.PORT ?? '4000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: (process.env.NODE_ENV ?? 'development') === 'production',
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',

  jwtSecret: required('JWT_SECRET', 'dev-insecure-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',

  redisUrl: process.env.REDIS_URL ?? '',
  cronSecret: process.env.CRON_SECRET ?? 'dev-cron-secret',

  // Feature flags (BRD §13.1)
  flags: {
    aiScoringEnabled: (process.env.FLAG_AI_SCORING_ENABLED ?? 'false') === 'true',
  },

  // AI providers (BRD §13.2). Keys from env only, never chat.
  ai: {
    provider: (process.env.AI_PROVIDER ?? '') as '' | 'openai' | 'groq' | 'gemini',
    model: process.env.AI_MODEL ?? '',
    openaiKey: process.env.OPENAI_API_KEY ?? '',
    groqKey: process.env.GROQ_API_KEY ?? '',
    geminiKey: process.env.GEMINI_API_KEY ?? '',
  },

  // Demo seed guardrail (BRD §18)
  allowDemoSeed: (process.env.ALLOW_DEMO_SEED ?? 'false') === 'true',

  // Notifications / email (BRD §14.4, §15.2). Free default: console/no-op.
  notify: {
    emailEnabled: (process.env.EMAIL_ENABLED ?? 'false') === 'true',
    smtpUrl: process.env.SMTP_URL ?? '',
    fromEmail: process.env.FROM_EMAIL ?? 'no-reply@leados.example',
  },

  // Calendar integration (BRD §15.2). Google Calendar via OAuth. Blank creds →
  // mock mode (events recorded locally, no external call).
  calendar: {
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI ?? '',
  },

  // SSO — Google login (OAuth 2.0). Reuses the Google app credentials; separate
  // redirect URI. Blank → SSO disabled (password login still works).
  sso: {
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    googleLoginRedirectUri: process.env.GOOGLE_LOGIN_REDIRECT_URI ?? '',
  },

  // Billing / Stripe (BRD §15.2). Blank keys → billing runs in mock mode.
  billing: {
    stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    enforceLimits: (process.env.ENFORCE_PLAN_LIMITS ?? 'true') === 'true',
  },

  // Meta (BRD §16) — presence gates real sends (BRD §11.3)
  meta: {
    appSecret: process.env.META_APP_SECRET ?? '',
    igAppId: process.env.INSTAGRAM_APP_ID ?? '',
    igAppSecret: process.env.INSTAGRAM_APP_SECRET ?? '',
    waPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
    waAccessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? '',
    webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN ?? '',
  },
};

/** True only when the given channel has real credentials configured. */
export function hasRealMetaCreds(channel: 'INSTAGRAM' | 'WHATSAPP' | 'FACEBOOK'): boolean {
  if (channel === 'WHATSAPP') {
    return Boolean(config.meta.waPhoneNumberId && config.meta.waAccessToken);
  }
  // Instagram/Facebook both need the Meta app secret + IG app credentials.
  return Boolean(config.meta.appSecret && config.meta.igAppId && config.meta.igAppSecret);
}
