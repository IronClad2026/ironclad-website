import { describe, expect, it } from "vitest";

import {
  sanitizeAnalyticsBreakdownPath,
  sanitizeAnalyticsEventUrl,
} from "@/lib/analytics-route-policy";

const ORIGIN = "https://ironclad.example";

describe("analytics route policy", () => {
  it.each([
    "/",
    "/about",
    "/rankings",
    "/rules",
    "/terms",
    "/privacy",
    "/players",
    "/tournaments",
  ])("allows the exact public route %s", (pathname) => {
    expect(sanitizeAnalyticsEventUrl(`${ORIGIN}${pathname}`, ORIGIN)).toBe(
      `${ORIGIN}${pathname}`
    );
  });

  it("normalizes a valid public Player UUID without returning the identifier", () => {
    const playerId = "123e4567-e89b-12d3-a456-426614174000";
    const sanitized = sanitizeAnalyticsEventUrl(
      `${ORIGIN}/players/${playerId}`,
      ORIGIN
    );

    expect(sanitized).toBe(`${ORIGIN}/players/[playerId]`);
    expect(sanitized).not.toContain(playerId);
  });

  it("normalizes uppercase UUID hex while keeping the Player prefix case-sensitive", () => {
    const playerId = "123E4567-E89B-12D3-A456-426614174000";
    const sanitized = sanitizeAnalyticsEventUrl(
      `${ORIGIN}/players/${playerId}`,
      ORIGIN
    );

    expect(sanitized).toBe(`${ORIGIN}/players/[playerId]`);
    expect(sanitized).not.toContain(playerId);
  });

  it.each([
    "/Players/123e4567-e89b-12d3-a456-426614174000",
    "/PLAYERS/123e4567-e89b-12d3-a456-426614174000",
    "/playersX/123e4567-e89b-12d3-a456-426614174000",
    "/players/123e4567-e89b-12d3-a456-426614174000/extra",
  ])("rejects a non-canonical dynamic Player path: %s", (pathname) => {
    expect(sanitizeAnalyticsEventUrl(`${ORIGIN}${pathname}`, ORIGIN)).toBeNull();
  });

  it.each([
    `${ORIGIN}/tournaments?tournament=123e4567-e89b-12d3-a456-426614174000`,
    `${ORIGIN}/tournaments?`,
    `${ORIGIN}/players#directory`,
    `${ORIGIN}/players#`,
    `${ORIGIN}/?utm_source=private`,
  ])("rejects the entire event when query or fragment data is present: %s", (url) => {
    expect(sanitizeAnalyticsEventUrl(url, ORIGIN)).toBeNull();
  });

  it.each([
    ["not a URL", ORIGIN],
    ["/about", ORIGIN],
    ["http://ironclad.example/about", ORIGIN],
    ["https://foreign.example/about", ORIGIN],
    ["https://user@ironclad.example/about", ORIGIN],
    ["https://user:password@ironclad.example/about", ORIGIN],
    [`${ORIGIN}/About`, ORIGIN],
    [`${ORIGIN}/about/`, ORIGIN],
    [`${ORIGIN}/about/extra`, ORIGIN],
    [`${ORIGIN}/%61bout`, ORIGIN],
    [`${ORIGIN}/about/../rules`, ORIGIN],
    [`${ORIGIN}/players/not-a-uuid`, ORIGIN],
    [`${ORIGIN}/players/123e4567-e89b-62d3-a456-426614174000`, ORIGIN],
    [`${ORIGIN}/players/123e4567-e89b-12d3-c456-426614174000`, ORIGIN],
    [`${ORIGIN}/players/123e4567-e89b-12d3-a456-426614174000/avatar`, ORIGIN],
    [`${ORIGIN}/players/[playerId]`, ORIGIN],
    [`${ORIGIN}/admin`, ORIGIN],
    [`${ORIGIN}/admin/operations`, ORIGIN],
    [`${ORIGIN}/dashboard`, ORIGIN],
    [`${ORIGIN}/profile`, ORIGIN],
    [`${ORIGIN}/sign-in`, ORIGIN],
    [`${ORIGIN}/sign-up/verify`, ORIGIN],
    [`${ORIGIN}/api/steam/callback`, ORIGIN],
    [`${ORIGIN}/tournaments/match/private`, ORIGIN],
    [`${ORIGIN}/proofs/replay.rec`, ORIGIN],
    [`${ORIGIN}/documents-rules-ppa/ironclad-privacy-policy-v1.1.pdf`, ORIGIN],
    [`${ORIGIN}/favicon.ico`, ORIGIN],
    [`${ORIGIN}/_next/static/app.js`, ORIGIN],
    [`${ORIGIN}/unknown`, ORIGIN],
    [`${ORIGIN}/${"a".repeat(2_048)}`, ORIGIN],
    [`${ORIGIN}/about`, "http://ironclad.example"],
    [`${ORIGIN}/about`, "https://ironclad.example/base"],
    [`${ORIGIN}/about`, "https://user@ironclad.example"],
  ])("fails closed for unsafe input %#", (candidate, expectedOrigin) => {
    expect(sanitizeAnalyticsEventUrl(candidate, expectedOrigin)).toBeNull();
  });

  it("fails closed for non-string inputs", () => {
    for (const candidate of [null, undefined, 42, {}, []]) {
      expect(sanitizeAnalyticsEventUrl(candidate, ORIGIN)).toBeNull();
    }
  });

  it.each([
    "/",
    "/about",
    "/rankings",
    "/rules",
    "/terms",
    "/privacy",
    "/players",
    "/players/[playerId]",
    "/tournaments",
  ])("accepts the sanitized provider breakdown path %s", (pathname) => {
    expect(sanitizeAnalyticsBreakdownPath(pathname)).toBe(pathname);
  });

  it.each([
    "Others",
    "/players/123e4567-e89b-12d3-a456-426614174000",
    "/admin",
    "/tournaments?match=private",
    "/About",
    "",
    null,
    undefined,
  ])("rejects an unsafe provider breakdown path: %s", (pathname) => {
    expect(sanitizeAnalyticsBreakdownPath(pathname)).toBeNull();
  });
});
