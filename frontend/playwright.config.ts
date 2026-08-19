import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env['CI'];

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  // Readable console output plus an HTML report (uploaded as a CI artifact);
  // `open: never` keeps it from launching a browser locally on failure.
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Locally: start (or reuse) the dev server on 4200. In CI: serve the
  // production build instead (`serve:dist` over `dist/frontend/browser`, built
  // by the workflow beforehand) — it catches production-only bugs. Same URL
  // either way, so the specs don't care which server answers.
  webServer: {
    command: isCI ? 'pnpm serve:dist' : 'pnpm start',
    url: 'http://localhost:4200',
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
