/**
 * Boot-time environment validation (BRD §19.1, §19.4). Fails fast in production
 * on missing/insecure config and prints actionable warnings in development, so
 * misconfigurations surface at startup rather than as runtime surprises.
 */
import { config } from '../config.js';

interface Check {
  ok: boolean;
  level: 'error' | 'warn';
  message: string;
}

export function validateEnv(): { ok: boolean; checks: Check[] } {
  const checks: Check[] = [];
  const prod = config.isProduction;

  const insecureSecrets = ['dev-insecure-secret-change-me', 'change-me-to-a-long-random-string', 'verify-run-secret-1234567890'];

  // JWT secret must be strong in production.
  if (!config.jwtSecret || insecureSecrets.includes(config.jwtSecret) || config.jwtSecret.length < 16) {
    checks.push({
      ok: !prod,
      level: prod ? 'error' : 'warn',
      message: 'JWT_SECRET is missing or weak. Set a long random string (>=16 chars).',
    });
  }

  // Cron secret should not be the default in production.
  if (prod && (!config.cronSecret || config.cronSecret === 'dev-cron-secret')) {
    checks.push({ ok: false, level: 'error', message: 'CRON_SECRET must be set to a non-default value in production.' });
  }

  // Database URL present.
  if (!process.env.DATABASE_URL) {
    checks.push({ ok: false, level: 'error', message: 'DATABASE_URL is required.' });
  } else if (prod && process.env.DATABASE_URL.startsWith('file:')) {
    checks.push({ ok: false, level: 'error', message: 'SQLite (file:) is not suitable for production — use Neon/PostgreSQL.' });
  }

  // WEB_ORIGIN should be explicit (not wildcard) in production for CORS safety.
  if (prod && config.webOrigin === '*') {
    checks.push({ ok: false, level: 'error', message: 'WEB_ORIGIN must be an explicit origin in production (not "*").' });
  }

  // Informational: AI enabled but no provider key.
  if (config.flags.aiScoringEnabled && !config.ai.provider) {
    checks.push({ ok: true, level: 'warn', message: 'FLAG_AI_SCORING_ENABLED=true but no AI_PROVIDER set — using rule-based fallback.' });
  }

  // Informational: demo seed allowed in production is dangerous.
  if (prod && config.allowDemoSeed) {
    checks.push({ ok: false, level: 'error', message: 'ALLOW_DEMO_SEED must be false in production (BRD §18).' });
  }

  const errors = checks.filter((c) => c.level === 'error' && !c.ok);
  return { ok: errors.length === 0, checks };
}

/** Run validation and print results. Throws in production if any error. */
export function assertEnv(): void {
  const { ok, checks } = validateEnv();
  for (const c of checks) {
    if (!c.ok && c.level === 'error') console.error(`  ✖ [env] ${c.message}`);
    else if (c.level === 'warn') console.warn(`  ⚠ [env] ${c.message}`);
  }
  if (!ok) {
    if (config.isProduction) {
      throw new Error('Environment validation failed — refusing to start in production. Fix the errors above.');
    } else {
      console.warn('  ⚠ [env] Validation issues detected (allowed in development).');
    }
  } else {
    console.log('  ✔ [env] Environment validated.');
  }
}
