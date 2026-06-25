import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 30000,
  retries: 1,
  reporter: [['line'], ['html', { outputFolder: 'tests/reports/e2e-html', open: 'never' }]],
  use: {
    baseURL: 'https://api.agentrix.top/api',
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {},
    },
  ],
});
