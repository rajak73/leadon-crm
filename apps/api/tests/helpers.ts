import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, '..');

// Isolated Postgres test database — never touches dev data. The schema's
// datasource provider is "postgresql" (Neon in prod), so the test DB must be
// too; a sqlite `file:` URL cannot be pushed against a postgresql-provider
// schema. Override via TEST_DATABASE_URL if the default local socket differs.
export const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://localhost:5432/leados_test';

/** Reset the test DB and (re)apply the Prisma schema. Call once in globalSetup. */
export function prepareTestDb() {
  execSync('npx prisma db push --skip-generate --accept-data-loss --force-reset', {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: 'ignore',
  });
}

export function cleanupTestDb() {
  // Schema is dropped/recreated by --force-reset on the next run; nothing to
  // clean up between runs for a real database.
}

/** Unique email generator for isolated test accounts. */
export function uniqueEmail(prefix = 'user') {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@test.local`;
}
