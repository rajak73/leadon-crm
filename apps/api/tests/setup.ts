import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, inject } from 'vitest';
import { SCHEMA_PREFIX, urlForSchema } from './db.js';

// Runs in every test file before any app module is imported: create a private Postgres schema
// for this file, apply the real migrations to it and point the app at it.
const schema = [
  SCHEMA_PREFIX + inject('testRunId'),
  process.env.VITEST_POOL_ID ?? '0',
  crypto.randomBytes(4).toString('hex'),
].join('_');
const url = urlForSchema(schema);

const cli = createRequire(import.meta.url).resolve('prisma/build/index.js');
const schemaFile = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../prisma/schema.prisma',
);
execFileSync(process.execPath, [cli, 'migrate', 'deploy', `--schema=${schemaFile}`], {
  env: {
    ...process.env,
    DATABASE_URL: url,
    DATABASE_DIRECT_URL: url,
    // Each file has its own schema, so parallel migrations can't conflict; skip Prisma's
    // database-wide migration lock so files don't queue behind each other.
    PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: '1',
  },
  stdio: 'pipe',
});

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = url;
process.env.DATABASE_DIRECT_URL = url;
process.env.BCRYPT_COST = '4';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256-signing';
process.env.LOG_LEVEL = 'silent';
// Never let a developer's real AI or Meta settings leak into tests.
for (const key of [
  'AI_PROVIDER',
  'AI_MODEL',
  'GEMINI_API_KEY',
  'GROQ_API_KEY',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'META_APP_SECRET',
  'META_WEBHOOK_VERIFY_TOKEN',
  'PUBLIC_URL',
  'ENCRYPTION_KEY',
  'INSTAGRAM_TEST_MODE',
])
  delete process.env[key];

afterAll(async () => {
  const { prisma } = await import('../src/lib/prisma.js');
  try {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await prisma.$disconnect();
  }
});
