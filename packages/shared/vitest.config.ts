import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/types/**'],
      thresholds: {
        lines: 80,
        functions: 70,
        statements: 80,
        // Lower floor: the package is overwhelmingly constants + a few Zod schemas; the
        // only uncovered branch is a defensive `?? ` fallback in registerSchema that is
        // unreachable given the email is pre-validated.
        branches: 60,
      },
    },
  },
});
