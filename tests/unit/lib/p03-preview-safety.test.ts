import { Buffer } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertP03PreviewSafety } from "@/lib/p03-preview-safety";

const stagingRef = "zzbnneprhjicmajpjkdg";
const productionRef = "nsyjtqpvyxlzyujlbzos";

function jwt(ref: string, role = "service_role") {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256" })}.${encode({ ref, role })}.synthetic-signature`;
}

function safeEnvironment(): Record<string, string | undefined> {
  return {
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "codex/p03-production-ready",
    NEXT_PUBLIC_SUPABASE_URL: `https://${stagingRef}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt(stagingRef, "anon"),
    SUPABASE_SERVICE_ROLE_KEY: jwt(stagingRef),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_c3RhZ2luZy5jbGVyay5hY2NvdW50cy5kZXYk",
    CLERK_SECRET_KEY: "sk_test_synthetic_only",
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("P03 candidate Preview isolation", () => {
  it("accepts the isolated Staging configuration without mutating it", () => {
    const environment = Object.freeze(safeEnvironment());
    expect(() => assertP03PreviewSafety(environment)).not.toThrow();
    expect(() => assertP03PreviewSafety({ ...environment, TRANSACTIONAL_EMAIL_MODE: "disabled" })).not.toThrow();
  });

  it.each([
    { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "codex/p03-production-ready" },
    { VERCEL_ENV: "development", VERCEL_GIT_COMMIT_REF: "codex/p03-production-ready" },
    { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "staging" },
    { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "another-candidate" },
    {},
  ])("leaves other deployment contexts unchanged: %j", (environment) => {
    expect(() => assertP03PreviewSafety(environment)).not.toThrow();
  });

  it.each([
    undefined,
    `https://${productionRef}.supabase.co`,
    `http://${stagingRef}.supabase.co`,
    `https://${stagingRef}.supabase.co.evil.invalid`,
    `https://user:password@${stagingRef}.supabase.co`,
    `https://${stagingRef}.supabase.co:444`,
    `https://${stagingRef}.supabase.co/rest/v1`,
    `https://${stagingRef}.supabase.co/?redirect=other`,
    `https://${stagingRef}.supabase.co/#fragment`,
  ])("rejects missing, Production or ambiguous Supabase origins", (url) => {
    expect(() => assertP03PreviewSafety({ ...safeEnvironment(), NEXT_PUBLIC_SUPABASE_URL: url }))
      .toThrow("NEXT_PUBLIC_SUPABASE_URL");
  });

  it.each([
    ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_live_synthetic"],
    ["CLERK_SECRET_KEY", "sk_live_synthetic"],
    ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", ""],
    ["CLERK_SECRET_KEY", "sk_test_"],
  ])("rejects missing/live Clerk identity in %s", (key, value) => {
    expect(() => assertP03PreviewSafety({ ...safeEnvironment(), [key]: value })).toThrow(key);
  });

  it.each([
    jwt(productionRef),
    jwt("anotherproject"),
    jwt(stagingRef, "anon"),
    "header.invalid.signature",
    "not-a-key",
    undefined,
  ])("rejects a mismatched or invalid service-role key", (value) => {
    expect(() => assertP03PreviewSafety({ ...safeEnvironment(), SUPABASE_SERVICE_ROLE_KEY: value }))
      .toThrow("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("checks the effective public key instead of silently falling back from an invalid override", () => {
    expect(() => assertP03PreviewSafety({ ...safeEnvironment(), NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt(productionRef, "anon") }))
      .toThrow("effective Supabase public key");
    expect(() => assertP03PreviewSafety({ ...safeEnvironment(), NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" }))
      .toThrow("effective Supabase public key");
  });

  it("supports opaque Supabase keys while still requiring the exact Staging URL", () => {
    const environment = {
      ...safeEnvironment(),
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_synthetic-only",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic-only",
    };
    expect(() => assertP03PreviewSafety(environment)).not.toThrow();
    expect(() => assertP03PreviewSafety({ ...environment, NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co" }))
      .toThrow("NEXT_PUBLIC_SUPABASE_URL");
  });

  it.each(["DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL_NON_POOLING", "SUPABASE_DB_URL"])(
    "rejects Production and unidentified direct database URLs in %s", (key) => {
      for (const value of [
        `postgresql://postgres:secret@db.${productionRef}.supabase.co:5432/postgres`,
        `postgres://postgres.${productionRef}:secret@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres`,
        "postgres://postgres:secret@unknown.invalid/postgres",
      ]) {
        expect(() => assertP03PreviewSafety({ ...safeEnvironment(), [key]: value })).toThrow(key);
      }
    }
  );

  it.each([
    `postgresql://postgres:synthetic@db.${stagingRef}.supabase.co:5432/postgres`,
    `postgres://postgres.${stagingRef}:synthetic@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres`,
  ])("allows a positively identified Staging database URL", (value) => {
    expect(() => assertP03PreviewSafety({ ...safeEnvironment(), DATABASE_URL: value })).not.toThrow();
  });

  it("rejects a Production ref hidden in another environment entry without disclosing it", () => {
    const secret = `postgresql://username:do-not-print@db.${productionRef}.supabase.co/postgres`;
    let error: unknown;
    try {
      assertP03PreviewSafety({ ...safeEnvironment(), CUSTOM_CONNECTION: secret });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toContain("Production Supabase project reference");
    expect(String(error)).not.toContain(secret);
    expect(String(error)).not.toContain("do-not-print");
    expect(String(error)).not.toContain(productionRef);
  });

  it.each(["enabled", "allowlist", "unknown"])("rejects email mode %s", (mode) => {
    expect(() => assertP03PreviewSafety({ ...safeEnvironment(), TRANSACTIONAL_EMAIL_MODE: mode }))
      .toThrow("TRANSACTIONAL_EMAIL_MODE");
  });

  it.each([
    "RESEND_API_KEY", "TRANSACTIONAL_EMAIL_WORKER_SECRET",
    "WEB_PUSH_VAPID_PUBLIC_KEY", "WEB_PUSH_VAPID_PRIVATE_KEY", "WEB_PUSH_VAPID_SUBJECT",
    "VERCEL_ANALYTICS_ACCESS_TOKEN", "STEAM_WEB_API_KEY",
  ])("rejects an unverified outbound/provider credential in %s without logging it", (key) => {
    expect(() => assertP03PreviewSafety({ ...safeEnvironment(), [key]: "secret-do-not-print" })).toThrow(key);
    try {
      assertP03PreviewSafety({ ...safeEnvironment(), [key]: "secret-do-not-print" });
    } catch (error) {
      expect(String(error)).not.toContain("secret-do-not-print");
    }
  });

  it("fails during Next config evaluation before loading the application", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "codex/p03-production-ready");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://unapproved.invalid");
    await expect(import("@/next.config")).rejects.toThrow("P03 Preview isolation check failed");
  });

  it("preserves existing request limits and headers in ordinary builds", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const { default: config } = await import("@/next.config");
    expect(config.experimental?.proxyClientMaxBodySize).toBe(4_400_000);
    expect(config.experimental?.serverActions?.bodySizeLimit).toBe(4_400_000);
    expect(await config.headers?.()).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "/sw.js" }),
      expect.objectContaining({ source: "/:path*" }),
    ]));
  });
});
