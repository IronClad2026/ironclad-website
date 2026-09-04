import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  TournamentDivisionStateDataError,
  loadTournamentDivisionStates,
  type TournamentDivisionStateDataClient,
  type TournamentDivisionStateTournamentRow,
} from "@/lib/tournament-division-state-data";

const launchTime = "2026-09-01T00:00:00.000Z";

describe("tournament division state authority loader", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads multiple events with three bounded batch authority reads", async () => {
    const database = createDatabase({
      capacityRows: [
        capacity("bracket-academy-a", "event-a", 8, 8, launchTime),
        capacity("bracket-challenge-a", "event-a", 8, 8, launchTime),
        capacity("bracket-main-a", "event-a", 5, 5, null),
        capacity("bracket-academy-b", "event-b", 2, 2, null),
      ],
      generatedRows: [
        generated("generated-academy-a", "bracket-academy-a", [
          round(1, [completedMatch(1, "winner-academy")]),
        ]),
        generated("generated-challenge-a", "bracket-challenge-a", [
          round(1, [scheduledMatch(1)]),
        ]),
      ],
    });

    const result = await loadTournamentDivisionStates(database.client, [
      tournament("event-a", "in_progress", [
        bracket("bracket-academy-a", "Academy", launchTime),
        bracket("bracket-challenge-a", "Challenge", launchTime),
        bracket("bracket-main-a", "Main", null),
      ]),
      tournament("event-b", "registration_open", [
        bracket("bracket-academy-b", "Academy", null),
      ]),
    ]);

    expect([...result.keys()]).toEqual(["event-a", "event-b"]);
    expect(
      result.get("event-a")?.map((resolution) => resolution.state)
    ).toEqual(["completed", "in_progress", "filling"]);
    expect(
      result.get("event-b")?.map((resolution) => resolution.state)
    ).toEqual(["filling", "disabled", "disabled"]);
    expect(database.rpc).toHaveBeenCalledWith(
      "get_tournament_bracket_capacity"
    );
    expect(database.rpc).toHaveBeenCalledWith(
      "get_tournament_division_not_held_states"
    );
    expect(database.rpc).toHaveBeenCalledTimes(2);
    expect(database.from).toHaveBeenCalledExactlyOnceWith(
      "generated_brackets"
    );
    expect(database.select).toHaveBeenCalledWith(
      expect.stringContaining("bracket_rounds(round_number")
    );
    expect(database.inFilter).toHaveBeenCalledWith(
      "tournament_bracket_id",
      [
        "bracket-academy-a",
        "bracket-challenge-a",
        "bracket-main-a",
        "bracket-academy-b",
      ]
    );
    expect(database.rpc).not.toHaveBeenCalledWith(
      "get_tournament_bracket_readiness",
      expect.anything()
    );
    expect(database.rpc).not.toHaveBeenCalledWith(
      "is_generated_bracket_complete",
      expect.anything()
    );
  });

  it("reuses an existing page authority snapshot without another database read", async () => {
    const database = createDatabase({});
    const result = await loadTournamentDivisionStates(
      database.client,
      [
        tournament("event", "registration_open", [
          bracket("bracket-academy", "Academy", null),
        ]),
      ],
      {
        readinessRows: [
          capacity("bracket-academy", "event", 8, 8, null),
          capacity("unrelated-bracket", "other-event", 1, 1, null),
        ],
        generatedBracketRows: [
          generated("unrelated-generated", "unrelated-bracket", []),
        ],
      }
    );

    expect(result.get("event")?.[0].state).toBe("ready");
    expect(database.rpc).not.toHaveBeenCalled();
    expect(database.from).not.toHaveBeenCalled();
  });

  it("uses batch launch evidence and preserves a terminal overlay", async () => {
    const database = createDatabase({
      capacityRows: [
        capacity("bracket-academy", "voided-event", 8, 8, launchTime),
      ],
      generatedRows: [
        generated("generated-academy", "bracket-academy", [
          round(1, [completedMatch(1, "winner")]),
        ]),
      ],
    });

    const result = await loadTournamentDivisionStates(database.client, [
      tournament("voided-event", "voided", [
        bracket("bracket-academy", "Academy", null),
      ]),
    ]);
    const resolutions = result.get("voided-event");

    expect(resolutions?.[0]).toMatchObject({
      state: "completed",
      terminalOverlay: "voided",
      launchedAt: launchTime,
      generatedBracketId: "generated-academy",
      isCompetitionComplete: true,
    });
    expect(resolutions?.[1]).toMatchObject({
      state: "disabled",
      terminalOverlay: "voided",
    });
  });

  it("keeps a generated but unlaunched division Ready", async () => {
    const database = createDatabase({
      capacityRows: [
        capacity("bracket-academy", "ready-event", 8, 8, null),
      ],
      generatedRows: [
        generated("private-academy-draft", "bracket-academy", [
          round(1, [completedMatch(1, "winner")]),
        ]),
      ],
    });

    const result = await loadTournamentDivisionStates(database.client, [
      tournament("ready-event", "registration_open", [
        bracket("bracket-academy", "Academy", null),
      ]),
    ]);

    expect(result.get("ready-event")?.[0]).toMatchObject({
      state: "ready",
      launchedAt: null,
      generatedBracketId: "private-academy-draft",
      isCompetitionComplete: false,
    });
  });

  it("projects a protected Not Held authority row into terminal Division state", async () => {
    const database = createDatabase({
      capacityRows: [
        capacity("bracket-academy", "not-held-event", 1, 1, null),
      ],
      notHeldRows: [
        {
          tournament_bracket_id: "bracket-academy",
          tournament_id: "not-held-event",
          not_held_at: "2026-09-03T01:00:00.000Z",
          reason_code: "minimum_roster_not_reached",
        },
      ],
    });

    const result = await loadTournamentDivisionStates(database.client, [
      tournament("not-held-event", "registration_open", [
        bracket("bracket-academy", "Academy", null),
      ]),
    ]);

    expect(result.get("not-held-event")?.[0]).toMatchObject({
      state: "not_held",
      notHeldAt: "2026-09-03T01:00:00.000Z",
      notHeldReasonCode: "minimum_roster_not_reached",
      launchedAt: null,
      generatedBracketId: null,
      isCompetitionComplete: false,
    });
  });

  it.each([
    {
      name: "Not Held authority query error",
      fixture: {
        capacityRows: [capacity("bracket-academy", "event", 1, 1, null)],
        notHeldError: { message: "unavailable" },
      },
      message: "Not Held authority could not be loaded",
    },
    {
      name: "malformed Not Held authority row",
      fixture: {
        capacityRows: [capacity("bracket-academy", "event", 1, 1, null)],
        notHeldRows: [
          {
            tournament_bracket_id: "bracket-academy",
            tournament_id: "event",
            not_held_at: null,
            reason_code: "minimum_roster_not_reached",
          },
        ],
      },
      message: "Not Held authority returned malformed data",
    },
    {
      name: "wrong Not Held Tournament relationship",
      fixture: {
        capacityRows: [capacity("bracket-academy", "event", 1, 1, null)],
        notHeldRows: [
          {
            tournament_bracket_id: "bracket-academy",
            tournament_id: "different-event",
            not_held_at: "2026-09-03T01:00:00.000Z",
            reason_code: "minimum_roster_not_reached",
          },
        ],
      },
      message: "Not Held authority returned malformed data",
    },
  ])("fails explicitly on $name", async ({ fixture, message }) => {
    const database = createDatabase(fixture);

    await expect(
      loadTournamentDivisionStates(database.client, [
        tournament("event", "registration_open", [
          bracket("bracket-academy", "Academy", null),
        ]),
      ])
    ).rejects.toThrow(message);
  });

  it("does not query database authorities when every division is Disabled", async () => {
    const database = createDatabase({});

    const result = await loadTournamentDivisionStates(database.client, [
      tournament("empty-event", "upcoming", []),
    ]);

    expect(result.get("empty-event")?.map((resolution) => resolution.state)).toEqual(
      ["disabled", "disabled", "disabled"]
    );
    expect(database.from).not.toHaveBeenCalled();
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "readiness batch query error",
      fixture: { capacityError: { message: "unavailable" } },
      message: "readiness authority could not be loaded",
    },
    {
      name: "invalid readiness response",
      fixture: { capacityRows: null },
      message: "readiness authority returned an invalid response",
    },
    {
      name: "missing readiness row",
      fixture: { capacityRows: [] },
      message: "readiness authority returned an incomplete response",
    },
    {
      name: "malformed readiness row",
      fixture: {
        capacityRows: [
          {
            ...capacity("bracket-academy", "event", 1, 1, null),
            registered_players: "1",
          },
        ],
      },
      message: "readiness authority returned malformed data",
    },
    {
      name: "wrong Tournament relationship",
      fixture: {
        capacityRows: [
          capacity("bracket-academy", "wrong-event", 1, 1, null),
        ],
      },
      message: "readiness authority returned malformed data",
    },
    {
      name: "duplicate readiness row",
      fixture: {
        capacityRows: [
          capacity("bracket-academy", "event", 1, 1, null),
          capacity("bracket-academy", "event", 1, 1, null),
        ],
      },
      message: "readiness authority returned malformed data",
    },
  ])("fails explicitly on $name", async ({ fixture, message }) => {
    const database = createDatabase(fixture);

    await expect(
      loadTournamentDivisionStates(database.client, [
        tournament("event", "registration_open", [
          bracket("bracket-academy", "Academy", null),
        ]),
      ])
    ).rejects.toThrow(message);
  });

  it.each([
    {
      name: "generated-bracket query error",
      fixture: {
        capacityRows: [capacity("bracket-academy", "event", 1, 1, null)],
        generatedError: { message: "unavailable" },
      },
      message: "Generated tournament bracket authority could not be loaded",
    },
    {
      name: "invalid generated-bracket response",
      fixture: {
        capacityRows: [capacity("bracket-academy", "event", 1, 1, null)],
        generatedRows: null,
      },
      message: "Generated tournament bracket authority returned an invalid response",
    },
    {
      name: "malformed generated-bracket row",
      fixture: {
        capacityRows: [
          capacity("bracket-academy", "event", 8, 8, launchTime),
        ],
        generatedRows: [
          {
            ...generated("generated-academy", "bracket-academy", []),
            format: "unsupported",
          },
        ],
      },
      message: "Generated tournament bracket authority returned malformed data",
    },
    {
      name: "malformed official-match evidence",
      fixture: {
        capacityRows: [
          capacity("bracket-academy", "event", 8, 8, launchTime),
        ],
        generatedRows: [
          generated("generated-academy", "bracket-academy", [
            round(1, [
              {
                ...completedMatch(1, "winner"),
                status: "unexpected",
              },
            ]),
          ]),
        ],
      },
      message: "Generated tournament bracket authority returned malformed data",
    },
  ])("fails explicitly on $name", async ({ fixture, message }) => {
    const database = createDatabase(fixture);

    await expect(
      loadTournamentDivisionStates(database.client, [
        tournament("event", "in_progress", [
          bracket("bracket-academy", "Academy", launchTime),
        ]),
      ])
    ).rejects.toThrow(message);
  });

  it("fails when a launched division has no generated bracket", async () => {
    const database = createDatabase({
      capacityRows: [
        capacity("bracket-academy", "event", 8, 8, launchTime),
      ],
    });

    await expect(
      loadTournamentDivisionStates(database.client, [
        tournament("event", "in_progress", [
          bracket("bracket-academy", "Academy", launchTime),
        ]),
      ])
    ).rejects.toThrow("missing its generated bracket");
  });

  it("normalizes a thrown batch query into an explicit failure", async () => {
    const database = createDatabase({
      capacityRows: [capacity("bracket-academy", "event", 1, 1, null)],
    });
    database.inFilter.mockRejectedValueOnce(new Error("private provider detail"));

    await expect(
      loadTournamentDivisionStates(database.client, [
        tournament("event", "registration_open", [
          bracket("bracket-academy", "Academy", null),
        ]),
      ])
    ).rejects.toThrow("Generated tournament bracket authority could not be loaded");
  });

  it.each([
    {
      name: "single-elimination final winner",
      format: "single_elimination" as const,
      rounds: [
        round(1, [completedMatch(2, "early-winner")]),
        round(2, [completedMatch(1, "final-winner")]),
      ],
      expected: true,
    },
    {
      name: "single-elimination double forfeit final",
      format: "single_elimination" as const,
      rounds: [
        round(1, [completedMatch(1, null, "deadline_double_forfeit")]),
      ],
      expected: true,
    },
    {
      name: "single-elimination empty feeder final",
      format: "single_elimination" as const,
      rounds: [round(1, [completedMatch(1, null, "empty_feeder")])],
      expected: true,
    },
    {
      name: "automatic bye without winner is not a terminal final",
      format: "single_elimination" as const,
      rounds: [round(1, [completedMatch(1, null, "automatic_bye")])],
      expected: false,
    },
    {
      name: "incomplete highest-numbered final",
      format: "single_elimination" as const,
      rounds: [
        round(1, [completedMatch(1, "early-winner")]),
        round(2, [scheduledMatch(1)]),
      ],
      expected: false,
    },
    {
      name: "round robin with every official winner",
      format: "round_robin" as const,
      rounds: [
        round(1, [
          completedMatch(1, "winner-one"),
          completedMatch(2, "winner-two"),
        ]),
      ],
      expected: true,
    },
    {
      name: "round robin with a missing winner",
      format: "round_robin" as const,
      rounds: [round(1, [completedMatch(1, null)])],
      expected: false,
    },
    {
      name: "empty round robin",
      format: "round_robin" as const,
      rounds: [],
      expected: false,
    },
  ])(
    "matches the existing official completion contract for $name",
    async ({ format, rounds, expected }) => {
      const database = createDatabase({
        capacityRows: [
          capacity("bracket-academy", "event", 8, 8, launchTime),
        ],
        generatedRows: [
          generated("generated-academy", "bracket-academy", rounds, format),
        ],
      });

      const result = await loadTournamentDivisionStates(database.client, [
        tournament("event", "in_progress", [
          bracket("bracket-academy", "Academy", launchTime),
        ]),
      ]);

      expect(result.get("event")?.[0].isCompetitionComplete).toBe(expected);
    }
  );

  it("rejects a match related through the wrong generated bracket", async () => {
    const wrongRelationship = generated(
      "generated-academy",
      "bracket-academy",
      [round(1, [completedMatch(1, "winner")])]
    );
    wrongRelationship.bracket_rounds[0].tournament_matches[0].generated_bracket_id =
      "different-generated-bracket";
    const database = createDatabase({
      capacityRows: [
        capacity("bracket-academy", "event", 8, 8, launchTime),
      ],
      generatedRows: [wrongRelationship],
    });

    await expect(
      loadTournamentDivisionStates(database.client, [
        tournament("event", "in_progress", [
          bracket("bracket-academy", "Academy", launchTime),
        ]),
      ])
    ).rejects.toThrow("Generated tournament bracket authority returned malformed data");
  });

  it("derives readiness exactly from approved and active-cohort capacity facts", async () => {
    const database = createDatabase({
      capacityRows: [
        capacity("bracket-academy", "event", 8, 9, null),
        capacity("bracket-challenge", "event", 8, 8, null),
      ],
    });

    const result = await loadTournamentDivisionStates(database.client, [
      tournament("event", "registration_open", [
        bracket("bracket-academy", "Academy", null),
        bracket("bracket-challenge", "Challenge", null),
      ]),
    ]);

    expect(result.get("event")?.map((division) => division.state)).toEqual([
      "filling",
      "ready",
      "disabled",
    ]);
  });

  it("rejects malformed input before calling any authority", async () => {
    const database = createDatabase({});

    await expect(
      loadTournamentDivisionStates(database.client, [
        {
          id: "event",
          status: "registration_open",
        },
      ] as TournamentDivisionStateTournamentRow[])
    ).rejects.toBeInstanceOf(TournamentDivisionStateDataError);
    expect(database.from).not.toHaveBeenCalled();
    expect(database.rpc).not.toHaveBeenCalled();
  });
});

