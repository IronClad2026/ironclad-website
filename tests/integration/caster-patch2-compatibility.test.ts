import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  protect: vi.fn(),
  notice: vi.fn(),
  useClerkRequest: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  clerkMiddleware: (callback: (auth: unknown, request: unknown) => unknown) =>
    (request: unknown, event: { auth: unknown }) => mocks.useClerkRequest(() => callback(event.auth, request)),
}));
vi.mock("@/lib/public-gaming-profile-notice-server", () => ({ loadPublicGamingProfileNotice: mocks.notice }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: () => ({ rpc: mocks.rpc }) }));

import { POST as acceptLegal } from "@/app/api/caster/legal-acceptance/route";
import { assertCasterFeaturePreviewBuildEnvironment, getCasterInvitationOrigin } from "@/lib/caster/environment";
import { readCasterLayoutContext } from "@/lib/caster/layout-context";
import { CASTER_LAYOUT_HEADER } from "@/lib/caster/routes";
import proxy from "@/proxy";

const origin = "http://localhost:3013";
const identity = { userId: "user_newCaster", sessionId: "sess_caster" };
const localEnvironment = {
  NODE_ENV: "test",
  CASTER_PROGRAM_ENABLED: "true",
  CASTER_PROGRAM_ORIGIN: origin,
  CASTER_CONTINUATION_KEY: Buffer.alloc(32, 13).toString("base64url"),
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_fixture",
  CLERK_SECRET_KEY: "sk_test_fixture",
  SUPABASE_SERVICE_ROLE_KEY: "fixture-local-service-role",
  TRANSACTIONAL_EMAIL_MODE: "disabled",
};
const terms = "63393f0e-5458-45f0-a6d7-5e2868d5a349";
const privacy = "36621cc5-f8e0-4b1a-85ee-eb16d457c536";
const receipt = [{
  acceptance_id: "b0f6afe5-3704-47e1-9944-96c942af4681",
  accepted_at: "2026-11-26T10:00:00.000Z",
  terms_document_id: terms,
  privacy_document_id: privacy,
}];
const handler = proxy as unknown as (
  request: NextRequest,
  event: { auth: typeof mocks.auth & { protect: typeof mocks.protect } },
) => Promise<Response | undefined>;

function throughProxy(path: string, method = "GET", headers?: HeadersInit) {
  return handler(new NextRequest(origin + path, { method, headers }), { auth: Object.assign(mocks.auth, { protect: mocks.protect }) });
}

function legalForm() {
  return new URLSearchParams({
    termsDocumentId: terms,
    privacyDocumentId: privacy,
    termsAccepted: "accepted",
    privacyAcknowledged: "acknowledged",
  });
}

function legalPost(body = legalForm(), requestOrigin = origin, nextAction = false) {
  const headers = new Headers({ origin: requestOrigin, "content-type": "application/x-www-form-urlencoded" });
  if (nextAction) headers.set("next-action", "other-action");
  return acceptLegal(new Request(`${origin}/api/caster/legal-acceptance`, { method: "POST", body, headers }));
}

beforeEach(() => {
  for (const [key, value] of Object.entries(localEnvironment)) vi.stubEnv(key, value);
  for (const key of ["VERCEL", "VERCEL_ENV", "WEB_PUSH_VAPID_PUBLIC_KEY", "WEB_PUSH_VAPID_PRIVATE_KEY", "WEB_PUSH_VAPID_SUBJECT"]) vi.stubEnv(key, undefined);
  vi.stubEnv("PATCH2_PUBLIC_PROFILE_NOTICE_ENABLED", "true");
  mocks.auth.mockResolvedValue(identity);
  mocks.protect.mockResolvedValue(undefined);
  mocks.notice.mockResolvedValue("required");
  mocks.useClerkRequest.mockImplementation((next: () => unknown) => next());
  mocks.rpc.mockReturnValue({ abortSignal: () => Promise.resolve({ data: receipt, error: null }) });
});

afterEach(() => vi.unstubAllEnvs());

