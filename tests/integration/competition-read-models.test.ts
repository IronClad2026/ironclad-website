import { describe, expect, it } from "vitest";
import { loadPlayerCompetitionHistory } from "@/lib/competition-read-models/players";
import { loadTournamentCompetitionView } from "@/lib/competition-read-models/tournaments";
import type { CompetitionReadClient } from "@/lib/competition-read-models/shared";

type Row = Record<string, unknown>;
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = Date.parse("2026-10-27T00:00:00Z");
const time = "2026-09-01T00:00:00Z";

function fixture() {
  const event = (id: number, slug: string, model: string, status: string) => ({
    id: uuid(id),
    slug,
    title: slug,
    division_model_version: model,
    status,
    format: "1v1",
    registration_enabled: status === "registration_open",
    registration_open_at: "2026-08-01T00:00:00Z",
    registration_close_at: "2026-11-01T00:00:00Z",
    start_date: null,
    end_date: null,
    first_completed_at: status === "completed" ? time : null,
  });
  const registration = (
    n: number,
    event: number,
    division: number,
    player: number,
    name: string,
    elo: number,
  ) => ({
    id: uuid(n),
    tournament_id: uuid(event),
    tournament_bracket_id: uuid(division),
    profile_id: uuid(player),
    player_name: name,
    country: null,
    submitted_elo: elo,
    elo_verified_elo: elo,
    registration_status: "approved",
    waitlist_offer_status: null,
    created_at: event === 2 ? "2026-10-01T00:00:00Z" : time,
    clerk_user_id: "must-not-leak",
    email: "must-not-leak",
    admin_notes: "must-not-leak",
  });
  const tables: Record<string, Row[]> = {
    tournaments: [
      event(1, "legacy-event", "legacy_three_v1", "completed"),
      event(2, "current-event", "four_division_v1", "registration_open"),
    ],
    tournament_brackets: [
      {
        id: uuid(11),
        tournament_id: uuid(1),
        name: "Main",
        elo_rules: "1400+ ELO",
        max_players: 8,
        launched_at: time,
      },
      ...["Academy", "Challenge", "Main", "Pro"].map((name, i) => ({
        id: uuid(21 + i),
        tournament_id: uuid(2),
        name,
        elo_rules: [
          "0-1099 ELO",
          "1100-1399 ELO",
          "1400-1699 ELO",
          "1700+ ELO",
        ][i],
        max_players: 8,
        launched_at: null,
      })),
    ],
    registrations: [
      registration(101, 1, 11, 201, "Historical Champion", 1700),
      registration(102, 1, 11, 202, "Historical Opponent", 1600),
      registration(103, 2, 21, 201, "Current Campaign Alias", 824),
    ],
    players: [
      {
        id: uuid(201),
        coh3_profile_id: "7654321",
        public_profile_enabled: true,
        account_closed_at: null,
        in_game_name: "Current Alias",
        display_name: "Current Alias",
        current_elo: 999,
        clerk_user_id: "must-not-leak",
      },
      {
        id: uuid(202),
        coh3_profile_id: "7777777",
        public_profile_enabled: false,
        account_closed_at: null,
        in_game_name: "Private Alias",
        display_name: "Private Alias",
      },
    ],
    generated_brackets: [
      {
        id: uuid(301),
        tournament_bracket_id: uuid(11),
        format: "single_elimination",
        slot_count: 2,
      },
    ],
    bracket_rounds: [
      {
        id: uuid(401),
        generated_bracket_id: uuid(301),
        round_number: 1,
        name: "Final",
      },
    ],
    tournament_matches: [
      {
        id: uuid(501),
        generated_bracket_id: uuid(301),
        round_id: uuid(401),
        match_number: 1,
        series_best_of: 3,
        status: "completed",
        outcome_type: null,
        player_one_registration_id: uuid(101),
        player_two_registration_id: uuid(102),
        player_one_score: 2,
        player_two_score: 0,
        winner_registration_id: uuid(101),
        official_result_decided_at: null,
        proof_path: "must-not-leak",
        admin_notes: "must-not-leak",
      },
    ],
    tournament_standings: [],
    tournament_division_not_held_closures: [],
    match_result_report_groups: [],
  };
  const requests: { table: string; projection: string }[] = [];
  const client = {
    from(table: string) {
      if (!(table in tables)) throw new Error("Unexpected source table");
      const filters: ((row: Row) => boolean)[] = [];
      const order: { key: string; ascending: boolean }[] = [];
      let offset = 0;
      let limit = 1000;
      let projection = "";
      const query = {
        select(columns: string, options: { count?: string }) {
          expect(columns).not.toContain("*");
          expect(options.count).toBe("exact");
          projection = columns;
          return query;
        },
        eq(key: string, value: unknown) {
          filters.push((row) => row[key] === value);
          return query;
        },
        in(key: string, values: unknown[]) {
          filters.push((row) => values.includes(row[key]));
          return query;
        },
        order(key: string, options: { ascending: boolean }) {
          order.push({ key, ascending: options.ascending });
          return query;
        },
        range(start: number, end: number) {
          offset = start;
          limit = end - start + 1;
          return query;
        },
        limit(value: number) {
          limit = value;
          return query;
        },
        then(
          resolve: (value: unknown) => unknown,
          reject: (reason: unknown) => unknown,
        ) {
          const rows = tables[table]
            .filter((row) => filters.every((filter) => filter(row)))
            .sort((a, b) => {
              for (const item of order) {
                const comparison = String(a[item.key]).localeCompare(
                  String(b[item.key]),
                );
                if (comparison)
                  return item.ascending ? comparison : -comparison;
              }
              return 0;
            });
          requests.push({ table, projection });
          return Promise.resolve({
            data: rows.slice(offset, offset + limit),
            error: null,
            count: rows.length,
          }).then(resolve, reject);
        },
      };
      return query;
    },
  } as unknown as CompetitionReadClient;
  return { client, tables, requests };
}

