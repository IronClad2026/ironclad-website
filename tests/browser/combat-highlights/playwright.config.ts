import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".", testMatch: "highlights.spec.ts", workers: 1, fullyParallel: false,
  outputDir: "../../../.playwright/combat-highlights",
  use: { baseURL: "http://127.0.0.1:3218", browserName: "chromium", trace: "retain-on-failure" },
  webServer: {
    cwd: resolve(__dirname, "../../.."),
    command: "node node_modules/vite/bin/vite.js --config tests/browser/combat-highlights/vite.config.ts",
    url: "http://127.0.0.1:3218/tests/browser/combat-highlights/",
    reuseExistingServer: false, timeout: 60_000,
  },
});
