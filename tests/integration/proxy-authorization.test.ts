import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unstable_doesMiddlewareMatch as doesProxyMatch } from "next/experimental/testing/server";

const clerkMiddlewareMock = vi.hoisted(() =>
  vi.fn((handler: (auth: unknown, request: unknown) => unknown) =>
    (request: unknown, event: { auth: unknown }) => handler(event.auth, request)),
);

vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: clerkMiddlewareMock,
}));

import proxy, { config } from "@/proxy";

type ProxyAuth = {
  protect: () => Promise<void>;
};

type ProxyRequest = {
  method?: string;
  nextUrl: {
    pathname: string;
  };
};

const invokeProxy = proxy as unknown as (
  request: ProxyRequest,
  event: { auth: ProxyAuth },
) => Promise<void>;
const proxyHandler = (auth: ProxyAuth, request: ProxyRequest) => invokeProxy(request, { auth });

describe("Next.js proxy authorization", () => {
  beforeEach(() => {
    clerkMiddlewareMock.mockClear();
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each([
    "/",
    "/about",
    "/news",
    "/players",
    "/players/11111111-1111-4111-8111-111111111111",
    "/players/11111111-1111-4111-8111-111111111111/avatar",
  ])("allows the public route %s without auth.protect", async (pathname) => {
    const protect = vi.fn(async () => undefined);

    await proxyHandler({ protect }, { nextUrl: { pathname } });

    expect(protect).not.toHaveBeenCalled();
  });

  it.each([
    "/api/match-proofs",
    "/api/match-proofs/",
    "/api/match-proofs/22222222-2222-4222-8222-222222222222/submission/11111111-1111-4111-8111-111111111111/replay",
    "/api/match-proofs/22222222-2222-4222-8222-222222222222/report-group/11111111-1111-4111-8111-111111111111/replay",
    "/api/internal/transactional-email",
    "/api/notifications/click",
    "/api/partners/v1/tournaments",
    "/api/partners/v1/tournaments/hold-the-line",
    "/api/partners/v1/players/1234567/tournaments",
  ])(
    "lets the self-authenticated route %s reach its own auth boundary",
    async (pathname) => {
      const protect = vi.fn(async () => undefined);

      await proxyHandler({ protect }, { nextUrl: { pathname } });

      expect(protect).not.toHaveBeenCalled();
    },
  );

  it.each([
    "/dashboard",
    "/profile",
    "/admin",
    "/api/steam/connect",
    "/api/steam/callback",
    "/unknown",
    "/players-private",
    "/aboutness",
    "/news-private",
    "/api/match-proof",
    "/api/match-proofs-private",
    "/api/match-proofs.example",
    "/api/match-proofsx/submission/id/replay",
    "/api/internal/transactional-email/",
    "/api/internal/transactional-email/run",
    "/api/internal/transactional-email-private",
    "/api/internal/transactional-emails",
    "/api/notifications/click/",
    "/api/notifications/click/private",
    "/api/notifications/click-private",
    "/api/notifications/clicks",
    "/api/partners",
    "/api/partners/v1/private",
    "/api/partners/v1/tournaments/",
    "/api/partners/v1/tournaments/hold-the-line/private",
    "/api/partners/v1/tournaments/%2fadmin",
    "/api/partners/v1/players/1234567/tournaments/private",
    "/api/partners/v1/players/%2f/tournaments",
  ])("calls auth.protect for %s", async (pathname) => {
    const protect = vi.fn(async () => undefined);

    await proxyHandler({ protect }, { nextUrl: { pathname } });

    expect(protect).toHaveBeenCalledOnce();
  });

  it("allows only the two exact Ready model asset reads on Staging", async () => {
    for (const [key, value] of Object.entries({
      VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "staging",
      NEXT_PUBLIC_SUPABASE_URL: "https://zzbnneprhjicmajpjkdg.supabase.co",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_example", CLERK_SECRET_KEY: "sk_test_example",
      PATCH2_PUBLIC_PROFILE_NOTICE_ENABLED: "false",
    })) vi.stubEnv(key, value);
    const protect = vi.fn(async () => undefined);
    const model = "/mascot-v6/assets/ironclad.glb";
    const interaction = "/mascot-v6/assets/interaction.json";
    await proxyHandler({ protect }, { method: "GET", nextUrl: { pathname: model } });
    await proxyHandler({ protect }, { method: "HEAD", nextUrl: { pathname: interaction } });
    expect(protect).not.toHaveBeenCalled();
    await proxyHandler({ protect }, { method: "POST", nextUrl: { pathname: model } });
    await proxyHandler({ protect }, { method: "GET", nextUrl: { pathname: "/mascot-v6/assets/private.json" } });
    vi.stubEnv("VERCEL_ENV", "production");
    await proxyHandler({ protect }, { method: "GET", nextUrl: { pathname: interaction } });
    expect(protect).toHaveBeenCalledTimes(3);
  });

  it("preserves dynamic-route and static-file matcher behavior", () => {
    expect(
      doesProxyMatch({
        config,
        nextConfig: {},
        url: "/profile",
      }),
    ).toBe(true);
    expect(
      doesProxyMatch({
        config,
        nextConfig: {},
        url: "/players/11111111-1111-4111-8111-111111111111",
      }),
    ).toBe(true);
    expect(
      doesProxyMatch({
        config,
        nextConfig: {},
        url: "/api/private.json",
      }),
    ).toBe(true);
    expect(
      doesProxyMatch({
        config,
        nextConfig: {},
        url: "/api/match-proofs/22222222-2222-4222-8222-222222222222/submission/11111111-1111-4111-8111-111111111111/replay",
      }),
    ).toBe(true);
    expect(
      doesProxyMatch({
        config,
        nextConfig: {},
        url: "/api/notifications/click?notificationId=11111111-1111-4111-8111-111111111111&scope=player",
      }),
    ).toBe(true);
    expect(
      doesProxyMatch({
        config,
        nextConfig: {},
        url: "/images/player-avatar.png",
      }),
    ).toBe(false);
  });
});
