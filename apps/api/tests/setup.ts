/**
 * Runs before any test module imports config/prisma. Points the app at an
 * isolated test SQLite DB and sets deterministic secrets.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, '..');

process.env.DATABASE_URL = `file:${path.join(apiRoot, 'test.db')}`;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-1234567890';
process.env.CRON_SECRET = 'test-cron-secret';
process.env.WEB_ORIGIN = '*';
process.env.FLAG_AI_SCORING_ENABLED = 'false';
process.env.ENFORCE_PLAN_LIMITS = 'true';
// Meta creds for signature tests.
process.env.META_APP_SECRET = 'test_app_secret';
process.env.META_WEBHOOK_VERIFY_TOKEN = 'test_verify_token';
