import { describe, expect, it } from "vitest";
import { groupCareerTournaments } from "@/components/dashboard/career-presentation";
import type { ChampionAchievement, MatchHistoryEntry } from "@/lib/player-dashboard";

function match(overrides: Partial<MatchHistoryEntry> = {}): MatchHistoryEntry {
  return {
    id: "match-1",
    tournamentId: "tournament-1",
    tournamentBracketId: "division-1",
    generatedBracketId: "generation-1",
    tournamentBannerImageUrl: "/images/tournament-banner.webp",
    tournamentName: "IronClad Cup",
    bracketName: "Academy",
    opponentName: "Opponent",
    result: "win",
    score: "2-0",
    playedAt: "2026-09-01T10:00:00.000Z",
    roundName: "Quarterfinal",
    roundNumber: 1,
    matchNumber: 1,
    seriesBestOf: 3,
    replayAvailable: true,
    screenshotAvailable: false,
    ...overrides,
  };
}

function champion(overrides: Partial<ChampionAchievement> = {}): ChampionAchievement {
  return {
    id: "honour-1",
    tournamentId: "tournament-1",
    tournamentBracketId: "division-1",
    generatedBracketId: "generation-1",
    winnerName: "Player",
    tournamentName: "IronClad Cup",
    bracketName: "Academy",
    bannerImageUrl: "/images/tournament-banner.webp",
    wonAt: "2026-09-03T10:00:00.000Z",
    ...overrides,
  };
}

