import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerIdCompetitionLookup } from "@/lib/competition-read-models/players";

const mocks = vi.hoisted(() => ({ read: vi.fn(), client: { from: vi.fn() } }));
vi.mock("@/lib/competition-read-models/players", () => ({ loadPlayerCompetitionHistoryByPlayerId: mocks.read }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: () => mocks.client }));
import { getPublicPlayerCompetitionHistory, parsePublicHistoryPage } from "@/lib/public-player-competition";

const PLAYER_ID = "11111111-1111-4111-8111-111111111111";

function fixture(): PlayerIdCompetitionLookup {
  return {
    outcome: "FOUND_VISIBLE",
    player: {
      schemaVersion: "ironclad.competition.v1",
      currentIdentity: { alias: "Public player", profileUrl: `/players/${PLAYER_ID}` },
      entries: [{
        registrationId: "PRIVATE_REGISTRATION_ID", eventAlias: "Historical alias", eventElo: 1250,
        registrationStatus: "approved",
        tournament: { id: "PUBLIC_TOURNAMENT_ID", slug: "the-new-front", name: "THE NEW FRONT", divisionModelVersion: "legacy_three_v1", status: "completed", publicUrl: "https://www.ironcladtournaments.com/tournaments?tournament=the-new-front" },
        division: { id: "INTERNAL_DIVISION_ID", canonicalName: "Main", displayName: "Main / Pro", effectiveState: "completed" },
        generatedBracketId: "INTERNAL_BRACKET_ID", divisionCompleted: true,
        matches: [], record: { matchesPlayed: 3, wins: 3, losses: 0 }, placement: 1, champion: true,
      }],
      aggregate: { scope: "returned_entries", tournamentsEntered: 1, matchesPlayed: 3, wins: 3, losses: 0, titles: 1 },
      coverage: { scope: "returned_entries", offset: 0, limit: 10, scannedCandidates: 10, returnedEntries: 1, hasMore: true, nextOffset: 10 },
    },
  };
}

function found() {
  const value = fixture();
  if (value.outcome !== "FOUND_VISIBLE") throw new Error("Expected fixture");
  return value;
}

describe("public profile competition adapter", () => {
  beforeEach(() => { mocks.read.mockResolvedValue(fixture()); });

  it("loads a bounded UUID page and returns only approved presentation fields", async () => {
    const result = await getPublicPlayerCompetitionHistory(PLAYER_ID, 2);
    expect(mocks.read).toHaveBeenCalledWith(mocks.client, PLAYER_ID, { limit: 10, offset: 10 });
    expect(result).toMatchObject({
      status: "loaded", record: { matchesPlayed: 3, wins: 3, losses: 0 },
      entries: [{ division: "Main / Pro", champion: true, placement: 1, tournamentHref: "/tournaments?tournament=the-new-front" }],
      coverage: { scope: "returned_entries", page: 2, previousPage: 1, nextPage: 3 },
    });
    const serialized = JSON.stringify(result);
    for (const privateField of ["PRIVATE_", "INTERNAL_", "relicProfileId", "currentIdentity", "eventElo", "matches\"", "registrationId", "profileUrl", "publicUrl"]) {
      expect(serialized).not.toContain(privateField);
    }
  });

  it.each(["in_progress", "cancelled", "voided"] as const)("never publishes provisional/terminal placement or title for %s", async (status) => {
    const value = found();
    value.player.entries[0].tournament.status = status;
    value.player.entries[0].division.effectiveState = status;
    value.player.entries[0].divisionCompleted = status !== "in_progress";
    mocks.read.mockResolvedValue(value);
    const result = await getPublicPlayerCompetitionHistory(PLAYER_ID, 1);
    expect(result).toMatchObject({ entries: [{ placement: null, champion: false, divisionCompleted: false }] });
  });

  it("keeps a completed division's official result while the wider event continues", async () => {
    const value = found();
    value.player.entries[0].tournament.status = "in_progress";
    mocks.read.mockResolvedValue(value);
    expect(await getPublicPlayerCompetitionHistory(PLAYER_ID, 1)).toMatchObject({ entries: [{ champion: true, divisionCompleted: true, tournamentStatus: "in_progress" }] });
  });

  it.each(["HIDDEN", "NOT_FOUND"] as const)("collapses %s for the profile route", async (outcome) => {
    mocks.read.mockResolvedValue({ outcome });
    expect(await getPublicPlayerCompetitionHistory(PLAYER_ID, 1)).toEqual({ status: "not_found" });
  });

  it("shows an honest failure without zero totals or provider details", async () => {
    mocks.read.mockRejectedValue(new Error("PRIVATE_PROVIDER_DETAILS"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await getPublicPlayerCompetitionHistory(PLAYER_ID, 1)).toEqual({ status: "unavailable" });
    expect(log).toHaveBeenCalledWith("Public player competition history load failed.");
  });

  it("keeps pagination moving even when a page filters to no public entries", async () => {
    const value = found();
    value.player.entries = [];
    mocks.read.mockResolvedValue(value);
    expect(await getPublicPlayerCompetitionHistory(PLAYER_ID, 1)).toMatchObject({ entries: [], coverage: { nextPage: 2 } });
  });

  it("discloses the viewing bound instead of linking to an unsupported page", async () => {
    expect(await getPublicPlayerCompetitionHistory(PLAYER_ID, 1001)).toMatchObject({ coverage: { nextPage: null, reachedLimit: true } });
    expect(mocks.read).toHaveBeenCalledWith(mocks.client, PLAYER_ID, { limit: 10, offset: 10000 });
  });

  it.each([0, -1, 1002, NaN, 1.5])("rejects invalid internal page %s without querying", async (page) => {
    expect(await getPublicPlayerCompetitionHistory(PLAYER_ID, page)).toEqual({ status: "unavailable" });
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it.each([undefined, "0", "-1", "1.5", "01", "1002", "10000", ["2"]])("bounds route page input %s", (value) => {
    expect(parsePublicHistoryPage(value)).toBe(1);
  });
  it.each(["1", "2", "1001"])("accepts route page %s", (value) => {
    expect(parsePublicHistoryPage(value)).toBe(Number(value));
  });
});
