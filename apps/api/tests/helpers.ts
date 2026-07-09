import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, '..');

// Isolated test database — never touches dev.db.
const TEST_DB = path.join(apiRoot, 'test.db');
export const TEST_DB_URL = `file:${TEST_DB}`;

/** Reset the test DB and (re)apply the Prisma schema. Call once in globalSetup. */
export function prepareTestDb() {
  for (const f of [TEST_DB, `${TEST_DB}-journal`]) {
    if (existsSync(f)) rmSync(f);
  }
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: 'ignore',
  });
}

export function cleanupTestDb() {
  for (const f of [TEST_DB, `${TEST_DB}-journal`]) {
    if (existsSync(f)) rmSync(f);
  }
}

/** Unique email generator for isolated test accounts. */
export function uniqueEmail(prefix = 'user') {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@test.local`;
}
