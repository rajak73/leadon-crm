import os from 'node:os';
import { z } from 'zod';

const DEV_JWT_SECRET = 'dev-only-insecure-jwt-secret-change-me-please';
const DEV_DATABASE_URL = 'postgresql://localhost:5432/leados_v2';

/**
 * Parses "true"/"false"/"1"/"0"/"yes"/"no" properly (z.coerce.boolean() treats "false" as true).
 * Undefined when unset so the default can depend on other values.
 */
const optionalBooleanFlag = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (v === undefined || v.trim() === '') return undefined;
    const s = v.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(s)) return true;
    if (['false', '0', 'no', 'off'].includes(s)) return false;
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Expected true or false' });
    return z.NEVER;
  });

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalString = () => z.preprocess(emptyToUndefined, z.string().trim().optional());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL must be a postgresql:// connection string')
      .default(DEV_DATABASE_URL),
  ),
  // Direct (non-pooled) connection for migrations, e.g. Neon's host without "-pooler".
  DATABASE_DIRECT_URL: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .regex(/^postgres(ql)?:\/\//, 'DATABASE_DIRECT_URL must be a postgresql:// connection string')
      .optional(),
  ),
  JWT_SECRET: z.string().default(DEV_JWT_SECRET),
  APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  // AI provider (lead scoring + Instagram replies). See modules/ai/ai.provider.ts.
  AI_PROVIDER: z.preprocess(
    (v) => (typeof v === 'string' ? emptyToUndefined(v.trim().toLowerCase()) : v),
    z.enum(['gemini', 'groq', 'openai']).optional(),
  ),
  AI_MODEL: optionalString(),
  GEMINI_API_KEY: optionalString(),
  GROQ_API_KEY: optionalString(),
  OPENAI_API_KEY: optionalString(),
  OPENAI_MODEL: optionalString(), // legacy alias for AI_MODEL when the provider is openai
  // Instagram
  INSTAGRAM_GRAPH_VERSION: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^v\d+\.\d+$/, 'Expected a version like v23.0')
      .default('v23.0'),
  ),
  INSTAGRAM_TEST_MODE: optionalBooleanFlag,
  META_APP_SECRET: optionalString(),
  META_WEBHOOK_VERIFY_TOKEN: optionalString(),
  // Names used by the previous LeadOS deployment; accepted so existing hosting settings keep working.
  INSTAGRAM_APP_SECRET: optionalString(),
  INSTAGRAM_WEBHOOK_VERIFY_TOKEN: optionalString(),
  // Long-lived Instagram token. When set, the account connects itself on start-up.
  INSTAGRAM_ACCESS_TOKEN: optionalString(),
  PUBLIC_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  ENCRYPTION_KEY: z.preprocess(
    emptyToUndefined,
    z.string().min(32, 'ENCRYPTION_KEY must be at least 32 characters').optional(),
  ),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
  // true/false, or the number of proxy hops in front of the app (e.g. 2 when a CDN proxies to
  // a load balancer). Used so rate limiting sees the real client IP.
  TRUST_PROXY: z
    .string()
    .optional()
    .transform((v, ctx): boolean | number => {
      if (v === undefined || v.trim() === '') return false;
      const s = v.trim().toLowerCase();
      if (/^\d+$/.test(s)) return Number(s);
      if (['true', 'yes', 'on'].includes(s)) return true;
      if (['false', 'no', 'off'].includes(s)) return false;
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Expected true, false or a number' });
      return z.NEVER;
    }),
  WEB_DIST_DIR: z.preprocess(emptyToUndefined, z.string().optional()),
  SEED_ADMIN_EMAIL: z.preprocess(emptyToUndefined, z.string().email().optional()),
  SEED_ADMIN_PASSWORD: z.preprocess(emptyToUndefined, z.string().min(8).optional()),
});

export type Env = Omit<z.infer<typeof schema>, 'INSTAGRAM_TEST_MODE'> & {
  LOG_LEVEL: string;
  DATABASE_URL: string;
  /** Always set: falls back to DATABASE_URL. */
  DATABASE_DIRECT_URL: string;
  /** Sandbox Instagram adapter + simulate endpoint. Default: on in development only. */
  INSTAGRAM_TEST_MODE: boolean;
};

/**
 * Prisma (unlike psql/libpq) doesn't default the user name, so `postgresql://localhost/db`
 * fails. Fill in $PGUSER or the OS user when the URL has none, as psql would.
 */
export function withDefaultUser(url: string): string {
  try {
    const u = new URL(url);
    if (u.username) return url;
    u.username = encodeURIComponent(process.env.PGUSER || os.userInfo().username);
    return u.toString();
  } catch {
    return url;
  }
}

function loadEnv(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    console.error(`Invalid environment configuration:\n${problems}`);
    process.exit(1);
  }
  const env = parsed.data;
  if (
    env.NODE_ENV === 'production' &&
    (env.JWT_SECRET === DEV_JWT_SECRET || env.JWT_SECRET.length < 32)
  ) {
    console.error(
      'JWT_SECRET must be set to a random value of at least 32 characters in production.',
    );
    process.exit(1);
  }
  if (env.NODE_ENV === 'production' && !process.env.DATABASE_URL?.trim()) {
    console.error('DATABASE_URL must be set in production (a postgresql:// connection string).');
    process.exit(1);
  }
  // prisma/schema.prisma references DATABASE_DIRECT_URL, so it must exist for the Prisma CLI.
  const databaseUrl = withDefaultUser(env.DATABASE_URL);
  const directUrl = withDefaultUser(env.DATABASE_DIRECT_URL ?? env.DATABASE_URL);
  process.env.DATABASE_DIRECT_URL = directUrl;
  return {
    ...env,
    DATABASE_URL: databaseUrl,
    DATABASE_DIRECT_URL: directUrl,
    LOG_LEVEL: env.LOG_LEVEL ?? (env.NODE_ENV === 'test' ? 'silent' : 'info'),
    INSTAGRAM_TEST_MODE: env.INSTAGRAM_TEST_MODE ?? env.NODE_ENV === 'development',
    PUBLIC_URL: env.PUBLIC_URL?.replace(/\/+$/, ''),
    META_APP_SECRET: env.META_APP_SECRET ?? env.INSTAGRAM_APP_SECRET,
    META_WEBHOOK_VERIFY_TOKEN: env.META_WEBHOOK_VERIFY_TOKEN ?? env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN,
  };
}

export const env: Env = loadEnv();
export const isProduction = env.NODE_ENV === 'production';
