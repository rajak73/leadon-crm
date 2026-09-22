import { Prisma, PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { logger } from './logger.js';

/**
 * One client (and connection pool) per process. Inside an interactive transaction always use
 * the `tx` handle: the global client runs on another connection, outside the transaction.
 */
export const prisma = new PrismaClient({ datasourceUrl: env.DATABASE_URL });

export type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;

/**
 * Serialises transactions that share `key` (a Postgres transaction-level advisory lock,
 * released on commit/rollback). Use for read-modify-write sequences that must not interleave,
 * e.g. first-run setup or editing a record's tag array.
 */
export async function lockTx(tx: Tx, key: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${key}))`;
}

/**
 * Row locks (`SELECT … FOR UPDATE`) for read-validate-write transactions, so two concurrent
 * edits of the same record run one after the other instead of overwriting each other.
 */
export async function lockRows(
  tx: Tx,
  table: 'Lead' | 'Contact' | 'Deal' | 'Task',
  ids: string[],
): Promise<void> {
  if (!ids.length) return;
  await tx.$queryRaw`SELECT id FROM ${Prisma.raw(`"${table}"`)} WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
}

/**
 * Connects at start-up. Serverless Postgres (Neon) may take a few seconds to wake from
 * scale-to-zero, so retry a few times before giving up.
 */
export async function connectDatabase(attempts = 5): Promise<void> {
  for (let i = 1; ; i++) {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      return;
    } catch (err) {
      if (i >= attempts) throw err;
      logger.warn({ err, attempt: i }, 'Database not reachable yet; retrying');
      await new Promise((r) => setTimeout(r, 1000 * 2 ** (i - 1)));
    }
  }
}
