import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

export default defineConfig({
  testDir: ".",
  testMatch: "flow.spec.ts",
  workers: 1,
  timeout: 60000,
  outputDir: resolve(__dirname, "../../../test-results/public-profile-notice"),
  use: { baseURL: "http://127.0.0.1:3164", browserName: "chromium", trace: "retain-on-failure" },
  webServer: {
    cwd: resolve(__dirname, "../../.."),
    command: "node node_modules/vite/bin/vite.js --config tests/browser/public-profile-notice/vite.config.ts",
    url: "http://127.0.0.1:3164/tests/browser/public-profile-notice/main.tsx",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
