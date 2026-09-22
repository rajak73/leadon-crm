import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { TestProject } from 'vitest/node';
import { SCHEMA_PREFIX, TEST_DATABASE_URL, testDatabaseName, urlForDatabase } from './db.js';

declare module 'vitest' {
  export interface ProvidedContext {
    testRunId: string;
  }
}

const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;

/**
 * Creates the test database if it doesn't exist yet. Each test file then migrates its own
 * schema (tests/setup.ts); schemas of this run are dropped at the end.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const database = testDatabaseName();
  const admin = new PrismaClient({ datasourceUrl: urlForDatabase('postgres') });
  try {
    const rows = await admin.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = ${database}) AS exists`;
    if (!rows[0]?.exists) await admin.$executeRawUnsafe(`CREATE DATABASE ${quoteIdent(database)}`);
  } finally {
    await admin.$disconnect();
  }

  const runId = crypto.randomBytes(3).toString('hex');
  project.provide('testRunId', runId);

  return async () => {
    // Normally each file drops its own schema; this catches files that crashed.
    const db = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
    try {
      const leftovers = await db.$queryRaw<Array<{ name: string }>>`
        SELECT nspname AS name FROM pg_namespace WHERE nspname LIKE ${`${SCHEMA_PREFIX}${runId}_%`}`;
      for (const { name } of leftovers)
        await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${quoteIdent(name)} CASCADE`);
    } finally {
      await db.$disconnect();
    }
  };
}