function createDatabase({
  capacityError = null,
  capacityRows = [],
  generatedError = null,
  generatedRows = [],
  notHeldError = null,
  notHeldRows = [],
}: {
  capacityError?: unknown;
  capacityRows?: unknown;
  generatedError?: unknown;
  generatedRows?: unknown;
  notHeldError?: unknown;
  notHeldRows?: unknown;
}) {
  const inFilter = vi.fn().mockResolvedValue({
    data: generatedRows,
    error: generatedError,
  });
  const select = vi.fn(() => ({ in: inFilter }));
  const from = vi.fn(() => ({ select }));
  const rpc = vi.fn(async (name: string) => {
    if (name === "get_tournament_bracket_capacity") {
      return { data: capacityRows, error: capacityError };
    }

    if (name === "get_tournament_division_not_held_states") {
      return { data: notHeldRows, error: notHeldError };
    }

    return { data: null, error: { message: "unexpected authority" } };
  });

  return {
    client: { from, rpc } as unknown as TournamentDivisionStateDataClient,
    from,
    select,
    inFilter,
    rpc,
  };
}

function capacity(
  bracketId: string,
  tournamentId: string,
  approvedCount: number,
  activeCohortCount: number,
  launchedAt: string | null,
  requiredCount = 8
) {
  return {
    bracket_id: bracketId,
    tournament_id: tournamentId,
    registered_players: approvedCount,
    active_cohort_players: activeCohortCount,
    offered_reservations: Math.max(activeCohortCount - approvedCount, 0),
    waitlisted_players: 0,
    max_players: requiredCount,
    launched_at: launchedAt,
  };
}

