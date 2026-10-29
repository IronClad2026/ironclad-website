import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as stagingPreview from "@/lib/p03-preview-safety";
import { assertReleasePreviewSafety } from "@/lib/release-preview-safety";

const STAGING_REF = "zzbnneprhjicmajpjkdg";
const PRODUCTION_REF = "nsyjtqpvyxlzyujlbzos";
const REVIEW_BRANCHES = [
  "feature/public-player-tournament-history-2026-10",
  "feature/home-collaboration-2026-10",
] as const;

function jwt(ref: string, role = "service_role") {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256" })}.${encode({ ref, role })}.synthetic-signature`;
}

function safeEnvironment(branch: string = REVIEW_BRANCHES[0]): Record<string, string | undefined> {
  return {
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: branch,
    NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt(STAGING_REF, "anon"),
    SUPABASE_SERVICE_ROLE_KEY: jwt(STAGING_REF),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_c3RhZ2luZy5jbGVyay5hY2NvdW50cy5kZXYk",
    CLERK_SECRET_KEY: "sk_test_synthetic_only",
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Only the two resource-attested feature Previews may build", () => {
  it.each([
    "release/consolidated-production-2026-10", "unknown-branch", "master",
    "staging", "codex/p03-production-ready", undefined, "",
    `${REVIEW_BRANCHES[0]}-other`, ` ${REVIEW_BRANCHES[1]}`,
  ])("keeps unverified or missing branch metadata blocked: %s", (branch) => {
    const environment = Object.freeze({ ...safeEnvironment(), VERCEL_GIT_COMMIT_REF: branch });
    expect(() => assertReleasePreviewSafety(environment)).toThrow("Release Preview is disabled");
  });

  it.each(REVIEW_BRANCHES)("accepts verified Staging resources for %s without modifying metadata", (branch) => {
    const environment = Object.freeze(safeEnvironment(branch));
    expect(() => assertReleasePreviewSafety(environment)).not.toThrow();
    expect(environment.VERCEL_GIT_COMMIT_REF).toBe(branch);
    expect(() => assertReleasePreviewSafety({
      ...environment, COMBAT_HIGHLIGHTS_ENABLED: "false", TRANSACTIONAL_EMAIL_MODE: "disabled",
    })).not.toThrow();
  });

  it("accepts either public-key alias, but requires every configured alias to match Staging", () => {
    const environment = safeEnvironment();
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = environment.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    expect(() => assertReleasePreviewSafety(environment)).not.toThrow();
    delete environment.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    expect(() => assertReleasePreviewSafety(environment)).not.toThrow();
    environment.NEXT_PUBLIC_SUPABASE_ANON_KEY = jwt("anotherproject", "anon");
    expect(() => assertReleasePreviewSafety(environment)).toThrow("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  });

  it("passes only the pinned verified public-key digest to the strict resource validator", () => {
    const validate = vi.spyOn(stagingPreview, "assertStagingPreviewResources");
    const environment = safeEnvironment();
    assertReleasePreviewSafety(environment);
    expect(validate).toHaveBeenCalledWith(environment, {
      requireProjectBoundKeys: true,
      approvedPublishableKeyDigest: "a0314ae03160c84408f67f2a27f136e3cf83427999b2c1888f227e1704ea719d",
    });
  });

  it.each(["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"])(
    "accepts an opaque anon key in %s only with its explicitly verified digest", (key) => {
      const opaque = "sb_publishable_synthetic-fingerprint-fixture";
      const approvedPublishableKeyDigest = createHash("sha256").update(opaque).digest("hex");
      const environment = { ...safeEnvironment(), [key]: opaque };
      const options = { requireProjectBoundKeys: true, approvedPublishableKeyDigest };
      expect(() => stagingPreview.assertStagingPreviewResources(environment, options)).not.toThrow();
      expect(() => stagingPreview.assertStagingPreviewResources(environment, { requireProjectBoundKeys: true })).toThrow();
      expect(() => stagingPreview.assertStagingPreviewResources(environment, {
        ...options, approvedPublishableKeyDigest: "0".repeat(64),
      })).toThrow();
      expect(() => stagingPreview.assertStagingPreviewResources({
        ...environment, [key]: `${opaque}-different`,
      }, options)).toThrow();
      expect(() => assertReleasePreviewSafety(environment)).toThrow();
    },
  );

  it("checks every configured alias and never accepts an opaque service key through the digest exception", () => {
    const opaque = "sb_publishable_synthetic-fingerprint-fixture";
    const options = {
      requireProjectBoundKeys: true,
      approvedPublishableKeyDigest: createHash("sha256").update(opaque).digest("hex"),
    };
    const environment = { ...safeEnvironment(), NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: opaque };
    expect(() => stagingPreview.assertStagingPreviewResources({
      ...environment, NEXT_PUBLIC_SUPABASE_ANON_KEY: `${opaque}-different`,
    }, options)).toThrow("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(() => stagingPreview.assertStagingPreviewResources({
      ...environment, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt("anotherproject", "anon"),
    }, options)).toThrow("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = "sb_secret_synthetic-fingerprint-fixture";
    expect(() => stagingPreview.assertStagingPreviewResources({
      ...safeEnvironment(), SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    }, {
      ...options, approvedPublishableKeyDigest: createHash("sha256").update(serviceKey).digest("hex"),
    })).toThrow("SUPABASE_SERVICE_ROLE_KEY");
  });

  it.each([
    "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY",
  ])("rejects missing required resource %s", (key) => {
    const environment = safeEnvironment();
    delete environment[key];
    expect(() => assertReleasePreviewSafety(environment)).toThrow("Staging Preview isolation check failed");
  });

  it.each([
    `https://${PRODUCTION_REF}.supabase.co`, "https://anotherproject.supabase.co",
    `http://${STAGING_REF}.supabase.co`, `https://${STAGING_REF}.supabase.co.evil.invalid`,
    `https://user:private-sentinel@${STAGING_REF}.supabase.co`,
    `https://${STAGING_REF}.supabase.co/rest/v1`, ` https://${STAGING_REF}.supabase.co`,
  ])("rejects Production, ambiguous, or malformed Supabase origins", (url) => {
    expect(() => assertReleasePreviewSafety({ ...safeEnvironment(), NEXT_PUBLIC_SUPABASE_URL: url }))
      .toThrow("NEXT_PUBLIC_SUPABASE_URL");
  });

  it.each([
    ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_live_synthetic"],
    ["CLERK_SECRET_KEY", "sk_live_synthetic"],
    ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", ""],
    ["CLERK_SECRET_KEY", "sk_test_"],
  ])("rejects missing or live Clerk identity in %s", (key, value) => {
    expect(() => assertReleasePreviewSafety({ ...safeEnvironment(), [key]: value })).toThrow(key);
  });

  it.each([
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", jwt(PRODUCTION_REF, "anon")],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", jwt("anotherproject", "anon")],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", jwt(STAGING_REF)],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_synthetic-only"],
    ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", ""],
    ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", jwt("anotherproject", "anon")],
    ["SUPABASE_SERVICE_ROLE_KEY", jwt(PRODUCTION_REF)],
    ["SUPABASE_SERVICE_ROLE_KEY", jwt("anotherproject")],
    ["SUPABASE_SERVICE_ROLE_KEY", jwt(STAGING_REF, "anon")],
    ["SUPABASE_SERVICE_ROLE_KEY", "sb_secret_synthetic-only"],
    ["SUPABASE_SERVICE_ROLE_KEY", "header.invalid.signature"],
  ])("requires project-bound Staging JWT identities in %s", (key, value) => {
    expect(() => assertReleasePreviewSafety({ ...safeEnvironment(), [key]: value }))
      .toThrow("Staging Preview isolation check failed");
  });

  it.each(["DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL_NON_POOLING", "SUPABASE_DB_URL"])(
    "checks the project of every direct database URL in %s", (key) => {
      const environment = safeEnvironment();
      for (const value of [
        `postgresql://postgres:private-sentinel@db.${PRODUCTION_REF}.supabase.co:5432/postgres`,
        "postgresql://postgres:private-sentinel@unknown.invalid/postgres",
        `postgresql://postgres.${PRODUCTION_REF}:private-sentinel@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres`,
      ]) expect(() => assertReleasePreviewSafety({ ...environment, [key]: value })).toThrow(key);
      for (const value of [
        `postgresql://postgres:synthetic@db.${STAGING_REF}.supabase.co:5432/postgres`,
        `postgresql://postgres.${STAGING_REF}:synthetic@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres`,
      ]) expect(() => assertReleasePreviewSafety({ ...environment, [key]: value })).not.toThrow();
    },
  );

  it.each(["true", "1", "enabled", " false"])("requires Highlights to stay disabled: %s", (enabled) => {
    expect(() => assertReleasePreviewSafety({ ...safeEnvironment(), COMBAT_HIGHLIGHTS_ENABLED: enabled }))
      .toThrow("COMBAT_HIGHLIGHTS_ENABLED");
  });

  it.each([
    "COMBAT_HIGHLIGHTS_SIGNING_PRIVATE_JWK", "COMBAT_HIGHLIGHTS_WORKER_URL",
    "COMBAT_HIGHLIGHTS_ALLOWED_ORIGINS", "COMBAT_HIGHLIGHTS_DEPLOYMENT_ENV", "COH3STATS_API_TOKEN",
    "RESEND_API_KEY", "TRANSACTIONAL_EMAIL_WORKER_SECRET", "WEB_PUSH_VAPID_PUBLIC_KEY",
    "WEB_PUSH_VAPID_PRIVATE_KEY", "WEB_PUSH_VAPID_SUBJECT", "VERCEL_ANALYTICS_ACCESS_TOKEN", "STEAM_WEB_API_KEY",
  ])("rejects unverified media, partner or outbound resources in %s without disclosing values", (key) => {
    const environment = { ...safeEnvironment(), [key]: "private-sentinel" };
    expect(() => assertReleasePreviewSafety(environment)).toThrow(key);
    try { assertReleasePreviewSafety(environment); } catch (error) {
      expect(String(error)).not.toContain("private-sentinel");
    }
  });

  it.each(["enabled", "allowlist", "unknown"])("requires email to stay disabled: %s", (mode) => {
    expect(() => assertReleasePreviewSafety({ ...safeEnvironment(), TRANSACTIONAL_EMAIL_MODE: mode }))
      .toThrow("TRANSACTIONAL_EMAIL_MODE");
  });

  it("detects hidden Production references without exposing the value or reference", () => {
    const value = `postgresql://private-sentinel@db.${PRODUCTION_REF}.supabase.co/postgres`;
    const environment = { ...safeEnvironment(), UNRELATED_RESOURCE: value };
    expect(() => assertReleasePreviewSafety(environment)).toThrow("Production Supabase project reference");
    try { assertReleasePreviewSafety(environment); } catch (error) {
      expect(String(error)).not.toContain("private-sentinel");
      expect(String(error)).not.toContain(PRODUCTION_REF);
    }
  });

  it("runs at config evaluation before the legacy check and application build", () => {
    const config = readFileSync("next.config.ts", "utf8");
    expect(config.indexOf("assertReleasePreviewSafety();")).toBeLessThan(config.indexOf("assertP03PreviewSafety();"));
    expect(config.indexOf("assertReleasePreviewSafety();")).toBeLessThan(config.indexOf("const nextConfig"));
  });

  it("fails an allowed branch at config evaluation before application imports when resources are missing", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", REVIEW_BRANCHES[0]);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://unapproved.invalid");
    await expect(import("@/next.config")).rejects.toThrow("Staging Preview isolation check failed");
  });

  it.each(["production", "development", undefined])("preserves existing non-Preview behavior: %s", (vercelEnvironment) => {
    expect(() => assertReleasePreviewSafety({
      VERCEL_ENV: vercelEnvironment, VERCEL_GIT_COMMIT_REF: REVIEW_BRANCHES[0],
      NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_REF}.supabase.co`, CLERK_SECRET_KEY: "sk_live_synthetic",
    })).not.toThrow();
  });
});
