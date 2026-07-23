import { defineConfig, devices } from "@playwright/test";

const TEST_SUPABASE_URL = "http://127.0.0.1:54321";
const TEST_CLERK_PUBLISHABLE_KEY = "pk_test_Y2xlcmsudGVzdCQ=";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "public-chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    env: {
      CLERK_SECRET_KEY: "sk_test_not-a-real-secret",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: TEST_CLERK_PUBLISHABLE_KEY,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-only-publishable-key",
      NEXT_PUBLIC_SUPABASE_URL: TEST_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: "test-only-service-role-key",
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: "http://127.0.0.1:3100",
  },
});
