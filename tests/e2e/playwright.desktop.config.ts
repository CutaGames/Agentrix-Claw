import path from 'path';
import { defineConfig, devices } from '@playwright/test';

const workspaceRoot = path.resolve(__dirname, '..', '..');
const desktopRoot = path.join(workspaceRoot, 'desktop');

export default defineConfig({
  testDir: '.',
  timeout: 60000,
  retries: 0,
  reporter: [['line'], ['html', { outputFolder: 'tests/reports/desktop-html', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:1420',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 1420',
    cwd: desktopRoot,
    url: 'http://127.0.0.1:1420',
    reuseExistingServer: true,
    timeout: 120000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
      },
    },
  ],
});