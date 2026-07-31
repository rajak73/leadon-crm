/** Shared by global-setup.ts and playwright.config.ts so both point at the same DB. */
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? 'postgresql://localhost:5432/leados_test';
