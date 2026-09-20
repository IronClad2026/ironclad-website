import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
export default defineConfig({
  outputDir: resolve(__dirname, "../../../test-results/match-room"),
  testDir: ".", testMatch: "*.spec.ts", workers: 1,
  use: { baseURL: "http://127.0.0.1:3137", browserName: "chromium", trace: "retain-on-failure" },
  webServer: {
    cwd: resolve(__dirname, "../../.."),
    command: "node node_modules/vite/bin/vite.js --config tests/browser/match-room/vite.config.ts",
    url: "http://127.0.0.1:3137/tests/browser/match-room/", reuseExistingServer: false, timeout: 60_000,
  },
});

