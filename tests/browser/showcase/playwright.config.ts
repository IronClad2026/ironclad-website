import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "showcase.spec.ts",
  workers: 1,
  fullyParallel: false,
  outputDir: "../../../.playwright/showcase",
  use: { baseURL: "http://127.0.0.1:3193", browserName: "chromium", trace: "retain-on-failure" },
  webServer: {
    cwd: resolve(__dirname, "../../.."),
    command: "node node_modules/vite/bin/vite.js --config tests/browser/showcase/vite.config.ts",
    url: "http://127.0.0.1:3193/tests/browser/showcase/",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});