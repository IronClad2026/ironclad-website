import { describe, expect, it } from "vitest";
import {
  isValidCoh3StatsProfileUrl,
  normalizeCoh3StatsProfileUrl,
  parseCoh3StatsProfileInput,
  parseCoh3StatsProfileUrl,
} from "@/lib/coh3-stats-profile";

describe("parseCoh3StatsProfileInput", () => {
  it.each([
    ["12345", "12345"],
    [" 12345 ", "12345"],
    ["http://coh3stats.com/players/12345", "12345"],
    ["https://www.coh3stats.com/players/12345", "12345"],
    ["https://COH3STATS.com/players/12345?mode=1#rank", "12345"],
    ["https://coh3stats.com/players/12345/history", "12345"],
  ])("extracts the profile ID from %s", (input, expectedProfileId) => {
    expect(parseCoh3StatsProfileInput(input)).toEqual({
      profileId: expectedProfileId,
      normalizedUrl: `https://coh3stats.com/players/${expectedProfileId}`,
    });
  });

  it.each([
    null,
    undefined,
    "",
    "   ",
    "-123",
    "123abc",
    "coh3stats.com/players/123",
    "https://example.com/players/123",
    "https://coh3stats.com.evil.test/players/123",
    "https://coh3stats.com/player/123",
    "https://coh3stats.com/players/",
    "https://coh3stats.com/players/abc",
    `https://coh3stats.com/players/${"1".repeat(501)}`,
  ])("rejects invalid input %s", (input) => {
    expect(parseCoh3StatsProfileInput(input)).toBeNull();
  });
});

describe("URL-only helpers", () => {
  it("rejects a raw numeric ID when a URL is required", () => {
    expect(parseCoh3StatsProfileUrl("12345")).toBeNull();
    expect(normalizeCoh3StatsProfileUrl("12345")).toBeNull();
    expect(isValidCoh3StatsProfileUrl("12345")).toBe(false);
  });

  it("normalizes a valid profile URL", () => {
    expect(
      normalizeCoh3StatsProfileUrl(
        "http://www.coh3stats.com/players/98765?source=test#details"
      )
    ).toBe("https://coh3stats.com/players/98765");
    expect(
      isValidCoh3StatsProfileUrl("https://coh3stats.com/players/98765")
    ).toBe(true);
  });
});
