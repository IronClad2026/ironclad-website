import { afterAll, afterEach } from "vitest";
import { mockServer } from "@/tests/mocks/server";

const TEST_SUPABASE_URL = "http://127.0.0.1:54321";
const TEST_CLERK_PUBLISHABLE_KEY = "pk_test_Y2xlcmsudGVzdCQ=";

function assertSafeInheritedEnvironment() {
  const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (configuredSupabaseUrl) {
    let url: URL;

    try {
      url = new URL(configuredSupabaseUrl);
    } catch {
      throw new Error(
        "Tests refused an invalid inherited NEXT_PUBLIC_SUPABASE_URL."
      );
    }

    if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
      throw new Error(
        "Tests refuse non-loopback Supabase URLs. Clear production or remote environment variables before running tests."
      );
    }
  }

  if (
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_") ||
    process.env.CLERK_SECRET_KEY?.startsWith("sk_live_")
  ) {
    throw new Error(
      "Tests refuse live Clerk keys. Clear production environment variables before running tests."
    );
  }
}

assertSafeInheritedEnvironment();

process.env.NEXT_PUBLIC_SUPABASE_URL ??= TEST_SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??=
  "test-only-publishable-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-service-role-key";
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??=
  TEST_CLERK_PUBLISHABLE_KEY;
process.env.CLERK_SECRET_KEY = "sk_test_not-a-real-secret";

mockServer.listen({ onUnhandledRequest: "error" });

afterEach(() => {
  mockServer.resetHandlers();
});

afterAll(() => {
  mockServer.close();
});
