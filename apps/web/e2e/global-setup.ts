import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { E2E_DATABASE_URL } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, '../../api');

/**
 * Reset the e2e Postgres DB and apply the schema before the servers boot.
 * schema.prisma's datasource provider is "postgresql", so this must be a
 * real Postgres connection string (a sqlite `file:` URL cannot be pushed
 * against a postgresql-provider schema) — see E2E_DATABASE_URL.
 */
export default async function globalSetup() {
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    stdio: 'ignore',
  });
}
