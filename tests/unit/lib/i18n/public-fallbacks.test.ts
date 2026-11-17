import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import dictionary from "@/lib/i18n/dictionaries/en/public";
import players from "@/lib/i18n/dictionaries/en/public-players";
import rankings from "@/lib/i18n/dictionaries/en/public-rankings";
import shared from "@/lib/i18n/dictionaries/en/public-shared";

function checksum(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

describe("focused public fallbacks", () => {
  it("preserves the pre-split English copy and the approved public player history addition", () => {
    // b65e5b5 added only players.history to the assembled English fallback.
    const { history, ...preHistoryPlayers } = dictionary.players;
    expect(history).toBe(players.players.history);
    expect(checksum({ ...dictionary, players: preHistoryPlayers }))
      .toBe("55e0f3d06832b4150933f8a398ff48be1734b0acc14a193a19db2f4d220331fb");
    expect(checksum(dictionary))
      .toBe("7b2e62919bfe6eb56df992f400d8455ca115d108d4ee0854e6c15092a677636f");
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
