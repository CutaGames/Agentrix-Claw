import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for testing against PRODUCTION (agentrix.top).
 * No webServer needed — tests run directly against the live site.
 */
export default defineConfig({
  testDir: './frontend',
  timeout: 90000,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'tests/reports/web-prod-results.json' }]],
  use: {
    baseURL: 'https://agentrix.top',
    trace: 'retain-on-failure',
    ignoreHTTPSErrors: true,
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 960 },
        launchOptions: {
          executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        },
      },
    },
  ],
});
