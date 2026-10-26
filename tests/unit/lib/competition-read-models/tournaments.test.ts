import { describe, expect, it, vi } from "vitest";
import {
  loadTournamentCompetitionView,
  loadTournamentCompetitionViews,
  mapTournamentCompetitionViews,
  type TournamentCompetitionSnapshot,
} from "@/lib/competition-read-models/tournaments";
import {
  CompetitionReadError,
  type CompetitionReadClient,
} from "@/lib/competition-read-models/shared";

const uid = (number: number) =>
  `00000000-0000-4000-8000-${number.toString(16).padStart(12, "0")}`;
const time = "2026-10-01T00:00:00.000Z";
const now = Date.parse("2026-10-02T00:00:00.000Z");
const project = (snapshot = fixture()) =>
  mapTournamentCompetitionViews(snapshot, { now })[0];
const division = (snapshot = fixture()) => project(snapshot).divisions[0];

function fixture(): TournamentCompetitionSnapshot {
  return {
    tournaments: [
      {
        id: uid(1),
        slug: "hold-the-line",
        title: "HOLD THE LINE",
        division_model_version: "four_division_v1",
        status: "in_progress",
        format: "1v1",
        registration_enabled: true,
        registration_open_at: null,
        registration_close_at: null,
        start_date: null,
        end_date: null,
        first_completed_at: null,
      },
    ],
    divisions: [
      {
        id: uid(10),
        tournament_id: uid(1),
        name: "Academy",
        elo_rules: "0-1099 ELO",
        max_players: 8,
        launched_at: time,
      },
    ],
    registrations: [20, 21].map((n) => ({
      id: uid(n),
      profile_id: uid(n + 10),
      tournament_id: uid(1),
      tournament_bracket_id: uid(10),
      player_name: `Event alias ${n}`,
      country: "GB",
      submitted_elo: 800,
      elo_verified_elo: 824,
      registration_status: "approved" as const,
      waitlist_offer_status: null,
    })),
    privacy: [30, 31].map((n) => ({
      id: uid(n),
      public_profile_enabled: true,
      account_closed_at: null,
    })),
    generatedBrackets: [
      {
        id: uid(40),
        tournament_bracket_id: uid(10),
        format: "single_elimination",
        slot_count: 2,
      },
    ],
    rounds: [
      {
        id: uid(50),
        generated_bracket_id: uid(40),
        round_number: 1,
        name: "Final",
      },
    ],
    matches: [
      {
        id: uid(60),
        generatedBracketId: uid(40),
        roundId: uid(50),
        matchNumber: 1,
        bestOf: 3,
        status: "completed",
        outcomeType: null,
        playerOneRegistrationId: uid(20),
        playerTwoRegistrationId: uid(21),
        playerOneScore: 2,
        playerTwoScore: 0,
        winnerRegistrationId: uid(20),
        decidedAt: time,
      },
    ],
    standings: [],
    closures: [],
    factualNoShowMatchIds: new Set(),
  };
}

function replace<T extends keyof TournamentCompetitionSnapshot>(
  snapshot: TournamentCompetitionSnapshot,
  key: T,
  value: TournamentCompetitionSnapshot[T],
) {
  return { ...snapshot, [key]: value };
}

