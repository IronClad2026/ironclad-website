import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  workers: 1,
  outputDir: "../../../.playwright/admin-match",
  use: {
    baseURL: "http://127.0.0.1:3128",
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  webServer: {
    cwd: resolve(__dirname, "../../.."),
    command:
      "node node_modules/vite/bin/vite.js --config tests/browser/admin-match/vite.config.ts",
    url: "http://127.0.0.1:3128/tests/browser/admin-match/",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
