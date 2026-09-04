import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3127",
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  webServer: {
    cwd: resolve(__dirname, "../../.."),
    command:
      "node node_modules/vite/bin/vite.js --config tests/browser/match-result/vite.config.ts",
    url: "http://127.0.0.1:3127/tests/browser/match-result/",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