describe("tournament competition read projection", () => {
  it("projects the current model without introducing an extra title authority", () => {
    const result = project();
    expect(result.schemaVersion).toBe("ironclad.competition.v1");
    expect(result.publicUrl).toBe(
      "https://www.ironcladtournaments.com/tournaments?tournament=hold-the-line",
    );
    expect(result.divisions.map((row) => row.canonicalName)).toEqual([
      "Academy",
      "Challenge",
      "Main",
      "Pro",
    ]);
    expect(division().bracket).toMatchObject({
      completed: true,
      championRegistrationId: uid(20),
    });
    expect(division().bracket?.placements).toEqual([]);
    expect(division().bracket?.matches[0]).toMatchObject({
      played: true,
      completed: true,
      decidedAt: time,
    });
  });
  it("keeps legacy Main / Pro separate from current Main and Pro", () => {
    const s = fixture();
    const legacy = replace(
      replace(s, "tournaments", [
        { ...s.tournaments[0], division_model_version: "legacy_three_v1" },
      ]),
      "divisions",
      [{ ...s.divisions[0], name: "Main", elo_rules: "1400+ ELO" }],
    );
    expect(project(legacy).divisions.map((row) => row.displayName)).toEqual([
      "Academy",
      "Challenge",
      "Main / Pro",
    ]);
    const current = replace(s, "divisions", [
      { ...s.divisions[0], name: "Main", elo_rules: "1400-1699 ELO" },
    ]);
    expect(project(current).divisions[2].displayName).toBe("Main");
    expect(project(current).divisions[2].eloRange).toEqual({
      min: 1400,
      minInclusive: true,
      max: 1699,
      maxInclusive: true,
    });
    const pro = replace(s, "divisions", [
      { ...s.divisions[0], name: "Pro", elo_rules: "1700+ ELO" },
    ]);
    expect(project(pro).divisions[3].eloRange?.min).toBe(1700);
    expect(() =>
      project(
        replace(legacy, "divisions", [{ ...s.divisions[0], name: "Pro" }]),
      ),
    ).toThrow();
  });
  it.each(["Academy", "Challenge", "Main", "Pro"] as const)(
    "reads %s only under the immutable current model",
    (name) => {
      const s = fixture();
      expect(
        project(
          replace(s, "divisions", [{ ...s.divisions[0], name }]),
        ).divisions.find((row) => row.canonicalName === name)?.bracket
          ?.championRegistrationId,
      ).toBe(uid(20));
    },
  );
  it("distinguishes an active-cohort capacity limit from approval readiness and administrator launch", () => {
    const s = fixture();
    const pending = {
      ...s,
      divisions: [{ ...s.divisions[0], launched_at: null, max_players: 2 }],
      rounds: [],
      matches: [],
      registrations: s.registrations.map((row) => ({
        ...row,
        registration_status: "pending" as const,
      })),
    };
    expect(division(pending)).toMatchObject({
      approvedCount: 0,
      capacity: 2,
      capacityReached: true,
      ready: false,
      bracketGenerated: true,
      bracketPublished: false,
      bracket: null,
    });
    const offered = {
      ...pending,
      registrations: pending.registrations.map((row) => ({
        ...row,
        registration_status: "waitlisted" as const,
        waitlist_offer_status: "offered",
      })),
    };
    expect(division(offered).capacityReached).toBe(true);
    expect(
      division({
        ...offered,
        registrations: offered.registrations.map((row) => ({
          ...row,
          waitlist_offer_status: null,
        })),
      }).capacityReached,
    ).toBe(false);
    expect(
      division({
        ...pending,
        divisions: [{ ...pending.divisions[0], max_players: 100 }],
      }).capacity,
    ).toBe(8);
    expect(project(pending).registration.open).toBe(true);
    expect(project().registration.open).toBe(false);
    expect(project().approvedPlayers).toBe(2);
  });
  it("does not invent an ELO range when the stored rule is unsupported", () => {
    const s = fixture();
    expect(
      division(
        replace(s, "divisions", [
          { ...s.divisions[0], elo_rules: "administrator approval" },
        ]),
      ).eloRange,
    ).toBeNull();
  });
  it("keeps generated drafts private and readiness distinct from launch", () => {
    let s = fixture();
    s = {
      ...s,
      divisions: [{ ...s.divisions[0], launched_at: null, max_players: 2 }],
      matches: [],
      rounds: [],
      standings: [],
    };
    expect(division(s)).toMatchObject({
      state: "ready",
      ready: true,
      launchedAt: null,
      registrationOpen: true,
      bracket: null,
    });
    const pending = {
      ...s,
      registrations: s.registrations.map((row, index) => ({
        ...row,
        registration_status:
          index === 0 ? ("approved" as const) : ("pending" as const),
      })),
    };
    expect(division(pending)).toMatchObject({
      state: "filling",
      approvedCount: 1,
      ready: false,
    });
    expect(division(pending).participants).toHaveLength(1);
    expect(division(s).participants).toHaveLength(2);
  });
  it("handles independent launched and filling sibling divisions", () => {
    const s = fixture();
    const result = project({
      ...s,
      divisions: [
        ...s.divisions,
        { ...s.divisions[0], id: uid(11), name: "Pro", launched_at: null },
      ],
    });
    expect(result.divisions[0].state).toBe("completed");
    expect(result.divisions[3]).toMatchObject({
      state: "filling",
      bracket: null,
      registrationOpen: true,
    });
  });
  it.each(["cancelled", "voided"] as const)(
    "retains factual matches under an explicit %s overlay",
    (status) => {
      const s = fixture();
      const result = project({
        ...s,
        tournaments: [{ ...s.tournaments[0], status }],
      });
      expect(result.status).toBe(status);
      expect(result.divisions[0].effectiveState).toBe(status);
      expect(result.divisions[0].registrationOpen).toBe(false);
      expect(result.divisions[0].bracket?.championRegistrationId).toBe(uid(20));
    },
  );
  it("preserves Not Held without exposing a bracket", () => {
    const s = fixture();
    expect(
      division({
        ...s,
        divisions: [{ ...s.divisions[0], launched_at: null }],
        generatedBrackets: [],
        rounds: [],
        matches: [],
        closures: [
          {
            tournament_bracket_id: uid(10),
            closed_at: time,
            reason_code: "minimum_roster_not_reached",
          },
        ],
      }),
    ).toMatchObject({
      state: "not_held",
      registrationOpen: false,
      bracket: null,
    });
  });
  it("uses snapshot aliases and optional public facts, never current aliases or identity", () => {
    const result = division();
    expect(result.participants[0]).toEqual({
      registrationId: uid(20),
      eventAlias: "Event alias 20",
      eventElo: 824,
      registrationStatus: "approved",
      profileUrl: `https://www.ironcladtournaments.com/players/${uid(30)}`,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /steam|clerk|discord|replay|source_metadata|coh3_profile_id|relicProfileId/i,
    );
  });
  it("hides a private player's profile link and ELO while retaining event alias", () => {
    const s = fixture();
    const result = division({
      ...s,
      privacy: s.privacy.map((row) => ({
        ...row,
        public_profile_enabled: false,
      })),
    });
    expect(result.participants[0]).toMatchObject({
      eventAlias: "Event alias 20",
      eventElo: null,
      profileUrl: null,
    });
  });
  it("pseudonymizes a closed player while keeping the official registration reference", () => {
    const s = fixture();
    const result = division({
      ...s,
      privacy: s.privacy.map((row) => ({ ...row, account_closed_at: time })),
    });
    expect(result.participants[0]).toMatchObject({
      registrationId: uid(20),
      eventAlias: "Former Competitor",
      eventElo: null,
      profileUrl: null,
    });
  });
  it("fails closed when a linked player's closure/privacy authority is missing", () => {
    expect(() => division({ ...fixture(), privacy: [] })).toThrow(
      CompetitionReadError,
    );
  });
  it("preserves an unlinked legacy event alias without optional profile facts", () => {
    const s = fixture();
    const result = division({
      ...s,
      registrations: s.registrations.map((row) => ({
        ...row,
        profile_id: null,
      })),
      privacy: [],
    });
    expect(result.participants[0]).toMatchObject({
      eventAlias: "Event alias 20",
      profileUrl: null,
      eventElo: null,
    });
  });
  it("includes withdrawn players referenced by published competition", () => {
    const s = fixture();
    const result = division({
      ...s,
      registrations: s.registrations.map((row) => ({
        ...row,
        registration_status: "withdrawn" as const,
      })),
    });
    expect(result.participants).toHaveLength(2);
  });
  it("counts scored admin/legacy results as Career facts without inventing per-game proof", () => {
    const result = division();
    expect(result.bracket?.matches[0].played).toBe(true);
    expect(result.bracket?.matches[0]).not.toHaveProperty("gameProofComplete");
  });
  it("excludes accepted no-shows from played counts without losing the official final winner", () => {
    const s = fixture();
    const result = division({
      ...s,
      factualNoShowMatchIds: new Set([uid(60)]),
    });
    expect(result.bracket?.matches[0].played).toBe(false);
    expect(result.bracket?.championRegistrationId).toBe(uid(20));
  });
  it("allows a final bye title without inventing a played match", () => {
    const s = fixture();
    const result = division({
      ...s,
      matches: [
        {
          ...s.matches[0],
          outcomeType: "automatic_bye",
          playerTwoRegistrationId: null,
          playerOneScore: null,
          playerTwoScore: null,
        },
      ],
    });
    expect(result.bracket).toMatchObject({
      completed: true,
      championRegistrationId: uid(20),
    });
    expect(result.bracket?.matches[0].played).toBe(false);
  });
  it.each(["empty_feeder", "deadline_double_forfeit"] as const)(
    "does not invent a champion or played match for %s",
    (outcomeType) => {
      const s = fixture();
      const result = division({
        ...s,
        matches: [
          {
            ...s.matches[0],
            outcomeType,
            winnerRegistrationId: null,
            playerOneScore: null,
            playerTwoScore: null,
          },
        ],
      });
      expect(result.bracket).toMatchObject({
        completed: true,
        championRegistrationId: null,
      });
      expect(result.bracket?.matches[0].played).toBe(false);
    },
  );
  it("reflects reset and late correction from the current official match state", () => {
    const s = fixture();
    const reset = division({
      ...s,
      matches: [
        {
          ...s.matches[0],
          status: "scheduled",
          winnerRegistrationId: null,
          playerOneScore: null,
          playerTwoScore: null,
          decidedAt: null,
        },
      ],
    });
    expect(reset.bracket).toMatchObject({
      completed: false,
      championRegistrationId: null,
    });
    expect(reset.bracket?.matches[0].played).toBe(false);
    const corrected = division({
      ...s,
      matches: [
        {
          ...s.matches[0],
          winnerRegistrationId: uid(21),
          playerOneScore: 0,
          playerTwoScore: 2,
        },
      ],
    });
    expect(corrected.bracket?.championRegistrationId).toBe(uid(21));
  });
  it("uses stored round-robin rank only after the complete expected fixture set", () => {
    const s = fixture();
    const result = division({
      ...s,
      generatedBrackets: [{ ...s.generatedBrackets[0], format: "round_robin" }],
      standings: [
        {
          generatedBracketId: uid(40),
          registrationId: uid(20),
          rank: 1,
          wins: 1,
          losses: 0,
          points: 3,
        },
      ],
    });
    expect(result.bracket?.championRegistrationId).toBe(uid(20));
    expect(result.bracket?.placements).toEqual([
      { registrationId: uid(20), rank: 1, wins: 1, losses: 0, points: 3 },
    ]);
    expect(
      division({
        ...s,
        generatedBrackets: [
          { ...s.generatedBrackets[0], format: "round_robin", slot_count: 3 },
        ],
        standings: [
          {
            generatedBracketId: uid(40),
            registrationId: uid(20),
            rank: 1,
            wins: 1,
            losses: 0,
            points: 3,
          },
        ],
      }).bracket?.championRegistrationId,
    ).toBeNull();
  });
  it("rejects orphaned/cross-division participants and duplicate authorities", () => {
    const s = fixture();
    expect(() =>
      project({
        ...s,
        matches: [{ ...s.matches[0], winnerRegistrationId: uid(99) }],
      }),
    ).toThrow(CompetitionReadError);
    expect(() =>
      project({
        ...s,
        registrations: [
          { ...s.registrations[0], tournament_bracket_id: uid(99) },
        ],
      }),
    ).toThrow(CompetitionReadError);
    expect(() =>
      project({
        ...s,
        generatedBrackets: [...s.generatedBrackets, s.generatedBrackets[0]],
      }),
    ).toThrow(CompetitionReadError);
    expect(() => project({ ...s, rounds: [] })).toThrow(CompetitionReadError);
    expect(() =>
      project({ ...s, divisions: [{ ...s.divisions[0], launched_at: null }] }),
    ).toThrow(CompetitionReadError);
  });
  it("rejects a launched division without its generated authority", () => {
    const s = fixture();
    expect(() =>
      project({ ...s, generatedBrackets: [], rounds: [], matches: [] }),
    ).toThrow();
  });
});

function database(
  overrides: Record<string, unknown> = {},
  counts: Record<string, number | null> = {},
) {
  const s = fixture();
  const data: Record<string, unknown> = {
    tournaments: s.tournaments,
    tournament_brackets: s.divisions,
    registrations: s.registrations,
    players: s.privacy,
    generated_brackets: s.generatedBrackets,
    bracket_rounds: s.rounds,
    tournament_matches: s.matches.map((row) => ({
      id: row.id,
      generated_bracket_id: row.generatedBracketId,
      round_id: row.roundId,
      match_number: row.matchNumber,
      series_best_of: row.bestOf,
      status: row.status,
      outcome_type: row.outcomeType,
      player_one_registration_id: row.playerOneRegistrationId,
      player_two_registration_id: row.playerTwoRegistrationId,
      player_one_score: row.playerOneScore,
      player_two_score: row.playerTwoScore,
      winner_registration_id: row.winnerRegistrationId,
      official_result_decided_at: row.decidedAt,
    })),
    tournament_standings: [],
    tournament_division_not_held_closures: [],
    match_result_report_groups: [],
    ...overrides,
  };
  const calls: Array<{
    table: string;
    select?: string;
    filters: Array<unknown>;
    limit?: number;
  }> = [];
  const from = vi.fn((table: string) => {
    const call = {
      table,
      filters: [] as unknown[],
      select: undefined as string | undefined,
      limit: undefined as number | undefined,
    };
    calls.push(call);
    const chain = {
      select: vi.fn((value: string, options: unknown) => {
        expect(options).toEqual({ count: "exact" });
        call.select = value;
        return chain;
      }),
      in: vi.fn((key: string, value: unknown) => {
        call.filters.push(["in", key, value]);
        return chain;
      }),
      eq: vi.fn((key: string, value: unknown) => {
        call.filters.push(["eq", key, value]);
        return chain;
      }),
      limit: vi.fn((value: number) => {
        call.limit = value;
        return chain;
      }),
      then(
        resolve: (value: unknown) => unknown,
        reject: (reason: unknown) => unknown,
      ) {
        const value = data[table];
        return value instanceof Error
          ? Promise.reject(value).then(resolve, reject)
          : Promise.resolve({
              data: value,
              error: null,
              count:
                table in counts
                  ? counts[table]
                  : Array.isArray(value)
                    ? value.length
                    : null,
            }).then(resolve, reject);
      },
    };
    return chain;
  });
  return { client: { from } as unknown as CompetitionReadClient, calls, from };
}

describe("bounded SELECT-only tournament selectors", () => {
  it("uses explicit source allow-lists and bounded batched reads without lifecycle calls", async () => {
    const db = database();
    expect(
      (await loadTournamentCompetitionViews(db.client, [uid(1)], { now }))[0]
        .name,
    ).toBe("HOLD THE LINE");
    expect(db.calls).toHaveLength(10);
    expect(
      db.calls.every(
        (call) => call.limit === 1000 && !call.select?.includes("*"),
      ),
    ).toBe(true);
    expect(db.calls.find((call) => call.table === "players")?.select).toBe(
      "id,public_profile_enabled,account_closed_at",
    );
    expect(
      db.calls.find((call) => call.table === "match_result_report_groups")
        ?.select,
    ).toBe("match_id,result_type,finalized_at,status,no_show_status");
    expect(JSON.stringify(db.calls)).not.toMatch(
      /storage_path|clerk_user_id|discord|email|review_notes|replay/,
    );
    expect(db.client).not.toHaveProperty("rpc");
  });
  it("reads one exact slug and handles not-found without a fabricated tournament", async () => {
    const db = database();
    expect(
      (await loadTournamentCompetitionView(db.client, "hold-the-line", { now }))
        ?.slug,
    ).toBe("hold-the-line");
    expect(db.calls[0].filters).toContainEqual(["eq", "slug", "hold-the-line"]);
    expect(
      await loadTournamentCompetitionView(
        database({ tournaments: [] }).client,
        "absent",
      ),
    ).toBeNull();
  });
  it("does not query private draft topology", async () => {
    const s = fixture();
    const db = database({
      tournament_brackets: [{ ...s.divisions[0], launched_at: null }],
    });
    const result = await loadTournamentCompetitionViews(db.client, [uid(1)], {
      now,
    });
    expect(result[0].divisions[0].bracket).toBeNull();
    expect(db.calls.map((call) => call.table)).not.toContain(
      "tournament_matches",
    );
    expect(db.calls.map((call) => call.table)).not.toContain("bracket_rounds");
    expect(db.calls.map((call) => call.table)).not.toContain(
      "tournament_standings",
    );
  });
  it("rejects row-cap sentinel responses rather than silently truncating", async () => {
    const s = fixture();
    const db = database({
      registrations: Array.from({ length: 1000 }, () => s.registrations[0]),
    });
    await expect(
      loadTournamentCompetitionViews(db.client, [uid(1)]),
    ).rejects.toThrow(CompetitionReadError);
  });
  it("rejects a lower server row cap and missing exact counts rather than reporting partial facts", async () => {
    await expect(
      loadTournamentCompetitionViews(
        database({}, { registrations: 8 }).client,
        [uid(1)],
      ),
    ).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
    await expect(
      loadTournamentCompetitionViews(
        database({}, { tournaments: null }).client,
        [uid(1)],
      ),
    ).rejects.toMatchObject({ code: "INVALID_DATA" });
  });
  it("rejects missing immutable model metadata and duplicate slug identity", async () => {
    const s = fixture();
    await expect(
      loadTournamentCompetitionViews(
        database({
          tournaments: [
            { ...s.tournaments[0], division_model_version: undefined },
          ],
        }).client,
        [uid(1)],
      ),
    ).rejects.toThrow(CompetitionReadError);
    await expect(
      loadTournamentCompetitionView(
        database({ tournaments: [s.tournaments[0], s.tournaments[0]] }).client,
        "hold-the-line",
      ),
    ).rejects.toThrow(CompetitionReadError);
  });
  it("rejects oversized or malformed inputs before any query", async () => {
    const db = database();
    await expect(
      loadTournamentCompetitionViews(
        db.client,
        Array.from({ length: 11 }, (_, i) => uid(i + 1)),
      ),
    ).rejects.toThrow();
    await expect(
      loadTournamentCompetitionViews(db.client, ["not-an-id"]),
    ).rejects.toThrow();
    await expect(
      loadTournamentCompetitionView(db.client, "../../players"),
    ).rejects.toThrow();
    expect(await loadTournamentCompetitionViews(db.client, [])).toEqual([]);
    expect(db.from).not.toHaveBeenCalled();
  });
  it("fails safely on database errors, null responses and malformed official data", async () => {
    await expect(
      loadTournamentCompetitionViews(
        database({ tournaments: new Error("secret database detail") }).client,
        [uid(1)],
      ),
    ).rejects.toThrow("Tournament competition data is unavailable.");
    await expect(
      loadTournamentCompetitionViews(database({ tournaments: null }).client, [
        uid(1),
      ]),
    ).rejects.toThrow(CompetitionReadError);
    const s = fixture();
    await expect(
      loadTournamentCompetitionViews(
        database({
          tournament_matches: [{ ...s.matches[0], status: "garbage" }],
        }).client,
        [uid(1)],
      ),
    ).rejects.toThrow(CompetitionReadError);
  });
  it.each([
    ["confirmed", "confirmed", time, false],
    ["auto_approved", "auto_confirmed", time, false],
    ["approved", "approved", time, false],
    ["disputed", "disputed", null, true],
    ["pending_confirmation", "pending", null, true],
  ])(
    "preserves factual no-show predicate for %s/%s",
    async (status, no_show_status, finalized_at, played) => {
      const db = database({
        match_result_report_groups: [
          {
            match_id: uid(60),
            result_type: "no_show",
            status,
            no_show_status,
            finalized_at,
          },
        ],
      });
      const result = await loadTournamentCompetitionViews(db.client, [uid(1)], {
        now,
      });
      expect(result[0].divisions[0].bracket?.matches[0].played).toBe(played);
    },
  );
});
