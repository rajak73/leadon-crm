import { PrismaClient } from '@prisma/client';

/**
 * Singleton Prisma client with free-tier friendly pooling.
 *
 * Neon's free tier has a low connection limit, so we keep the pool small and
 * rely on Neon's built-in pooler (pgbouncer). Set DATABASE_URL to the *pooled*
 * Neon connection string and add `?connection_limit=5&pool_timeout=20` (or use
 * the `-pooler` host) in production. In dev with hot-reload we cache the client
 * on globalThis to avoid exhausting connections across reloads.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/** Close the pool cleanly on shutdown so free-tier connections are released. */
export async function disconnectPrisma() {
  await prisma.$disconnect();
}
