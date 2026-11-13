import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import dictionary from "@/lib/i18n/dictionaries/en/public";
import players from "@/lib/i18n/dictionaries/en/public-players";
import rankings from "@/lib/i18n/dictionaries/en/public-rankings";
import shared from "@/lib/i18n/dictionaries/en/public-shared";

describe("focused public fallbacks", () => {
  it("preserves Staging English copy and key order with public-profile opt-in restored", () => {
    expect(createHash("sha256").update(JSON.stringify(dictionary)).digest("hex"))
      .toBe("5f25928c67a66de2260ac17d56ec799d424afa0a96199bba592b09db03d76b99");
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
