import { defineConfig } from '@playwright/test';

// Ports chosen away from the dev defaults (3000/4318/5173) so a running dev setup is never touched.
export const API = 'http://127.0.0.1:54318';
export const WEB = 'http://127.0.0.1:53000';
export const RENDERER = 'http://127.0.0.1:55173';
const blank = { DATABASE_URL: '', NEON_AUTH_BASE_URL: '', NEON_AUTH_COOKIE_SECRET: '', OPENAI_API_KEY: '' };

export default defineConfig({
  testDir: '.',
  outputDir: '../test-results',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30_000,
  expect: { timeout: 7_500 },
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'web', testMatch: /web\.spec\.ts/, use: { baseURL: WEB, browserName: 'chromium' } },
    { name: 'desktop', testMatch: /(desktop|popup)\.spec\.ts/, use: { baseURL: RENDERER, browserName: 'chromium', permissions: ['clipboard-read', 'clipboard-write'] } },
    { name: 'electron', testMatch: /electron\.spec\.ts/ },
  ],
  webServer: [
    { command: 'node --import tsx apps/api/src/index.ts', cwd: '..', url: `${API}/health`, reuseExistingServer: !process.env.CI,
      env: { ...blank, DEMO_MODE: 'true', HOST: '127.0.0.1', PORT: '54318', NODE_ENV: 'test', ALLOWED_ORIGINS: `${WEB},${RENDERER}` } },
    { command: 'npx next dev --port 53000 --hostname 127.0.0.1', cwd: '../apps/web', url: WEB, timeout: 120_000, reuseExistingServer: !process.env.CI,
      env: { ...blank, NEXT_PUBLIC_DEMO_MODE: 'true', NEXT_PUBLIC_API_URL: API } },
    { command: 'npx vite --host 127.0.0.1 --port 55173 --strictPort', cwd: '../apps/desktop', url: RENDERER, reuseExistingServer: !process.env.CI,
      env: { VITE_API_URL: API, CTRUE_API_URL: API } },
  ],
});