describe("competition read products together", () => {
  it("loads real selector composition in bounded batches while preserving historical identity", async () => {
    const db = fixture();
    const result = await loadPlayerCompetitionHistory(db.client, "7654321", {
      now,
    });
    expect(result.outcome).toBe("FOUND_VISIBLE");
    if (result.outcome !== "FOUND_VISIBLE")
      throw new Error("Expected public player");
    expect(result.player.currentIdentity.alias).toBe("Current Alias");
    expect(result.player.entries).toHaveLength(2);
    const old = result.player.entries.find(
      (entry) => entry.tournament.slug === "legacy-event",
    )!;
    const current = result.player.entries.find(
      (entry) => entry.tournament.slug === "current-event",
    )!;
    expect(old).toMatchObject({
      eventAlias: "Historical Champion",
      eventElo: 1700,
      champion: true,
      placement: null,
      division: { displayName: "Main / Pro" },
      record: { matchesPlayed: 1, wins: 1, losses: 0 },
    });
    expect(current).toMatchObject({
      eventAlias: "Current Campaign Alias",
      eventElo: 824,
      champion: false,
      generatedBracketId: null,
      division: { displayName: "Academy" },
    });
    expect(result.player.aggregate).toMatchObject({
      scope: "returned_entries",
      tournamentsEntered: 2,
      matchesPlayed: 1,
      wins: 1,
      losses: 0,
      titles: 1,
    });
    expect(db.requests).toHaveLength(13);
    expect(
      db.requests.filter((request) => request.table === "tournaments"),
    ).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
    expect(JSON.stringify(result)).not.toContain("7777777");
    expect(
      db.requests.some((request) =>
        /clerk|email|discord|proof|admin_notes/.test(request.projection),
      ),
    ).toBe(false);
  });

  it("retains public event alias without linking a private competitor", async () => {
    const db = fixture();
    const event = await loadTournamentCompetitionView(
      db.client,
      "legacy-event",
      { now },
    );
    const opponent = event!.divisions
      .find((division) => division.canonicalName === "Main")!
      .participants.find((row) => row.registrationId === uuid(102));
    expect(opponent).toMatchObject({
      eventAlias: "Historical Opponent",
      eventElo: null,
      profileUrl: null,
    });
    expect(
      event!.divisions.find((division) => division.canonicalName === "Main")!
        .bracket!.matches[0].decidedAt,
    ).toBeNull();
  });

  it("never loads history for a private canonical identity", async () => {
    const db = fixture();
    await expect(
      loadPlayerCompetitionHistory(db.client, "7777777", { now }),
    ).resolves.toEqual({ outcome: "HIDDEN" });
    expect(db.requests.map((request) => request.table)).toEqual(["players"]);
  });

  it("does not recover an unbound or closed identity from historical aliases", async () => {
    const db = fixture();
    db.tables.players[0].coh3_profile_id = null;
    db.tables.players[0].account_closed_at = "2026-10-20T00:00:00Z";
    await expect(
      loadPlayerCompetitionHistory(db.client, "7654321", { now }),
    ).resolves.toEqual({ outcome: "NOT_FOUND" });
    expect(db.requests).toHaveLength(1);
  });
});
