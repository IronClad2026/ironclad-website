import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import dictionary from "@/lib/i18n/dictionaries/en/public";
import players from "@/lib/i18n/dictionaries/en/public-players";
import rankings from "@/lib/i18n/dictionaries/en/public-rankings";
import shared from "@/lib/i18n/dictionaries/en/public-shared";

describe("focused public fallbacks", () => {
  it("preserves the complete pre-split English copy and key order", () => {
    // This performance-only source move must preserve every existing string.
    expect(createHash("sha256").update(JSON.stringify(dictionary)).digest("hex"))
      .toBe("4fff43041d48129ea70748ff8ac77a1634caf5dbc0088df562e91187460d404e");
  });

  it("shares the original values while exposing only each client's required namespaces", () => {
    expect(Object.keys(players)).toEqual(["players", "regions", "select", "playerCount"]);
    expect(Object.keys(rankings)).toEqual(["rankings", "regions"]);
    expect(dictionary.players).toBe(players.players);
    expect(dictionary.rankings).toBe(rankings.rankings);
    expect(dictionary.regions).toBe(shared.regions);
    expect(players.regions).toBe(rankings.regions);
    expect(dictionary.select).toBe(players.select);
    expect(dictionary.playerCount).toBe(players.playerCount);
  });
});
