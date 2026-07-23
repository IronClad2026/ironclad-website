import { describe, expect, it } from "vitest";
import { isPublicPathname } from "@/lib/route-access";

describe("public route access", () => {
  it.each([
    "/",
    "/sign-in",
    "/sign-in/sso-callback",
    "/sign-up",
    "/tournaments",
    "/tournaments/summer-cup",
    "/rules",
    "/rankings",
    "/about",
    "/players",
    "/players/11111111-1111-4111-8111-111111111111",
    "/players/11111111-1111-4111-8111-111111111111/avatar",
  ])("allows the intended public pathname %s", (pathname) => {
    expect(isPublicPathname(pathname)).toBe(true);
  });

  it.each([
    "/dashboard",
    "/profile",
    "/admin",
    "/api",
    "/api/elo-verification/verify",
    "/unknown",
    "/players-private",
    "/players.example",
    "/aboutness",
    "/tournaments-admin",
    "/rankings-private",
  ])("keeps the pathname %s protected", (pathname) => {
    expect(isPublicPathname(pathname)).toBe(false);
  });
});
