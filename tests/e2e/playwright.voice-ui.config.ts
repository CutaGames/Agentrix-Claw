import path from 'path';
import { defineConfig, devices } from '@playwright/test';

const workspaceRoot = path.resolve(__dirname, '..', '..');

export default defineConfig({
  testDir: './ui',
  timeout: 60000,
  retries: 1,
  reporter: [['line'], ['html', { outputFolder: 'tests/reports/voice-ui-html', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npx expo export --platform web && node scripts/test/patch-expo-web-index.mjs && npx serve dist -l 3000',
    cwd: workspaceRoot,
    env: {
      CI: '1',
    },
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: true,
    timeout: 600000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 960 },
      },
    },
    {
      name: 'webkit',
      use: {
        ...devices['iPhone 15'],
      },
    },
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 7'],
      },
    },
  ],
});