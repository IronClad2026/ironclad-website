import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import dictionary from "@/lib/i18n/dictionaries/en/public";
import players from "@/lib/i18n/dictionaries/en/public-players";
import rankings from "@/lib/i18n/dictionaries/en/public-rankings";
import shared from "@/lib/i18n/dictionaries/en/public-shared";

describe("focused public fallbacks", () => {
  it("preserves existing English copy and key order when adding public features", () => {
    // Product copy reflects permanent public competitive profiles and optional Discord.
    // Each new feature has explicit copy/locale tests. Exclude only its new key,
    // so either focused PR and their combined tree retain the original baseline.
    const existingCopy = {
      ...dictionary,
      home: Object.fromEntries(Object.entries(dictionary.home).filter(([key]) => key !== "collaboration")),
      players: Object.fromEntries(Object.entries(dictionary.players).filter(([key]) => key !== "history")),
    };
    expect(createHash("sha256").update(JSON.stringify(existingCopy)).digest("hex"))
      .toBe("6ef061ba6eeddfc19caa1a18497d05d3e53391e9f68e41216053a384f33fa969");
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
