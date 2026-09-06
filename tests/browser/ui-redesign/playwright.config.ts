import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: process.env.UI_REDESIGN_SURFACE === "dashboard" ? "dashboard.spec.ts" : "flow.spec.ts",
  fullyParallel: false,
  workers: 1,
  outputDir: "../../../.playwright/ui-redesign",
  use: {
    baseURL: "http://127.0.0.1:3187",
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  webServer: {
    cwd: resolve(__dirname, "../../.."),
    command: "node node_modules/vite/bin/vite.js --config tests/browser/ui-redesign/vite.config.ts",
    url: "http://127.0.0.1:3187/tests/browser/ui-redesign/",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
