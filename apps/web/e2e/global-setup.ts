import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, '../../api');

/** Reset the e2e SQLite DB and apply the schema before the servers boot. */
export default async function globalSetup() {
  const db = path.join(apiRoot, 'e2e.db');
  for (const f of [db, `${db}-journal`]) if (existsSync(f)) rmSync(f);
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: 'file:./e2e.db' },
    stdio: 'ignore',
  });
}
