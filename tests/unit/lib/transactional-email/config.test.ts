import { describe, expect, it } from "vitest";
import {
  loadTransactionalEmailConfig,
  loadTransactionalEmailWorkerSecret,
  TransactionalEmailConfigurationError,
} from "@/lib/transactional-email/config";

const COMPLETE_ENVIRONMENT = {
  RESEND_API_KEY: "test-provider-key",
  TRANSACTIONAL_EMAIL_FROM:
    "IronClad Tournaments <notifications@example.invalid>",
  TRANSACTIONAL_EMAIL_REPLY_TO: "operations@example.invalid",
  TRANSACTIONAL_EMAIL_APP_ORIGIN: "https://preview.example.invalid",
  TRANSACTIONAL_EMAIL_MODE: "allowlist",
  TRANSACTIONAL_EMAIL_ALLOWED_CLERK_USER_IDS: '["user_a","user_b"]',
  TRANSACTIONAL_EMAIL_WORKER_SECRET: "test-worker-secret",
};

function expectSafeConfigurationError(environment: Record<string, string>) {
  try {
    loadTransactionalEmailConfig(environment);
  } catch (error) {
    expect(error).toBeInstanceOf(TransactionalEmailConfigurationError);
    expect(error).toMatchObject({
      code: "EMAIL_CONFIG_INVALID",
      message: "Transactional email configuration is invalid.",
    });

    const serializedError = String(error);
    for (const value of Object.values(environment)) {
      if (value) {
        expect(serializedError).not.toContain(value);
      }
    }
    return;
  }

  throw new Error("Expected configuration parsing to fail.");
}

describe("transactional email configuration", () => {
  it("loads strict allowlist mode delivery configuration", () => {
    const config = loadTransactionalEmailConfig(COMPLETE_ENVIRONMENT);

    expect(config).toMatchObject({
      mode: "allowlist",
      resendApiKey: "test-provider-key",
      from: "IronClad Tournaments <notifications@example.invalid>",
      replyTo: "operations@example.invalid",
      appOrigin: "https://preview.example.invalid",
      workerSecret: "test-worker-secret",
    });
    expect([...config.allowedClerkUserIds]).toEqual(["user_a", "user_b"]);
  });

  it("loads enabled mode without requiring an allowlist", () => {
    const config = loadTransactionalEmailConfig({
      ...COMPLETE_ENVIRONMENT,
      TRANSACTIONAL_EMAIL_MODE: "enabled",
      TRANSACTIONAL_EMAIL_ALLOWED_CLERK_USER_IDS: undefined,
    });

    expect(config.mode).toBe("enabled");
    expect(config.allowedClerkUserIds.size).toBe(0);
  });

  it("loads disabled mode with only its mode and worker secret", () => {
    const config = loadTransactionalEmailConfig({
      TRANSACTIONAL_EMAIL_MODE: "disabled",
      TRANSACTIONAL_EMAIL_WORKER_SECRET: "disabled-worker-secret",
    });

    expect(config).toEqual({
      mode: "disabled",
      resendApiKey: null,
      from: null,
      replyTo: null,
      appOrigin: null,
      allowedClerkUserIds: new Set(),
      workerSecret: "disabled-worker-secret",
    });
  });

  it("still rejects a malformed supplied allowlist in disabled mode", () => {
    expectSafeConfigurationError({
      TRANSACTIONAL_EMAIL_MODE: "disabled",
      TRANSACTIONAL_EMAIL_ALLOWED_CLERK_USER_IDS: '["user_a","user_a"]',
      TRANSACTIONAL_EMAIL_WORKER_SECRET: "disabled-worker-secret",
    });
  });

  it.each([undefined, "", "DISABLED", "enabled ", "unexpected"])(
    "fails closed for a missing or invalid mode (%s)",
    (mode) => {
      expectSafeConfigurationError({
        ...COMPLETE_ENVIRONMENT,
        TRANSACTIONAL_EMAIL_MODE: mode as string,
      });
    }
  );

  it.each([
    ["RESEND_API_KEY", ""],
    ["TRANSACTIONAL_EMAIL_FROM", ""],
    ["TRANSACTIONAL_EMAIL_REPLY_TO", ""],
    ["TRANSACTIONAL_EMAIL_APP_ORIGIN", ""],
    ["TRANSACTIONAL_EMAIL_WORKER_SECRET", ""],
  ])("rejects incomplete active configuration at %s", (name, value) => {
    expectSafeConfigurationError({
      ...COMPLETE_ENVIRONMENT,
      [name]: value,
    });
  });

  it.each([
    "not-json",
    "{}",
    "[]",
    '["user_a",42]',
    '["user_a",""]',
    '["user_a","   "]',
    '["user_a"," user_b"]',
    '["user_a","user_a"]',
  ])("rejects a malformed allowlist without exposing it: %s", (allowlist) => {
    expectSafeConfigurationError({
      ...COMPLETE_ENVIRONMENT,
      TRANSACTIONAL_EMAIL_ALLOWED_CLERK_USER_IDS: allowlist,
    });
  });

  it.each([
    "http://preview.example.invalid",
    "https://preview.example.invalid/path",
    "https://preview.example.invalid?source=test",
    "https://preview.example.invalid#fragment",
    "https://preview.example.invalid?",
    "https://preview.example.invalid/.",
    "https://username@preview.example.invalid",
    "https://username:password@preview.example.invalid",
    "//preview.example.invalid",
    "not-a-url",
  ])("rejects an unsafe or non-origin application URL: %s", (appOrigin) => {
    expectSafeConfigurationError({
      ...COMPLETE_ENVIRONMENT,
      TRANSACTIONAL_EMAIL_APP_ORIGIN: appOrigin,
    });
  });

  it("normalizes the one permitted root slash from an HTTPS origin", () => {
    const config = loadTransactionalEmailConfig({
      ...COMPLETE_ENVIRONMENT,
      TRANSACTIONAL_EMAIL_APP_ORIGIN: "https://preview.example.invalid/",
    });

    expect(config.appOrigin).toBe("https://preview.example.invalid");
  });

  it("loads the route-authentication secret independently", () => {
    expect(
      loadTransactionalEmailWorkerSecret({
        TRANSACTIONAL_EMAIL_WORKER_SECRET: "route-only-secret",
      })
    ).toBe("route-only-secret");
  });

  it("does not expose the worker secret when route configuration is invalid", () => {
    const secret = "private-route-secret-value";

    try {
      loadTransactionalEmailWorkerSecret({
        TRANSACTIONAL_EMAIL_WORKER_SECRET: ` ${secret}\n`,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(TransactionalEmailConfigurationError);
      expect(String(error)).not.toContain(secret);
      return;
    }

    throw new Error("Expected worker-secret parsing to fail.");
  });
});
