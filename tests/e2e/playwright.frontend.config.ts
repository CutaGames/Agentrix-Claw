import path from 'path';
import { defineConfig, devices } from '@playwright/test';

const workspaceRoot = path.resolve(__dirname, '..', '..');
const frontendRoot = path.join(workspaceRoot, 'frontend');

export default defineConfig({
  testDir: './frontend',
  timeout: 60000,
  retries: 0,
  reporter: [['line'], ['html', { outputFolder: 'tests/reports/frontend-pet-html', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    cwd: frontendRoot,
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: true,
    timeout: 120000,
    env: {
      NEXT_PUBLIC_API_URL: 'http://127.0.0.1:3000/api',
      NODE_ENV: 'development',
    },
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