describe("caster-specific Patch 2 exception", () => {
  it("serves only the exact public invitation GET and HEAD before Clerk can send a handshake redirect", async () => {
    const clerkRedirect = Response.redirect("https://clerk.test/handshake");
    mocks.useClerkRequest.mockReturnValue(clerkRedirect);
    expect((await throughProxy("/casters/invitation"))?.headers.get("x-middleware-next")).toBe("1");
    expect((await throughProxy("/casters/invitation", "HEAD"))?.headers.get("location")).toBeNull();
    expect((await throughProxy("/api/caster/invitation/prepare", "POST"))?.headers.get("x-middleware-next")).toBe("1");
    expect(mocks.useClerkRequest).not.toHaveBeenCalled();
    expect(await throughProxy("/casters/invitation", "POST")).toBe(clerkRedirect);
  });

  it.each([
    "/caster-studio/sign-in", "/caster-studio/sign-in/factor-two", "/caster-studio/sign-in/verify",
    "/caster-studio/sign-in/reset-password", "/caster-studio/sign-in/reset-password-success",
    "/caster-studio/sign-in/sso-callback", "/caster-studio/sign-in/tasks/setup-mfa",
    "/caster-studio/sign-in/create/verify-email-address", "/caster-studio/sign-up/verify-email-address",
    "/caster-studio/sign-up/continue/verify-email-address", "/caster-studio/sign-up/sso-callback",
  ])(
    "allows the exact public or Clerk read %s", async (path) => {
      mocks.auth.mockResolvedValue({ userId: null });
      expect((await throughProxy(path))?.headers.get("x-middleware-next")).toBe("1");
      expect(mocks.protect).not.toHaveBeenCalled();
      expect(mocks.notice).not.toHaveBeenCalled();
    },
  );

  it("preserves the competitive gate and its destination for a caster-only identity", async () => {
    const studio = await throughProxy("/caster-studio");
    expect(readCasterLayoutContext(studio?.headers.get(`x-middleware-request-${CASTER_LAYOUT_HEADER}`) ?? null))
      .toEqual({ view: "studio", legalError: null });
    expect(studio?.headers.get("x-middleware-request-x-ironclad-notice-layout")).toBeNull();
    expect(mocks.notice).not.toHaveBeenCalled();

    const competitive = await throughProxy("/profile?from=caster", "GET", { [CASTER_LAYOUT_HEADER]: "studio" });
    const destination = new URL(competitive!.headers.get("location")!);
    expect(competitive?.status).toBe(303);
    expect(destination.pathname).toBe("/account/public-profile-notice");
    expect(destination.searchParams.get("returnTo")).toBe("/profile?from=caster");
  });

  it("authenticates the exact protected request and returns anonymous studio visits to the clean Clerk route", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await throughProxy("/caster-studio?returnTo=https://bad.example"))?.headers.get("location"))
      .toBe(`${origin}/caster-studio/sign-in`);
    expect((await throughProxy("/api/caster/legal-acceptance", "POST"))?.status).toBe(401);
    expect((await throughProxy("/api/caster/invitation/claim", "POST"))?.status).toBe(401);
    expect((await throughProxy("/api/caster/invitation/prepare", "POST"))?.headers.get("x-middleware-next")).toBe("1");
  });

  it.each([
    "/caster-studio", "/caster-studio/sign-up", "/casters/invitation", "/caster-studio/other",
    "/api/caster/unrecognised", "/api/steam/connect", "/tournaments", "/api/match-proofs/replay",
  ])("keeps %s outside the POST exception", async (path) => {
    expect((await throughProxy(path, "POST", { [CASTER_LAYOUT_HEADER]: "studio" }))?.status).toBe(403);
  });

  it("rejects Server Action dispatch and scrubbed layout headers while keeping native caster writes independent", async () => {
    for (const path of ["/api/caster/legal-acceptance", "/api/caster/invitation/claim", "/api/caster/invitation/prepare"]) {
      expect((await throughProxy(path, "POST", { "next-action": "forged" }))?.status).toBe(403);
      expect((await throughProxy(path, "POST"))?.headers.get("x-middleware-next")).toBe("1");
    }
    const studio = await throughProxy("/caster-studio?legal=unexpected", "GET", { [CASTER_LAYOUT_HEADER]: "studio.retry" });
    expect(readCasterLayoutContext(studio?.headers.get(`x-middleware-request-${CASTER_LAYOUT_HEADER}`) ?? null))
      .toEqual({ view: "studio", legalError: null });
    expect((await throughProxy("/caster-studio/sign-up/continue/other"))?.status).toBe(303);
    expect((await throughProxy("/caster-studio", "HEAD"))?.headers.get("x-middleware-next")).toBe("1");
  });

  it("rejects unsigned, tampered and expired settings on requests the global matcher could skip", async () => {
    const studio = await throughProxy("/caster-studio?legal=retry");
    const signed = studio?.headers.get(`x-middleware-request-${CASTER_LAYOUT_HEADER}`) ?? null;
    expect(readCasterLayoutContext(signed)).toEqual({ view: "studio", legalError: "retry" });
    expect(readCasterLayoutContext("auth")).toBeNull();
    expect(readCasterLayoutContext(signed?.replace("studio.", "auth.") ?? null)).toBeNull();
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 61_000);
    expect(readCasterLayoutContext(signed)).toBeNull();
  });

  it("keeps the generic disabled invitation card public without unblocking studio or API access", async () => {
    vi.stubEnv("CASTER_PROGRAM_ENABLED", "false");
    expect((await throughProxy("/casters/invitation", "HEAD"))?.headers.get("x-middleware-next")).toBe("1");
    expect((await throughProxy("/caster-studio"))?.status).toBe(303);
    expect((await throughProxy("/api/caster/legal-acceptance", "POST"))?.status).toBe(403);
    expect((await legalPost()).status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("caster legal adapter", () => {
  it("uses the signed-in actor and exact document pair through the closure-safe canonical transaction wrapper", async () => {
    const response = await legalPost();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${origin}/caster-studio`);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("caster_phase1_accept_legal", {
      p_actor: identity.userId, p_terms_document_id: terms, p_privacy_document_id: privacy,
    });
    expect(mocks.notice).not.toHaveBeenCalled();
  });

  it("requires a trusted origin, a signed-in session and no Server Action envelope", async () => {
    expect((await legalPost(legalForm(), "https://bad.example")).status).toBe(403);
    expect((await legalPost(legalForm(), origin, true)).status).toBe(403);
    mocks.auth.mockResolvedValue({ userId: null, sessionId: null });
    expect((await legalPost()).headers.get("location")).toBe(`${origin}/caster-studio/sign-in`);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each(["subject", "returnTo", "termsDocumentId"])("rejects injected or duplicate %s", async (field) => {
    const form = legalForm();
    form.append(field, "https://bad.example");
    expect((await legalPost(form)).headers.get("location")).toBe(`${origin}/caster-studio?legal=required`);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("bounds the posted legal form body before invoking database authority", async () => {
    const form = legalForm();
    form.set("termsAccepted", "x".repeat(3_000));
    expect((await legalPost(form)).headers.get("location")).toBe(`${origin}/caster-studio?legal=required`);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each(["stale legal document", "closed account", "unavailable provider"])("fails closed for %s", async (reason) => {
    mocks.rpc.mockReturnValueOnce({ abortSignal: () => Promise.resolve({ data: null, error: { message: reason } }) });
    expect((await legalPost()).headers.get("location")).toBe(`${origin}/caster-studio?legal=retry`);
  });
});

describe("caster runtime isolation", () => {
  it("requires opt-in, loopback resources, test Clerk and disabled delivery for local development", () => {
    expect(getCasterInvitationOrigin(localEnvironment)).toBe(origin);
    for (const override of [
      { CASTER_PROGRAM_ENABLED: undefined }, { VERCEL_ENV: "production" },
      { NEXT_PUBLIC_SUPABASE_URL: "https://nsyjtqpvyxlzyujlbzos.supabase.co" },
      { CLERK_SECRET_KEY: "sk_live_fixture" }, { CASTER_PROGRAM_ORIGIN: "https://ironcladtournaments.com" },
      { CASTER_CONTINUATION_KEY: "too-short" }, { CASTER_CONTINUATION_KEY: undefined },
      { TRANSACTIONAL_EMAIL_MODE: "allowlist" }, { WEB_PUSH_VAPID_PRIVATE_KEY: "configured" },
    ]) expect(getCasterInvitationOrigin({ ...localEnvironment, ...override })).toBeNull();
  });

  it("accepts only the pinned hosted Staging project, host, Clerk domain and verified opt-in", () => {
    const stagingOrigin = "https://ironclad-website-git-staging-ironclad-tournaments.vercel.app";
    const environment = {
      ...localEnvironment,
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "staging",
      CASTER_PROGRAM_ORIGIN: stagingOrigin,
      CASTER_HOSTED_ISOLATION_VERIFIED: "true",
      NEXT_PUBLIC_SUPABASE_URL: "https://zzbnneprhjicmajpjkdg.supabase.co",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from("guided-goshawk-34.clerk.accounts.dev$").toString("base64url")}`,
      SUPABASE_SERVICE_ROLE_KEY: `header.${Buffer.from(JSON.stringify({ ref: "zzbnneprhjicmajpjkdg", role: "service_role" })).toString("base64url")}.sig`,
    };
    expect(getCasterInvitationOrigin(environment)).toBe(stagingOrigin);
    expect(getCasterInvitationOrigin({ ...environment, CASTER_HOSTED_ISOLATION_VERIFIED: undefined })).toBeNull();
    expect(getCasterInvitationOrigin({ ...environment, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_fixture" })).toBeNull();
    expect(getCasterInvitationOrigin({ ...environment, SUPABASE_SERVICE_ROLE_KEY: "unverified" })).toBeNull();
    expect(getCasterInvitationOrigin({ ...environment, CASTER_PROGRAM_ORIGIN: "https://other.vercel.app" })).toBeNull();
  });

  it("keeps the protected feature branch origin stable across redeploys and rejects other targets", () => {
    const branchHost = "ironclad-website-git-codex-caster-c7a2-ironclad-tournaments.vercel.app";
    const environment = {
      ...localEnvironment,
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "codex/caster-phase-1-invitations",
      VERCEL_PROJECT_ID: "prj_5os8tdLLkgGUSWnrxpiYj6OI6YEB",
      VERCEL_BRANCH_URL: branchHost,
      VERCEL_URL: "ironclad-website-build1-ironclad-tournaments.vercel.app",
      CASTER_PROGRAM_ORIGIN: `https://${branchHost}`,
      CASTER_HOSTED_ISOLATION_VERIFIED: "true",
      NEXT_PUBLIC_SUPABASE_URL: "https://zzbnneprhjicmajpjkdg.supabase.co",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from("guided-goshawk-34.clerk.accounts.dev$").toString("base64url")}`,
      SUPABASE_SERVICE_ROLE_KEY: `header.${Buffer.from(JSON.stringify({ ref: "zzbnneprhjicmajpjkdg", role: "service_role" })).toString("base64url")}.sig`,
    };
    expect(getCasterInvitationOrigin(environment)).toBe(`https://${branchHost}`);
    expect(getCasterInvitationOrigin({ ...environment, VERCEL_URL: "ironclad-website-build2-ironclad-tournaments.vercel.app" })).toBe(`https://${branchHost}`);
    for (const override of [
      { VERCEL_ENV: "production" }, { VERCEL_PROJECT_ID: "prj_other" }, { VERCEL_PROJECT_ID: undefined },
      { VERCEL_GIT_COMMIT_REF: "codex/another-branch" }, { VERCEL_BRANCH_URL: undefined },
      { VERCEL_BRANCH_URL: "other.vercel.app", CASTER_PROGRAM_ORIGIN: "https://other.vercel.app" },
      { CASTER_PROGRAM_ORIGIN: "https://ironclad-website-git-staging-ironclad-tournaments.vercel.app" },
      { WEB_PUSH_VAPID_PUBLIC_KEY: "configured" },
    ]) expect(getCasterInvitationOrigin({ ...environment, ...override })).toBeNull();

    expect(getCasterInvitationOrigin({ ...environment, CASTER_PROGRAM_ORIGIN: `https://${environment.VERCEL_URL}` }))
      .toBe(`https://${environment.VERCEL_URL}`);

    const disabledBuild = { ...environment, CASTER_PROGRAM_ENABLED: "false", PATCH2_PUBLIC_PROFILE_NOTICE_ENABLED: "true" };
    expect(() => assertCasterFeaturePreviewBuildEnvironment(disabledBuild)).not.toThrow();
    for (const override of [
      { VERCEL_ENV: "production" }, { VERCEL_PROJECT_ID: "prj_other" }, { SUPABASE_SERVICE_ROLE_KEY: undefined },
      { CLERK_SECRET_KEY: "sk_live_fixture" }, { TRANSACTIONAL_EMAIL_MODE: "allowlist" }, { WEB_PUSH_VAPID_SUBJECT: "configured" },
      { PATCH2_PUBLIC_PROFILE_NOTICE_ENABLED: undefined },
    ]) expect(() => assertCasterFeaturePreviewBuildEnvironment({ ...disabledBuild, ...override })).toThrow("Caster feature build requires");
    expect(() => assertCasterFeaturePreviewBuildEnvironment({ VERCEL_GIT_COMMIT_REF: "staging" })).not.toThrow();
  });
});
