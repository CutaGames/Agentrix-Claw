import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "@playwright/test";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(configDir, "..");

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    headless: false,
    viewport: { width: 480, height: 640 },
    actionTimeout: 10_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    channel: "chrome", // Use system Chrome
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 1420",
    cwd: desktopRoot,
    url: "http://127.0.0.1:1420",
    reuseExistingServer: true,
    timeout: 120000,
  },
  projects: [
    {
      name: "desktop-webview",
      use: {
        // In Tauri E2E, we connect to the running WebView via CDP
        // or use the dev server URL for faster iteration
        baseURL: "http://127.0.0.1:1420",
      },
    },
  ],
});
