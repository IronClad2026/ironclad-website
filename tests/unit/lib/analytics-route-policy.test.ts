import { describe, expect, it } from "vitest";

import {
  ANALYTICS_APPROVED_REPORTING_PATHS,
  sanitizeAnalyticsBreakdownPath,
  sanitizeAnalyticsEventUrl,
} from "@/lib/analytics-route-policy";

const ORIGIN = "https://ironclad.example";
const PLAYER_ID = "123e4567-e89b-12d3-a456-426614174000";
const UPPERCASE_PLAYER_ID = "123E4567-E89B-12D3-A456-426614174000";
const TOURNAMENT_ID = "223e4567-e89b-12d3-a456-426614174000";
const MATCH_ID = "323e4567-e89b-12d3-a456-426614174000";
const POLL_ID = "423e4567-e89b-12d3-a456-426614174000";

describe("analytics route policy", () => {
  it("exports only the approved provider-safe reporting paths", () => {
    expect(ANALYTICS_APPROVED_REPORTING_PATHS).toEqual([
      "/",
      "/about",
      "/rankings",
      "/rules",
      "/terms",
      "/privacy",
      "/players",
      "/tournaments",
      "/players/[playerId]",
    ]);
  });

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
    const sanitized = sanitizeAnalyticsEventUrl(
      `${ORIGIN}/players/${PLAYER_ID}`,
      ORIGIN
    );

    expect(sanitized).toBe(`${ORIGIN}/players/[playerId]`);
    expect(sanitized).not.toContain(PLAYER_ID);
  });

  it("normalizes uppercase UUID hex while keeping the Player prefix case-sensitive", () => {
    const sanitized = sanitizeAnalyticsEventUrl(
      `${ORIGIN}/players/${UPPERCASE_PLAYER_ID}`,
      ORIGIN
    );

    expect(sanitized).toBe(`${ORIGIN}/players/[playerId]`);
    expect(sanitized).not.toContain(UPPERCASE_PLAYER_ID);
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
    [`${ORIGIN}/about?test=1`, `${ORIGIN}/about`],
    [`${ORIGIN}/about#test`, `${ORIGIN}/about`],
    [`${ORIGIN}/about?`, `${ORIGIN}/about`],
    [`${ORIGIN}/about#`, `${ORIGIN}/about`],
    [
      `${ORIGIN}/tournaments?tournament=${TOURNAMENT_ID}`,
      `${ORIGIN}/tournaments`,
    ],
    [
      `${ORIGIN}/tournaments?match=${MATCH_ID}&poll=${POLL_ID}#private-state`,
      `${ORIGIN}/tournaments`,
    ],
    [
      `${ORIGIN}/players/${PLAYER_ID}?tab=history#section`,
      `${ORIGIN}/players/[playerId]`,
    ],
    [
      `${ORIGIN}/players/${UPPERCASE_PLAYER_ID}?tab=history`,
      `${ORIGIN}/players/[playerId]`,
    ],
    [`${ORIGIN}/?utm_source=private`, `${ORIGIN}/`],
  ])("strips query and fragment data from an approved URL: %s", (url, expected) => {
    expect(sanitizeAnalyticsEventUrl(url, ORIGIN)).toBe(expected);
  });

  it("constructs the result without copying any discarded identifiers or state", () => {
    const sanitizedTournament = sanitizeAnalyticsEventUrl(
      `${ORIGIN}/tournaments?tournament=${TOURNAMENT_ID}&match=${MATCH_ID}&poll=${POLL_ID}&note=arbitrary-private-value#private-state`,
      ORIGIN
    );
    const sanitizedPlayer = sanitizeAnalyticsEventUrl(
      `${ORIGIN}/players/${PLAYER_ID}?tab=history#section`,
      ORIGIN
    );

    expect(sanitizedTournament).toBe(`${ORIGIN}/tournaments`);
    expect(sanitizedPlayer).toBe(`${ORIGIN}/players/[playerId]`);

    for (const value of [
      TOURNAMENT_ID,
      MATCH_ID,
      POLL_ID,
      PLAYER_ID,
      "arbitrary-private-value",
      "private-state",
      "history",
      "section",
    ]) {
      expect(sanitizedTournament).not.toContain(value);
      expect(sanitizedPlayer).not.toContain(value);
    }

    expect(sanitizedTournament).not.toMatch(/[?#]/);
    expect(sanitizedPlayer).not.toMatch(/[?#]/);
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
    [`${ORIGIN}/dashboard?x=1`, ORIGIN],
    [`${ORIGIN}/admin?x=1`, ORIGIN],
    [`${ORIGIN}/api/test?x=1`, ORIGIN],
    [`${ORIGIN}/About?x=1`, ORIGIN],
    [`${ORIGIN}/%61bout?x=1`, ORIGIN],
    [`${ORIGIN}/%2561bout?x=1`, ORIGIN],
    [`${ORIGIN}/about/../rules?x=1`, ORIGIN],
    [`https://foreign.example/about?x=1`, ORIGIN],
    [`https://ironclad.example:8443/about?x=1`, ORIGIN],
    [`${ORIGIN}/players/${PLAYER_ID}/extra?x=1`, ORIGIN],
    [`${ORIGIN}/players/not-a-uuid?x=1`, ORIGIN],
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
