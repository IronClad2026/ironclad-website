import { beforeEach, describe, expect, it, vi } from "vitest";
import { unstable_doesMiddlewareMatch as doesProxyMatch } from "next/experimental/testing/server";

const clerkMiddlewareMock = vi.hoisted(() =>
  vi.fn((handler: unknown) => handler)
);

vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: clerkMiddlewareMock,
}));

import proxy, { config } from "@/proxy";

type ProxyAuth = {
  protect: () => Promise<void>;
};

type ProxyRequest = {
  nextUrl: {
    pathname: string;
  };
};

const proxyHandler = proxy as unknown as (
  auth: ProxyAuth,
  request: ProxyRequest
) => Promise<void>;

describe("Next.js proxy authorization", () => {
  beforeEach(() => {
    clerkMiddlewareMock.mockClear();
  });

  it.each([
    "/",
    "/about",
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
  ])(
    "lets the self-authenticated route %s reach its own auth boundary",
    async (pathname) => {
      const protect = vi.fn(async () => undefined);

      await proxyHandler({ protect }, { nextUrl: { pathname } });

      expect(protect).not.toHaveBeenCalled();
    }
  );

  it.each([
    "/dashboard",
    "/profile",
    "/admin",
    "/api/elo-verification/verify",
    "/api/steam/connect",
    "/api/steam/callback",
    "/unknown",
    "/players-private",
    "/aboutness",
    "/api/match-proof",
    "/api/match-proofs-private",
    "/api/match-proofs.example",
    "/api/match-proofsx/submission/id/replay",
    "/api/internal/transactional-email/",
    "/api/internal/transactional-email/run",
    "/api/internal/transactional-email-private",
    "/api/internal/transactional-emails",
  ])("calls auth.protect for %s", async (pathname) => {
    const protect = vi.fn(async () => undefined);

    await proxyHandler({ protect }, { nextUrl: { pathname } });

    expect(protect).toHaveBeenCalledOnce();
  });

  it("preserves dynamic-route and static-file matcher behavior", () => {
    expect(
      doesProxyMatch({
        config,
        nextConfig: {},
        url: "/profile",
      })
    ).toBe(true);
    expect(
      doesProxyMatch({
        config,
        nextConfig: {},
        url: "/players/11111111-1111-4111-8111-111111111111",
      })
    ).toBe(true);
    expect(
      doesProxyMatch({
        config,
        nextConfig: {},
        url: "/api/private.json",
      })
    ).toBe(true);
    expect(
      doesProxyMatch({
        config,
        nextConfig: {},
        url: "/api/match-proofs/22222222-2222-4222-8222-222222222222/submission/11111111-1111-4111-8111-111111111111/replay",
      })
    ).toBe(true);
    expect(
      doesProxyMatch({
        config,
        nextConfig: {},
        url: "/images/player-avatar.png",
      })
    ).toBe(false);
  });
});
