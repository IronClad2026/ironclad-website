import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
import { loadTarget } from "./target";

// Avoid Playwright copying private authenticated DOM into error-context.md.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";
const target = loadTarget();
export default defineConfig({
  testDir: ".",
  testMatch: "hosted.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  metadata: target,
  outputDir: "../../../test-results/p03-preview",
  reporter: [["json", { outputFile: resolve("test-results/p03-preview-report.json") }]],
  use: { baseURL: target.previewUrl, locale: "en-US", trace: "off", screenshot: "off", video: "off" },
});
