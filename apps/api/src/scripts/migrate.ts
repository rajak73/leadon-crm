/**
 * Runs Prisma CLI commands against the same database the app uses (DATABASE_URL, defaulting to
 * postgresql://localhost:5432/leados_v2). Migrations use DATABASE_DIRECT_URL when it is set
 * (Neon: the direct, non-pooled host) and DATABASE_URL otherwise.
 *   (default)  prisma migrate deploy      — apply pending migrations (also run on every deploy)
 *   --create   prisma migrate dev          — create a new migration (development)
 *   --studio   prisma studio
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { env } from '../config/env.js';

/** Finds prisma/schema.prisma in the working directory or one of its parents. */
function findSchema(cwd = process.cwd()): string | null {
  let dir = cwd;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'prisma', 'schema.prisma');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const schema = findSchema();
if (!schema) {
  console.error('Could not find prisma/schema.prisma above the current directory.');
  process.exit(1);
}
const flag = process.argv[2];
const extra = process.argv.slice(3);
const command =
  flag === '--create'
    ? ['migrate', 'dev', ...extra]
    : flag === '--studio'
      ? ['studio', ...extra]
      : ['migrate', 'deploy'];

const cli = createRequire(import.meta.url).resolve('prisma/build/index.js');
const result = spawnSync(process.execPath, [cli, ...command, `--schema=${schema}`], {
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: env.DATABASE_URL,
    DATABASE_DIRECT_URL: env.DATABASE_DIRECT_URL,
  },
});
process.exit(result.status ?? 1);