describe("Tournament career presentation", () => {
  it("does not fabricate played matches or tournament records from an honour alone", () => {
    expect(groupCareerTournaments([], [champion()])).toEqual([]);
  });

  it("keeps same-name tournaments, divisions and bracket generations separate", () => {
    const entries = [
      match(),
      match({ id: "match-2", tournamentId: "tournament-2" }),
      match({ id: "match-3", tournamentBracketId: "division-2" }),
      match({ id: "match-4", generatedBracketId: "generation-2" }),
    ];
    const groups = groupCareerTournaments(entries, []);

    expect(groups).toHaveLength(4);
    expect(new Set(groups.map((group) => group.key)).size).toBe(4);
    expect(groups.every((group) => group.matches.length === 1)).toBe(true);
    expect(groups.map((group) => group.tournamentName)).toEqual(Array(4).fill("IronClad Cup"));
  });

  it("groups unchanged identities despite edited display titles and keeps a factual W–L record", () => {
    const entries = [
      match(),
      match({ id: "match-2", tournamentName: "Renamed Cup", playedAt: "2026-09-02T10:00:00.000Z", result: "loss" }),
      match({ id: "match-3", playedAt: "2026-09-03T10:00:00.000Z", tournamentName: "Renamed Cup" }),
    ];
    const [group] = groupCareerTournaments(entries, []);

    expect(group).toMatchObject({ tournamentName: "Renamed Cup", wins: 2, losses: 1, champion: null });
    expect(group.matches).toHaveLength(3);
    expect(group.matches[0]).toBe(entries[0]);
    expect(group.matches[0]).toMatchObject({ score: "2-0", replayAvailable: true, screenshotAvailable: false });
  });

  it("uses authoritative progression when every round number is available, without altering the chronological period", () => {
    const entries = Object.freeze([
      Object.freeze(match({ id: "final", roundNumber: 3, playedAt: "2026-09-01T10:00:00.000Z" })),
      Object.freeze(match({ id: "quarterfinal", roundNumber: 1, playedAt: "2026-09-03T10:00:00.000Z" })),
      Object.freeze(match({ id: "semifinal", roundNumber: 2, playedAt: "2026-09-02T10:00:00.000Z" })),
    ]);
    const [group] = groupCareerTournaments(entries, []);

    expect(group.matches.map((entry) => entry.id)).toEqual(["quarterfinal", "semifinal", "final"]);
    expect(group.firstPlayedAt).toBe("2026-09-01T10:00:00.000Z");
    expect(group.lastPlayedAt).toBe("2026-09-03T10:00:00.000Z");
    expect(entries.map((entry) => entry.id)).toEqual(["final", "quarterfinal", "semifinal"]);
  });

  it("uses chronology for the whole run when one round is unknown and resolves ties by match number then ID", () => {
    const entries = [
      match({ id: "later-round-one", roundNumber: 1, playedAt: "2026-09-02T10:00:00.000Z" }),
      match({ id: "tie-b", roundNumber: 2, matchNumber: 2 }),
      match({ id: "tie-a", roundNumber: 3, matchNumber: 2 }),
      match({ id: "unknown", roundNumber: null, matchNumber: 1 }),
    ];

    expect(groupCareerTournaments(entries, [])[0].matches.map((entry) => entry.id))
      .toEqual(["unknown", "tie-a", "tie-b", "later-round-one"]);
    expect(groupCareerTournaments([...entries].reverse(), [])[0].matches.map((entry) => entry.id))
      .toEqual(["unknown", "tie-a", "tie-b", "later-round-one"]);
  });

  it("orders tournaments by their newest completed match rather than their first match or award date", () => {
    const groups = groupCareerTournaments([
      match({ id: "old-start", playedAt: "2026-08-01T10:00:00.000Z" }),
      match({ id: "recent-finish", playedAt: "2026-09-05T10:00:00.000Z" }),
      match({ id: "other-run", generatedBracketId: "generation-2", playedAt: "2026-09-04T10:00:00.000Z" }),
    ], [champion({ generatedBracketId: "generation-2", wonAt: "2026-10-01T10:00:00.000Z" })]);

    expect(groups.map((group) => group.generatedBracketId)).toEqual(["generation-1", "generation-2"]);
    expect(groups[0].firstPlayedAt).toBe("2026-08-01T10:00:00.000Z");
  });

  it.each([
    { tournamentId: "tournament-2" },
    { tournamentBracketId: "division-2" },
    { generatedBracketId: "generation-2" },
  ])("requires an exact champion identity rather than title or a partial identity: %j", (differentIdentity) => {
    expect(groupCareerTournaments([match()], [champion(differentIdentity)])[0].champion).toBeNull();
    const earned = champion();
    expect(groupCareerTournaments([match()], [champion(differentIdentity), earned])[0].champion).toBe(earned);
  });

  it("falls back to generation identity for unknown metadata without inferring a champion", () => {
    const groups = groupCareerTournaments([
      match({ id: "unknown-1", tournamentId: null, tournamentBracketId: null }),
      match({ id: "unknown-2", tournamentId: null, tournamentBracketId: null, tournamentName: "Fallback title" }),
      match({ id: "unknown-other-generation", tournamentId: null, tournamentBracketId: null, generatedBracketId: "generation-2" }),
      match({ id: "known" }),
    ], [champion()]);

    expect(groups).toHaveLength(3);
    const unknown = groups.find((group) => group.tournamentId === null && group.generatedBracketId === "generation-1");
    expect(unknown?.matches.map((entry) => entry.id)).toEqual(["unknown-1", "unknown-2"]);
    expect(unknown?.champion).toBeNull();
    expect(groups.find((group) => group.tournamentId === "tournament-1")?.champion).not.toBeNull();
  });

  it("returns the authoritative banner or null without inventing artwork", () => {
    expect(groupCareerTournaments([match()], [])[0].bannerImageUrl).toBe("/images/tournament-banner.webp");
    expect(groupCareerTournaments([match({ tournamentBannerImageUrl: null })], [])[0].bannerImageUrl).toBeNull();
  });

  it("keeps equal-date groups deterministic regardless of input order", () => {
    const entries = [match({ tournamentId: "tournament-2" }), match()];
    expect(groupCareerTournaments(entries, []).map((group) => group.key))
      .toEqual(groupCareerTournaments([...entries].reverse(), []).map((group) => group.key));
  });
});
