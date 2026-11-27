import { NextRequest, type NextFetchEvent } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  protect: vi.fn(),
  notice: vi.fn(),
  casterOrigin: vi.fn(),
  programmeEnabled: vi.fn(),
  rpc: vi.fn(),
  clerkIdentity: vi.fn(),
  legal: vi.fn(),
  players: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (handler: (auth: typeof mocks.actor, request: NextRequest) => unknown) =>
    (request: NextRequest) => handler(Object.assign(mocks.actor, { protect: mocks.protect }), request),
}));
vi.mock("@/lib/caster/environment", () => ({
  getCasterInvitationOrigin: mocks.casterOrigin,
  isCasterProgramEnabled: mocks.programmeEnabled,
}));
vi.mock("@/lib/caster/server", () => ({ casterRpc: mocks.rpc, verifyCasterSessionIdentity: mocks.clerkIdentity }));
vi.mock("@/lib/account-legal-acceptance", () => ({ loadAccountLegalGateStateForSubject: mocks.legal }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: () => ({ from: mocks.from }) }));
vi.mock("@/lib/public-gaming-profile-notice-server", () => ({ loadPublicGamingProfileNotice: mocks.notice }));

import proxy from "@/proxy";
import { CASTER_CHROME_HEADER, CASTER_PUBLIC_HOME_CHROME } from "@/lib/caster/routes";
import { isPublicProfileNoticeInstalled } from "@/lib/public-gaming-profile-notice";

