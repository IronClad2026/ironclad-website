import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  protect: vi.fn(),
  notice: vi.fn(),
  useClerkRequest: vi.fn(),
  rpc: vi.fn(),
  revokeSession: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  clerkClient: async () => ({ sessions: { revokeSession: mocks.revokeSession, getSession: mocks.getSession } }),
  clerkMiddleware: (callback: (auth: unknown, request: unknown) => unknown) =>
    (request: unknown, event: { auth: unknown }) => mocks.useClerkRequest(() => callback(event.auth, request)),
}));
vi.mock("@/lib/public-gaming-profile-notice-server", () => ({ loadPublicGamingProfileNotice: mocks.notice }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/components/legal/AccountLegalUpdateGate", () => ({ default: () => null }));

import { POST as acceptLegal } from "@/app/api/caster/legal-acceptance/route";
import { POST as signOut } from "@/app/api/caster/sign-out/route";
import CasterStudioLegalGate from "@/app/caster-studio/CasterStudioLegalGate";
import { assertCasterBuildEnvironment, getCasterInvitationOrigin } from "@/lib/caster/environment";
import { CASTER_CHROME_HEADER, CASTER_SIGN_OUT_PATH } from "@/lib/caster/routes";
import proxy, { config as proxyConfig } from "@/proxy";

const origin = "http://localhost:3013";
const identity = { userId: "user_newCaster", sessionId: "sess_caster" };
const revokedSession = { id: identity.sessionId, userId: identity.userId, status: "revoked" };
const localEnvironment = {
  NODE_ENV: "test",
  CASTER_PROGRAM_ENABLED: "true",
  CASTER_PROGRAM_ORIGIN: origin,
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
const forwardedChromeHeader = `x-middleware-request-${CASTER_CHROME_HEADER}`;
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

function signOutPost(requestOrigin = origin, nextAction = false) {
  const headers = new Headers({
    origin: requestOrigin,
    cookie: "__session=old; __session_test_123=old; __client_uat=1; __Host-ironclad-caster=pending; other=keep",
  });
  if (nextAction) headers.set("next-action", "forged");
  return signOut(new NextRequest(`${origin}${CASTER_SIGN_OUT_PATH}`, {
    method: "POST",
    body: new URLSearchParams({ sessionId: "sess_other", redirect: "https://bad.example" }),
    headers,
  }));
}

beforeEach(() => {
  for (const [key, value] of Object.entries(localEnvironment)) vi.stubEnv(key, value);
  for (const key of ["VERCEL", "VERCEL_ENV", "WEB_PUSH_VAPID_PUBLIC_KEY", "WEB_PUSH_VAPID_PRIVATE_KEY", "WEB_PUSH_VAPID_SUBJECT"]) vi.stubEnv(key, undefined);
  vi.stubEnv("PATCH2_PUBLIC_PROFILE_NOTICE_ENABLED", "true");
  mocks.auth.mockResolvedValue(identity);
  mocks.protect.mockResolvedValue(undefined);
  mocks.notice.mockResolvedValue({ status: "required", version: "public-gaming-profile-v1" });
  mocks.useClerkRequest.mockImplementation((next: () => unknown) => next());
  mocks.rpc.mockReturnValue({ abortSignal: () => Promise.resolve({ data: receipt, error: null }) });
  mocks.revokeSession.mockReset().mockResolvedValue(revokedSession);
  mocks.getSession.mockReset().mockResolvedValue(revokedSession);
});

afterEach(() => vi.unstubAllEnvs());

describe("caster-specific Patch 2 exception", () => {
  it("serves only the exact public invitation GET and HEAD before Clerk can send a handshake redirect", async () => {
    const clerkRedirect = Response.redirect("https://clerk.test/handshake");
    mocks.useClerkRequest.mockReturnValue(clerkRedirect);
    expect((await throughProxy("/casters/invitation"))?.headers.get("x-middleware-next")).toBe("1");
    expect((await throughProxy("/casters/invitation", "HEAD"))?.headers.get("location")).toBeNull();
    expect((await throughProxy("/casters/invitation", "HEAD", { [CASTER_CHROME_HEADER]: "bare" }))?.headers.get(forwardedChromeHeader)).toBeNull();
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
      const response = await throughProxy(path);
      expect(response?.headers.get("x-middleware-next")).toBe("1");
      expect(response?.headers.get(forwardedChromeHeader)).toBe("bare");
      expect(mocks.protect).not.toHaveBeenCalled();
      expect(mocks.notice).not.toHaveBeenCalled();
    },
  );

  it("preserves the competitive gate and its destination for a caster-only identity", async () => {
    const studio = await throughProxy("/caster-studio");
    expect(studio?.headers.get("cache-control")).toBe("private, no-store");
    expect(studio?.headers.get(forwardedChromeHeader)).toBe("bare");
    expect(studio?.headers.get("x-middleware-request-x-ironclad-notice-layout")).toBeNull();
    expect(mocks.notice).not.toHaveBeenCalled();

    const competitive = await throughProxy("/profile?from=caster", "GET", { [CASTER_CHROME_HEADER]: "bare" });
    const destination = new URL(competitive!.headers.get("location")!);
    expect(competitive?.status).toBe(303);
    expect(destination.pathname).toBe("/account/public-profile-notice");
    expect(destination.searchParams.get("returnTo")).toBe("/profile?from=caster");
  });

  it("authenticates the exact protected request and returns anonymous studio visits to the clean Clerk route", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    const studio = await throughProxy("/caster-studio?returnTo=https://bad.example", "GET", { [CASTER_CHROME_HEADER]: "bare" });
    expect(studio?.headers.get("location"))
      .toBe(`${origin}/caster-studio/sign-in`);
    expect(studio?.headers.get(forwardedChromeHeader)).toBeNull();
    expect((await throughProxy("/api/caster/legal-acceptance", "POST"))?.status).toBe(401);
    expect((await throughProxy("/api/caster/invitation/claim", "POST"))?.status).toBe(401);
    expect((await throughProxy(CASTER_SIGN_OUT_PATH, "POST"))?.status).toBe(401);
    expect((await throughProxy("/api/caster/invitation/prepare", "POST"))?.headers.get("x-middleware-next")).toBe("1");
  });

  it.each([
    "/caster-studio", "/caster-studio/sign-up", "/casters/invitation", "/caster-studio/other",
    "/api/caster/unrecognised", "/api/steam/connect", "/tournaments", "/api/match-proofs/replay",
  ])("keeps %s outside the POST exception", async (path) => {
    expect((await throughProxy(path, "POST", { [CASTER_CHROME_HEADER]: "bare" }))?.status).toBe(403);
  });

  it("rejects Server Action dispatch and strips the chrome marker from native caster writes", async () => {
    for (const path of ["/api/caster/legal-acceptance", "/api/caster/invitation/claim", "/api/caster/invitation/prepare", CASTER_SIGN_OUT_PATH]) {
      expect((await throughProxy(path, "POST", { "next-action": "forged" }))?.status).toBe(403);
      const response = await throughProxy(path, "POST", { [CASTER_CHROME_HEADER]: "bare" });
      expect(response?.headers.get("x-middleware-next")).toBe("1");
      expect(response?.headers.get(forwardedChromeHeader)).toBeNull();
    }
    const studio = await throughProxy("/caster-studio?legal=unexpected", "GET", { [CASTER_CHROME_HEADER]: "studio.retry" });
    expect(studio?.headers.get(forwardedChromeHeader)).toBe("bare");
    expect((await throughProxy("/caster-studio/sign-up/continue/other"))?.status).toBe(303);
    expect((await throughProxy("/caster-studio", "HEAD"))?.headers.get("x-middleware-next")).toBe("1");
  });

  it("offers only the exact POST sign-out route while the competitive notice is pending", async () => {
    expect((await throughProxy(CASTER_SIGN_OUT_PATH))?.status).toBe(403);
    expect((await throughProxy(`${CASTER_SIGN_OUT_PATH}/other`, "POST"))?.status).toBe(403);
    expect((await throughProxy(CASTER_SIGN_OUT_PATH, "POST"))?.headers.get("x-middleware-next")).toBe("1");
  });

  it("scrubs caller-supplied chrome markers on ordinary and file-like URLs, including app-router requests", async () => {
    vi.stubEnv("PATCH2_PUBLIC_PROFILE_NOTICE_ENABLED", "false");
    const headers = { [CASTER_CHROME_HEADER]: "bare", rsc: "1", "next-router-prefetch": "1" };
    for (const url of ["/", "/news/article.png", "/_next/data/build/news/article.png.json"]) {
      expect(unstable_doesMiddlewareMatch({ config: proxyConfig, url, headers })).toBe(true);
      const response = await throughProxy(url, "GET", headers);
      expect(response?.headers.get("x-middleware-next")).toBe("1");
      expect(response?.headers.get(forwardedChromeHeader)).toBeNull();
    }
    expect(unstable_doesMiddlewareMatch({ config: proxyConfig, url: "/images/ironclad-logo.png" })).toBe(false);
  });

  it("renders the studio-owned legal gate independently of the chrome marker", async () => {
    const children = "private caster page";
    const legalGate = await CasterStudioLegalGate({ children, locale: "en", legalError: "retry" });
    expect(legalGate.props).toMatchObject({ children, casterSubmission: true, formError: "unavailable" });
    const unsupportedError = await CasterStudioLegalGate({ children, locale: "en", legalError: ["retry", "required"] });
    expect(unsupportedError.props).toMatchObject({ children, casterSubmission: true, formError: undefined });
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

describe("caster sign-out handler", () => {
  it("revokes the Clerk-authenticated session before redirecting and retains the continuation and device state", async () => {
    const response = await signOutPost();
    expect(mocks.revokeSession).toHaveBeenCalledExactlyOnceWith(identity.sessionId);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${origin}/caster-studio/sign-in`);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.getSetCookie()).toEqual([
      expect.stringMatching(/^__session=;.*Max-Age=0/),
      expect.stringMatching(/^__session_test_123=;.*Max-Age=0/),
    ]);
  });

  it("rejects forged origins, Server Actions and unauthenticated requests before calling Clerk", async () => {
    expect((await signOutPost("https://bad.example")).status).toBe(403);
    expect((await signOutPost(origin, true)).status).toBe(403);
    mocks.auth.mockResolvedValue({ userId: null, sessionId: null });
    expect((await signOutPost()).status).toBe(401);
    expect(mocks.revokeSession).not.toHaveBeenCalled();
  });

  it("handles an already-ended session and refuses to claim success if Clerk has an active or different session", async () => {
    mocks.revokeSession.mockRejectedValue(new Error("provider"));
    expect((await signOutPost()).headers.get("location")).toBe(`${origin}/caster-studio/sign-in`);
    expect(mocks.getSession).toHaveBeenCalledExactlyOnceWith(identity.sessionId);
    for (const session of [{ ...revokedSession, status: "active" }, { ...revokedSession, userId: "user_other" }]) {
      mocks.getSession.mockResolvedValueOnce(session);
      const response = await signOutPost();
      expect(response.headers.get("location")).toBe(`${origin}/caster-studio?signOut=retry`);
      expect(response.headers.getSetCookie()).toEqual([]);
    }
    mocks.getSession.mockRejectedValueOnce(new Error("provider"));
    expect((await signOutPost()).headers.get("location")).toBe(`${origin}/caster-studio?signOut=retry`);
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
      { TRANSACTIONAL_EMAIL_MODE: "allowlist" }, { WEB_PUSH_VAPID_PRIVATE_KEY: "configured" },
    ]) expect(getCasterInvitationOrigin({ ...localEnvironment, ...override })).toBeNull();
  });

  it("uses only the protected canonical Staging alias and permits attested push suppression", () => {
    const stagingOrigin = "https://ironclad-website-git-staging-ironclad-tournaments.vercel.app";
    const environment = {
      ...localEnvironment,
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "staging",
      VERCEL_PROJECT_ID: "prj_5os8tdLLkgGUSWnrxpiYj6OI6YEB",
      PATCH2_PUBLIC_PROFILE_NOTICE_ENABLED: "true",
      CASTER_PROGRAM_ORIGIN: undefined,
      CASTER_HOSTED_ISOLATION_VERIFIED: "true",
      WEB_PUSH_VAPID_PUBLIC_KEY: "configured",
      WEB_PUSH_VAPID_PRIVATE_KEY: "configured",
      WEB_PUSH_VAPID_SUBJECT: "configured",
      NEXT_PUBLIC_SUPABASE_URL: "https://zzbnneprhjicmajpjkdg.supabase.co",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from("guided-goshawk-34.clerk.accounts.dev$").toString("base64url")}`,
      SUPABASE_SERVICE_ROLE_KEY: `header.${Buffer.from(JSON.stringify({ ref: "zzbnneprhjicmajpjkdg", role: "service_role" })).toString("base64url")}.sig`,
    };
    expect(getCasterInvitationOrigin(environment)).toBe(stagingOrigin);
    expect(getCasterInvitationOrigin({ ...environment, CASTER_PROGRAM_ORIGIN: stagingOrigin })).toBe(stagingOrigin);
    expect(getCasterInvitationOrigin({ ...environment, VERCEL_URL: "another-deployment.vercel.app" })).toBe(stagingOrigin);
    expect(() => assertCasterBuildEnvironment(environment)).not.toThrow();
    for (const override of [
      { VERCEL_ENV: "production" }, { VERCEL_PROJECT_ID: "prj_other" }, { VERCEL_PROJECT_ID: undefined },
      { VERCEL_GIT_COMMIT_REF: "codex/caster-phase-1-invitations" }, { CASTER_PROGRAM_ORIGIN: "https://other.vercel.app" },
      { SUPABASE_SERVICE_ROLE_KEY: "unverified" }, { NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co" },
      { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_fixture" }, { CLERK_SECRET_KEY: "sk_live_fixture" },
      { TRANSACTIONAL_EMAIL_MODE: "allowlist" }, { CASTER_HOSTED_ISOLATION_VERIFIED: undefined },
      { PATCH2_PUBLIC_PROFILE_NOTICE_ENABLED: undefined },
    ]) {
      expect(getCasterInvitationOrigin({ ...environment, ...override })).toBeNull();
      expect(() => assertCasterBuildEnvironment({ ...environment, ...override })).toThrow("Caster programme opt-in requires");
    }
  });

  it("leaves disabled builds and runtime closed without extra configuration", () => {
    const environment = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "staging" };
    expect(getCasterInvitationOrigin(environment)).toBeNull();
    expect(() => assertCasterBuildEnvironment(environment)).not.toThrow();
  });
});
