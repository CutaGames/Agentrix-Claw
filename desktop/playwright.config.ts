import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "tests/reports/e2e-results.json" }]],
  use: {
    // We connect via CDP, not launch a browser
    trace: "off",
  },
});