const origin = "https://ironclad.example.test";
const actor = "user_home_fixture";
const session = "sess_home_fixture";
const application = { id: "11111111-1111-4111-8111-111111111111", status: "draft" };
const marker = `x-middleware-request-${CASTER_CHROME_HEADER}`;

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return proxy(new NextRequest(new URL(path, origin), init), {} as NextFetchEvent) as Promise<Response>;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("PATCH2_PUBLIC_PROFILE_NOTICE_ENABLED", "true");
  mocks.casterOrigin.mockReturnValue(origin);
  mocks.programmeEnabled.mockReturnValue(true);
  mocks.actor.mockResolvedValue({ userId: actor, sessionId: session, sessionClaims: { metadata: {} } });
  mocks.notice.mockResolvedValue({ status: "required", version: "public-gaming-profile-v1" });
  mocks.rpc.mockImplementation((name: string) => name === "caster_phase1_get_application"
    ? Promise.resolve({ status: "open", application }) : Promise.resolve(null));
  mocks.clerkIdentity.mockResolvedValue({ status: "open", emailVerified: true, email: "fixture@example.test", administrator: false });
  mocks.legal.mockResolvedValue({ status: "satisfied" });
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ abortSignal: () => ({ maybeSingle: mocks.players }) });
  mocks.players.mockResolvedValue({ data: null, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("caster-only homepage read boundary", () => {
  it.each(["GET", "HEAD"])("permits only a verified caster-only subject to read the public homepage using %s", async (method) => {
    expect(isPublicProfileNoticeInstalled()).toBe(true);
    const response = await request("/", { method });
    expect(response.headers.get(marker)).toBe(CASTER_PUBLIC_HOME_CHROME);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.rpc).toHaveBeenCalledWith("caster_phase1_get_application", { p_actor: actor });
    expect(mocks.from).toHaveBeenCalledExactlyOnceWith("players");
    expect(mocks.select).toHaveBeenCalledExactlyOnceWith("id");
    expect(mocks.eq).toHaveBeenCalledExactlyOnceWith("clerk_user_id", actor);
    expect(mocks.clerkIdentity).toHaveBeenCalledExactlyOnceWith(actor, session);
    expect(mocks.legal).toHaveBeenCalledExactlyOnceWith(actor);
  });

  it.each([
    ["competitive player", () => mocks.players.mockResolvedValue({ data: { id: "player-id" }, error: null })],
    ["competitive state unavailable", () => mocks.players.mockRejectedValue(new Error("unavailable"))],
    ["ordinary account", () => mocks.rpc.mockResolvedValue({ status: "open", application: null })],
    ["closed account", () => mocks.rpc.mockResolvedValue({ status: "closed", application: null })],
    ["rejected application", () => mocks.rpc.mockResolvedValue({ status: "open", application: { ...application, status: "rejected" } })],
    ["administrator session", () => mocks.actor.mockResolvedValue({ userId: actor, sessionId: session, sessionClaims: { metadata: { role: "admin" } } })],
    ["new administrator role", () => mocks.clerkIdentity.mockResolvedValue({ status: "open", emailVerified: true, email: "fixture@example.test", administrator: true })],
    ["unverified email", () => mocks.clerkIdentity.mockResolvedValue({ status: "open", emailVerified: false, email: "fixture@example.test", administrator: false })],
    ["missing legal receipts", () => mocks.legal.mockResolvedValue({ status: "required" })],
    ["unavailable legal gate", () => mocks.legal.mockResolvedValue({ status: "unavailable" })],
    ["unavailable competitive acknowledgement state", () => mocks.notice.mockResolvedValue({ status: "unavailable" })],
    ["caster feature disabled", () => mocks.casterOrigin.mockReturnValue(null)],
  ])("reuses the existing acknowledgement gate for %s", async (_description, arrange) => {
    arrange();
    const response = await request("/", { headers: { [CASTER_CHROME_HEADER]: CASTER_PUBLIC_HOME_CHROME } });
    expect(response.status).toBe(303);
    expect(response.headers.get(marker)).toBeNull();
    expect(new URL(response.headers.get("location")!).searchParams.get("returnTo")).toBe("/");
  });

  it("keeps anonymous and acknowledged homepage requests on the normal shell", async () => {
    mocks.actor.mockResolvedValueOnce({ userId: null, sessionId: null, sessionClaims: null });
    expect((await request("/", { headers: { [CASTER_CHROME_HEADER]: CASTER_PUBLIC_HOME_CHROME } })).headers.get(marker)).toBeNull();
    mocks.notice.mockResolvedValueOnce({ status: "satisfied" });
    expect((await request("/")).headers.get(marker)).toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.legal).not.toHaveBeenCalled();
  });

  it.each([
    ["/", "POST", 403],
    ["/", "OPTIONS", 403],
    ["/tournaments", "GET", 303],
    ["/profile", "GET", 303],
    ["/players/11111111-1111-4111-8111-111111111111/avatar", "GET", 303],
    ["/api/steam/connect", "GET", 403],
    ["/api/match-proofs/11111111-1111-4111-8111-111111111111", "GET", 403],
  ])("keeps existing guards on %s %s", async (path, method, status) => {
    const response = await request(path, { method, headers: { [CASTER_CHROME_HEADER]: CASTER_PUBLIC_HOME_CHROME, "next-action": "fixture-action" } });
    expect(response.status).toBe(status);
    expect(response.headers.get(marker)).toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("does not select read-only mode when an action header accompanies a homepage read", async () => {
    expect((await request("/", { headers: { "next-action": "fixture-action" } })).status).toBe(303);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("caster profile HTTP availability", () => {
  it.each(["unknown-slug", "hidden-slug", "suspended-slug", "unpublished-slug", "closed-account-slug", "old-slug", "invalid-slug.png"])(
    "returns a uniform pre-stream 404 for %s",
    async (slug) => {
      const response = await request(`/casters/${slug}`, { headers: { cookie: "ironclad_locale=fr" } });
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      const html = await response.text();
      expect(html).toContain("<html lang=\"fr\">");
      expect(html).toContain("data-caster-profile-unavailable");
      expect(html).not.toContain(slug);
      expect(html).not.toContain('property="og:');
      expect(mocks.actor).not.toHaveBeenCalled();
    },
  );

  it("returns identical HEAD status without a body and leaves valid profiles and media on their existing routes", async () => {
    const head = await request("/casters/unknown-slug", { method: "HEAD" });
    expect(head.status).toBe(404);
    expect(await head.text()).toBe("");

    mocks.rpc.mockResolvedValueOnce({
      slug: "live-caster", publication_id: "11111111-1111-4111-8111-111111111111", avatar: "22222222-2222-4222-8222-222222222222",
      display_name: "Live Caster", languages: ["English"], games: [], platforms: [], banner: null,
      bio: { version: 1, doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Caster bio" }] }] } },
      experience: "", links: [], videos: [], gallery: [], country: null,
    });
    const accepted = await request("/casters/live-caster");
    expect(accepted.status).toBe(200);
    expect(accepted.headers.get("x-middleware-next")).toBe("1");
    expect(accepted.headers.get("cache-control")).toBe("private, no-store");
    const calls = mocks.rpc.mock.calls.length;
    const asset = await request("/api/caster/public-media/live-caster/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222");
    expect(asset.headers.get("x-middleware-next")).toBe("1");
    expect(mocks.rpc.mock.calls).toHaveLength(calls);
  });
});
