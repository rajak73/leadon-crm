import os from 'node:os';

/**
 * Test database: one Postgres database (TEST_DATABASE_URL, default
 * postgresql://localhost:5432/leados_v2_test) with a private schema per test file.
 * Never points at DATABASE_URL, so tests can't touch a development database.
 */
export const TEST_DATABASE_URL = withDefaultUser(
  process.env.TEST_DATABASE_URL?.trim() || 'postgresql://localhost:5432/leados_v2_test',
);

/** Schemas created by the test harness start with this prefix. */
export const SCHEMA_PREFIX = 'test_';

/** Same as config/env.ts (not imported: that module must load after the test env is set). */
export function withDefaultUser(url: string): string {
  const u = new URL(url);
  if (!u.username) u.username = encodeURIComponent(process.env.PGUSER || os.userInfo().username);
  return u.toString();
}

/** The test URL pointed at another database on the same server (e.g. `postgres`). */
export function urlForDatabase(database: string): string {
  const u = new URL(TEST_DATABASE_URL);
  u.pathname = `/${database}`;
  u.searchParams.delete('schema');
  return u.toString();
}

/** The test URL with `?schema=` set and a small pool (test files run in parallel). */
export function urlForSchema(schema: string): string {
  const u = new URL(TEST_DATABASE_URL);
  u.searchParams.set('schema', schema);
  if (!u.searchParams.has('connection_limit')) u.searchParams.set('connection_limit', '5');
  return u.toString();
}

export const testDatabaseName = (): string =>
  decodeURIComponent(new URL(TEST_DATABASE_URL).pathname.slice(1));
