import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "news.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  outputDir: "../../../.playwright/news",
  use: {
    baseURL: "http://127.0.0.1:3198",
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    cwd: resolve(__dirname, "../../.."),
    command: "node node_modules/vite/bin/vite.js --config tests/browser/news/vite.config.ts",
    url: "http://127.0.0.1:3198/tests/browser/news/",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
