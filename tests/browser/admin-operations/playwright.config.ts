import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".", testMatch: "flow.spec.ts", workers: 1,
  outputDir: "../../../.playwright/admin-operations",
  use: { baseURL: "http://127.0.0.1:3189", browserName: "chromium", trace: "retain-on-failure" },
  webServer: { cwd: resolve(__dirname, "../../.."), command: "node node_modules/vite/bin/vite.js --config tests/browser/admin-operations/vite.config.ts", url: "http://127.0.0.1:3189/tests/browser/admin-operations/", reuseExistingServer: !process.env.CI, timeout: 60000 },
});
