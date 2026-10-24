import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "editor.spec.ts",
  workers: 1,
  fullyParallel: false,
  outputDir: "../../../.playwright/announcements",
  use: { baseURL: "http://127.0.0.1:3226", browserName: "chromium", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    cwd: resolve(__dirname, "../../.."),
    command: "node node_modules/vite/bin/vite.js --config tests/browser/announcements/vite.config.ts",
    url: "http://127.0.0.1:3226/tests/browser/announcements/",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
