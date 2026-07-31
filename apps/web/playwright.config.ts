import { defineConfig, devices } from '@playwright/test';
import { E2E_DATABASE_URL } from './e2e/db.js';

/**
 * E2E config. Boots the API (on an isolated e2e Postgres DB — schema.prisma's
 * provider is "postgresql") and the web dev server, then runs browser flows
 * against them. The API DB is prepared by the global setup script.
 */
const WEB_PORT = 5199;
const API_PORT = 4099;
const apiEnv = {
  DATABASE_URL: E2E_DATABASE_URL,
  NODE_ENV: 'development',
  JWT_SECRET: 'e2e-secret-1234567890',
  CRON_SECRET: 'e2e-cron',
  WEB_ORIGIN: `http://localhost:${WEB_PORT}`,
  PORT: String(API_PORT),
};

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // API server on an isolated DB (prepared by e2e/global-setup).
      command: 'sh -c "cd ../api && npx tsx src/index.ts"',
      port: API_PORT,
      reuseExistingServer: false,
      timeout: 60_000,
      env: apiEnv,
    },
    {
      // Web dev server pointed at the e2e API (PORT drives vite's listen port).
      command: 'pnpm dev',
      port: WEB_PORT,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { VITE_API_URL: `http://localhost:${API_PORT}`, PORT: String(WEB_PORT) },
    },
  ],
  globalSetup: './e2e/global-setup.ts',
});
