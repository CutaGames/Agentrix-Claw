import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.voice-ui.config';

export default defineConfig({
  ...baseConfig,
  retries: 0,
  workers: 1,
  webServer: undefined,
  reporter: [['line']],
});