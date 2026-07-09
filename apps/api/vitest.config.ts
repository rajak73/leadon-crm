import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    globalSetup: ['tests/global-setup.ts'],
    // Run test files sequentially so they can share one SQLite test DB safely.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
