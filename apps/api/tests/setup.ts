/**
 * Runs before any test module imports config/prisma. Points the app at an
 * isolated Postgres test DB (matches the schema's postgresql provider — see
 * helpers.ts) and sets deterministic secrets.
 */
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://localhost:5432/leados_test';
process.env.TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY ?? 'test-token-encryption-key';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-1234567890';
process.env.CRON_SECRET = 'test-cron-secret';
process.env.WEB_ORIGIN = '*';
process.env.FLAG_AI_SCORING_ENABLED = 'false';
process.env.ENFORCE_PLAN_LIMITS = 'true';
// Meta creds for signature tests.
process.env.META_APP_SECRET = 'test_app_secret';
process.env.META_WEBHOOK_VERIFY_TOKEN = 'test_verify_token';
