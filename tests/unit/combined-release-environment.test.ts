import { describe, expect, it, vi } from "vitest";
import { assertCasterBuildEnvironment, getCasterInvitationOrigin } from "@/lib/caster/environment";
import { verifyProductionFeatureCredentials } from "@/lib/ironclad-release-verification";
import { assertReadyBuildEnvironment, isReadyEnabled, isReadyEngagementEnabled, readyReviewAliases } from "@/lib/ready/review-access";
import { isReadyWardrobePilotEnabled } from "@/lib/wardrobe/environment";

const productionRef = "nsyjtqpvyxlzyujlbzos";
const stagingRef = "zzbnneprhjicmajpjkdg";
const token = (ref: string, role = "service_role") => `unsigned.${Buffer.from(JSON.stringify({ ref, role })).toString("base64url")}.fixture`;
const key = (mode: string, host: string) => `pk_${mode}_${Buffer.from(`${host}$`).toString("base64url")}`;
const production = {
  VERCEL_ENV: "production",
  VERCEL_PROJECT_ID: "prj_5os8tdLLkgGUSWnrxpiYj6OI6YEB",
  VERCEL_PROJECT_PRODUCTION_URL: "www.ironcladtournaments.com",
  IRONCLAD_PRODUCTION_IDENTITY_VERIFIED: "true",
  NEXT_PUBLIC_SUPABASE_URL: `https://${productionRef}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: token(productionRef, "anon"),
  SUPABASE_SERVICE_ROLE_KEY: token(productionRef),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: key("live", "clerk.ironcladtournaments.com"),
  CLERK_SECRET_KEY: "sk_live_fixture",
  PATCH2_PUBLIC_PROFILE_NOTICE_ENABLED: "true",
  PATCH2_ADMIN_INBOX_ENABLED: "true",
};
const optedIn = { ...production, READY_PROGRAM_ENABLED: "true", CASTER_PROGRAM_ENABLED: "true" };

describe("combined release environment", () => {
  it("leaves Production off by default", () => {
    expect(isReadyEnabled(production)).toBe(false);
    expect(getCasterInvitationOrigin(production)).toBeNull();
    expect(isReadyEngagementEnabled(production)).toBe(false);
    expect(isReadyWardrobePilotEnabled(production)).toBe(false);
  });

  it("enables the verified Production features independently and keeps Stage reviewer aliases out", () => {
    expect(isReadyEnabled(optedIn)).toBe(true);
    expect(getCasterInvitationOrigin(optedIn)).toBe("https://www.ironcladtournaments.com");
    expect(isReadyEngagementEnabled(optedIn)).toBe(false);
    expect(isReadyWardrobePilotEnabled(optedIn)).toBe(false);
    expect(isReadyEngagementEnabled({ ...optedIn, READY_ENGAGEMENT_ENABLED: "true" })).toBe(true);
    expect(isReadyWardrobePilotEnabled({ ...optedIn, READY_WARDROBE_PILOT_ENABLED: "true" })).toBe(true);
    expect(readyReviewAliases({ ...optedIn, READY_STAGING_REVIEW_ALIASES: "TestAcademy1" })).toEqual([]);
  });

  it.each([
    { VERCEL_ENV: "preview" }, { VERCEL_PROJECT_ID: "wrong-project" }, { VERCEL_PROJECT_PRODUCTION_URL: "example.test" },
    { IRONCLAD_PRODUCTION_IDENTITY_VERIFIED: undefined }, { PATCH2_PUBLIC_PROFILE_NOTICE_ENABLED: "false" },
    { NEXT_PUBLIC_SUPABASE_URL: `https://${stagingRef}.supabase.co` },
    { NEXT_PUBLIC_SUPABASE_ANON_KEY: token(stagingRef, "anon") }, { SUPABASE_SERVICE_ROLE_KEY: token(stagingRef) },
    { SUPABASE_SERVICE_ROLE_KEY: undefined }, { CLERK_SECRET_KEY: "sk_test_fixture" },
    { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: key("live", "unrelated.example.test") },
    { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: key("test", "guided-goshawk-34.clerk.accounts.dev") },
  ])("fails closed for mismatched or missing identity %o", (mismatch) => {
    const environment = { ...optedIn, ...mismatch };
    expect(isReadyEnabled(environment)).toBe(false);
    expect(getCasterInvitationOrigin(environment)).toBeNull();
    expect(() => assertReadyBuildEnvironment(environment)).toThrow();
    expect(() => assertCasterBuildEnvironment(environment)).toThrow();
  });

  it("preserves the canonical Stage Caster boundary and rejects the Production origin in Stage", () => {
    const environment = {
      VERCEL_ENV: "preview", VERCEL_PROJECT_ID: production.VERCEL_PROJECT_ID, VERCEL_GIT_COMMIT_REF: "staging",
      NEXT_PUBLIC_SUPABASE_URL: `https://${stagingRef}.supabase.co`, SUPABASE_SERVICE_ROLE_KEY: token(stagingRef),
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: key("test", "guided-goshawk-34.clerk.accounts.dev"), CLERK_SECRET_KEY: "sk_test_fixture",
      CASTER_PROGRAM_ENABLED: "true", PATCH2_PUBLIC_PROFILE_NOTICE_ENABLED: "true", CASTER_HOSTED_ISOLATION_VERIFIED: "true",
      TRANSACTIONAL_EMAIL_MODE: "disabled",
    };
    expect(getCasterInvitationOrigin(environment)).toBe("https://ironclad-website-git-staging-ironclad-tournaments.vercel.app");
    expect(getCasterInvitationOrigin({ ...environment, CASTER_PROGRAM_ORIGIN: "https://www.ironcladtournaments.com" })).toBeNull();
    expect(getCasterInvitationOrigin({ ...environment, SUPABASE_SERVICE_ROLE_KEY: token(productionRef) })).toBeNull();
  });

  it("uses read-only provider checks to bind opaque keys and a live Clerk secret without cross-origin redirects", async () => {
    const request = vi.fn(async (url: string | URL | Request) => {
      const target = new URL(String(url));
      if (target.pathname === "/v1/instance") return Response.json({ environment_type: "production" });
      if (target.pathname === "/v1/domains") {
        return Response.json({ data: [{ is_satellite: false, frontend_api_url: "https://clerk.ironcladtournaments.com" }] });
      }
      return Response.json([]);
    });
    await verifyProductionFeatureCredentials(production, request as typeof fetch);
    expect(request).not.toHaveBeenCalled();
    await verifyProductionFeatureCredentials(optedIn, request as typeof fetch);
    expect(request).toHaveBeenCalledTimes(4);
    expect(request.mock.calls.map(([url]) => new URL(String(url)).hostname).sort()).toEqual([
      "api.clerk.com", "api.clerk.com", `${productionRef}.supabase.co`, `${productionRef}.supabase.co`,
    ]);
    const wrongDomain = vi.fn(async (url: string | URL | Request) => String(url).endsWith("/domains")
      ? Response.json({ data: [{ is_satellite: false, frontend_api_url: "https://other.example" }] }) : request(url));
    await expect(verifyProductionFeatureCredentials(optedIn, wrongDomain as typeof fetch)).rejects.toThrow(/credential bindings/);
  });
});
