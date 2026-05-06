import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './frontend',
  timeout: 60000,
  retries: 0,
  reporter: [['line'], ['html', { outputFolder: 'tests/reports/frontend-live-html', open: 'never' }]],
  use: {
    baseURL: 'https://agentrix.top',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 960 },
      },
    },
  ],
});