import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "bracket.spec.ts",
  fullyParallel: false,
  workers: 1,
  outputDir: "../../../.playwright/bracket-layout",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:3223",
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    timezoneId: "UTC",
  },
  webServer: {
    cwd: resolve(__dirname, "../../.."),
    command: "node node_modules/vite/bin/vite.js --config tests/browser/bracket-layout/vite.config.ts",
    url: "http://127.0.0.1:3223/tests/browser/bracket-layout/",
    reuseExistingServer: false,
    timeout: 60_000,
    env: { UI_REDESIGN_SOURCE_ROOT: "", UI_REDESIGN_SURFACE: "" },
  },
});