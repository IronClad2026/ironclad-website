import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isPublicPathname,
  isSelfAuthenticatedApiPathname,
} from "@/lib/route-access";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("public route access", () => {
  it.each([
    "/",
    "/sign-in",
    "/sign-in/sso-callback",
    "/sign-up",
    "/tournaments",
    "/tournaments/summer-cup",
    "/rules",
    "/terms",
    "/privacy",
    "/documents-rules-ppa/ironclad-official-tournament-rulebook-v3.0.pdf",
    "/rankings",
    "/about",
    "/players",
    "/players/11111111-1111-4111-8111-111111111111",
    "/players/11111111-1111-4111-8111-111111111111/avatar",
    "/dev/badges",
  ])("allows the intended public pathname %s", (pathname) => {
    expect(isPublicPathname(pathname)).toBe(true);
  });

  it.each([
    "/dashboard",
    "/profile",
    "/admin",
    "/api",
    "/api/steam/connect",
    "/api/match-proofs",
    "/api/match-proofs/22222222-2222-4222-8222-222222222222/submission/11111111-1111-4111-8111-111111111111/replay",
    "/unknown",
    "/dev",
    "/dev/badges/extra",
    "/dev-badges",
    "/players-private",
    "/players.example",
    "/aboutness",
    "/tournaments-admin",
    "/rankings-private",
    "/terms-private",
    "/privacy-private",
    "/documents-rules-ppa-private/ironclad-privacy-policy-v1.0.pdf",
  ])("keeps the pathname %s protected", (pathname) => {
    expect(isPublicPathname(pathname)).toBe(false);
  });

  it("does not expose the badge preview path as public in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(isPublicPathname("/dev/badges")).toBe(false);
  });
});

describe("self-authenticated API route access", () => {
  it.each([
    "/api/match-proofs",
    "/api/match-proofs/",
    "/api/match-proofs/22222222-2222-4222-8222-222222222222/submission/11111111-1111-4111-8111-111111111111/replay",
    "/api/match-proofs/22222222-2222-4222-8222-222222222222/report-group/11111111-1111-4111-8111-111111111111/replay",
    "/api/internal/transactional-email",
  ])("matches the intended self-authenticated pathname %s", (pathname) => {
    expect(isSelfAuthenticatedApiPathname(pathname)).toBe(true);
  });

  it.each([
    "/api",
    "/api/match-proof",
    "/api/match-proofs-private",
    "/api/match-proofs.example",
    "/api/match-proofsx",
    "/api/internal/transactional-email/",
    "/api/internal/transactional-email/run",
    "/api/internal/transactional-email-private",
    "/api/internal/transactional-emails",
    "/match-proofs/submission/id/replay",
  ])("does not exempt the lookalike pathname %s", (pathname) => {
    expect(isSelfAuthenticatedApiPathname(pathname)).toBe(false);
  });
});