type MatchFixture = {
  match_number: number;
  status: string;
  outcome_type: string | null;
  winner_registration_id: string | null;
};

type RoundFixture = {
  round_number: number;
  tournament_matches: MatchFixture[];
};

function generated(
  id: string,
  tournamentBracketId: string,
  rounds: RoundFixture[],
  format: "single_elimination" | "round_robin" = "single_elimination"
) {
  return {
    id,
    tournament_bracket_id: tournamentBracketId,
    format,
    bracket_rounds: rounds.map((bracketRound) => ({
      ...bracketRound,
      tournament_matches: bracketRound.tournament_matches.map((match) => ({
        ...match,
        id: `${id}-r${bracketRound.round_number}-m${match.match_number}`,
        generated_bracket_id: id,
      })),
    })),
  };
}

function round(roundNumber: number, matches: MatchFixture[]): RoundFixture {
  return {
    round_number: roundNumber,
    tournament_matches: matches,
  };
}

function completedMatch(
  matchNumber: number,
  winnerRegistrationId: string | null,
  outcomeType:
    | "deadline_double_forfeit"
    | "automatic_bye"
    | "empty_feeder"
    | null = null
): MatchFixture {
  return {
    match_number: matchNumber,
    status: "completed",
    outcome_type: outcomeType,
    winner_registration_id: winnerRegistrationId,
  };
}

function scheduledMatch(matchNumber: number): MatchFixture {
  return {
    match_number: matchNumber,
    status: "scheduled",
    outcome_type: null,
    winner_registration_id: null,
  };
}

function tournament(
  id: string,
  status: TournamentDivisionStateTournamentRow["status"],
  brackets: TournamentDivisionStateTournamentRow["tournament_brackets"]
): TournamentDivisionStateTournamentRow {
  return { id, status, tournament_brackets: brackets };
}

function bracket(
  id: string,
  name: "Academy" | "Challenge" | "Main",
  launchedAt: string | null
) {
  return { id, name, launched_at: launchedAt };
}
