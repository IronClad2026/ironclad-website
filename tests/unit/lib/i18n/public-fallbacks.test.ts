import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import dictionary from "@/lib/i18n/dictionaries/en/public";
import players from "@/lib/i18n/dictionaries/en/public-players";
import rankings from "@/lib/i18n/dictionaries/en/public-rankings";
import shared from "@/lib/i18n/dictionaries/en/public-shared";

describe("focused public fallbacks", () => {
  it("preserves the complete English copy and key order after the public-profile model change", () => {
    // Product copy reflects permanent public competitive profiles and optional Discord.
    // New history copy has its own locale validation; retain every pre-existing value/order.
    const { history, ...originalPlayers } = dictionary.players;
    expect(history.scope).toBe("Totals for tournaments on this page");
    expect(createHash("sha256").update(JSON.stringify({ ...dictionary, players: originalPlayers })).digest("hex"))
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
