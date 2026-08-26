import { beforeEach, describe, expect, it, vi } from "vitest";

const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

import { loadPlayerCareerDashboard } from "@/lib/player-dashboard";

type QueryMethodName = "eq" | "in" | "order" | "select";
type QueryResult = {
  data: unknown;
  error: unknown;
};
type QueryMethod = (...args: unknown[]) => QueryMock;
type QueryMock = PromiseLike<QueryResult> &
  Record<QueryMethodName, QueryMethod>;

const viewerClerkUserId = "user_synthetic_dashboard_viewer";
const replayStoragePath =
  "match-1/user_synthetic_private/game-1/replay.rec";
const screenshotStoragePath =
  "match-1/user_synthetic_private/game-1/screenshot.png";
const replayContentHash = "a".repeat(64);

describe("player dashboard result privacy", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("keeps report-group paths out of the query and returns proof state as booleans only", async () => {
    const dashboardClient = createDashboardClient();
    createSupabaseAdminClientMock.mockReturnValue(
      dashboardClient.client
    );

    const dashboard = await loadPlayerCareerDashboard(
      viewerClerkUserId
    );
    const reportGroupSelect = dashboardClient.selects.find(
      (select) => select.table === "match_result_report_groups"
    )?.columns;
    const history = dashboard.matchHistory[0];
    const historyPayload = JSON.stringify(history);

    expect(reportGroupSelect).toBeDefined();
    expect(reportGroupSelect).not.toContain("replay_storage_path");
    expect(reportGroupSelect).not.toContain("screenshot_storage_path");
    expect(reportGroupSelect).not.toContain("replay_content_hash");
    expect(reportGroupSelect).not.toContain(
      "submitted_by_clerk_user_id"
    );
    expect(history).toMatchObject({
      id: "match-1",
      replayAvailable: true,
      screenshotAvailable: true,
    });
    expect(typeof history.replayAvailable).toBe("boolean");
    expect(typeof history.screenshotAvailable).toBe("boolean");
    expect(Object.keys(history)).toEqual([
      "id",
      "tournamentName",
      "bracketName",
      "opponentName",
      "result",
      "score",
      "playedAt",
      "roundName",
      "matchNumber",
      "seriesBestOf",
      "replayAvailable",
      "screenshotAvailable",
    ]);
    expect(historyPayload).not.toContain(replayStoragePath);
    expect(historyPayload).not.toContain(screenshotStoragePath);
    expect(historyPayload).not.toContain(replayContentHash);
    expect(historyPayload).not.toContain("storagePath");
    expect(historyPayload).not.toContain("contentHash");
  });

  it("does not copy sensitive upstream result errors into application logs", async () => {
    const secretValues = [
      replayStoragePath,
      screenshotStoragePath,
      replayContentHash,
      "user_private_submitter",
      "user_private_reviewer",
      "user_private_resolver",
      "https://private.supabase.co/storage/v1/object/sign/match-proofs/private",
      '{"actorClerkUserId":"user_private_actor"}',
    ];
    const dashboardClient = createDashboardClient({
      metadataError: {
        code: "storage_error",
        message: secretValues.join(" "),
      },
    });
    createSupabaseAdminClientMock.mockReturnValue(
      dashboardClient.client
    );

    const dashboard = await loadPlayerCareerDashboard(
      viewerClerkUserId
    );
    const visibleOutput = JSON.stringify({
      dashboard,
      logs: vi.mocked(console.error).mock.calls,
    });

    expect(dashboard.error).toBe("load-failed");
    expect(vi.mocked(console.error)).toHaveBeenCalledWith(
      "Dashboard career load failed.",
      {
        operation: "load-result-metadata",
        code: "UPSTREAM_UNAVAILABLE",
      }
    );
    for (const secretValue of secretValues) {
      expect(visibleOutput).not.toContain(secretValue);
    }
  });

  it("preserves a genuine empty career after a successful zero-registration response", async () => {
    const dashboardClient = createDashboardClient({
      registrationResponse: "empty",
    });
    createSupabaseAdminClientMock.mockReturnValue(dashboardClient.client);

    const dashboard = await loadPlayerCareerDashboard(viewerClerkUserId);

    expect(dashboard.error).toBeNull();
    expect(dashboard.notifications).toEqual([]);
    expect(dashboard.matchHistory).toEqual([]);
  });

  it("marks a null registration response as failed instead of empty", async () => {
    const dashboardClient = createDashboardClient({
      registrationResponse: "null",
    });
    createSupabaseAdminClientMock.mockReturnValue(dashboardClient.client);

    const dashboard = await loadPlayerCareerDashboard(viewerClerkUserId);

    expect(dashboard.error).toBe("load-failed");
    expect(vi.mocked(console.error)).toHaveBeenCalledWith(
      "Dashboard career load failed.",
      {
        operation: "load-registrations",
        code: "UPSTREAM_UNAVAILABLE",
      }
    );
  });

  it("does not expose matches, results, or standings from an unlaunched draft", async () => {
    const dashboardClient = createDashboardClient({ launchedAt: null });
    createSupabaseAdminClientMock.mockReturnValue(dashboardClient.client);

    const dashboard = await loadPlayerCareerDashboard(viewerClerkUserId);

    expect(dashboard.notifications).toEqual([]);
    expect(dashboard.matchHistory).toEqual([]);
    expect(dashboard.champions).toEqual([]);
    expect(dashboard.statistics.matchesPlayed).toBe(0);
  });

  it("recognizes a Final walkover champion without fabricating a played match", async () => {
    const dashboardClient = createDashboardClient({
      roundNumber: 3,
      slotCount: 8,
      matchOverrides: {
        outcome_type: "automatic_bye",
        player_two_registration_id: null,
        player_one_score: null,
        player_two_score: null,
        official_result_submission_id: null,
      },
    });
    createSupabaseAdminClientMock.mockReturnValue(dashboardClient.client);

    const dashboard = await loadPlayerCareerDashboard(viewerClerkUserId);

    expect(dashboard.statistics).toMatchObject({
      matchesPlayed: 0,
      matchesWon: 0,
      matchesLost: 0,
      winRate: 0,
      tournamentsWon: 1,
    });
    expect(dashboard.matchHistory).toEqual([]);
    expect(dashboard.champions).toEqual([
      expect.objectContaining({
        tournamentName: "Synthetic Tournament",
        bracketName: "Main",
        winnerName: "Viewer",
      }),
    ]);
  });

  it("does not award a champion or played-match statistic for a Final double forfeit", async () => {
    const dashboardClient = createDashboardClient({
      roundNumber: 3,
      slotCount: 8,
      matchOverrides: {
        outcome_type: "deadline_double_forfeit",
        player_one_score: null,
        player_two_score: null,
        winner_registration_id: null,
        official_result_submission_id: null,
      },
    });
    createSupabaseAdminClientMock.mockReturnValue(dashboardClient.client);

    const dashboard = await loadPlayerCareerDashboard(viewerClerkUserId);

    expect(dashboard.statistics).toMatchObject({
      matchesPlayed: 0,
      matchesWon: 0,
      matchesLost: 0,
      winRate: 0,
      tournamentsWon: 0,
    });
    expect(dashboard.matchHistory).toEqual([]);
    expect(dashboard.champions).toEqual([]);
  });

  it.each([
    {
      label: "win",
      matchOverrides: {},
      expectedWon: 1,
      expectedLost: 0,
      expectedResult: "win",
    },
    {
      label: "loss",
      matchOverrides: {
        player_one_score: 0,
        player_two_score: 2,
        winner_registration_id: "registration-2",
      },
      expectedWon: 0,
      expectedLost: 1,
      expectedResult: "loss",
    },
  ])(
    "counts a normal completed Match $label in both statistics and history",
    async ({ matchOverrides, expectedWon, expectedLost, expectedResult }) => {
      const dashboardClient = createDashboardClient({ matchOverrides });
      createSupabaseAdminClientMock.mockReturnValue(dashboardClient.client);

      const dashboard = await loadPlayerCareerDashboard(viewerClerkUserId);

      expect(dashboard.statistics).toMatchObject({
        matchesPlayed: 1,
        matchesWon: expectedWon,
        matchesLost: expectedLost,
      });
      expect(dashboard.matchHistory).toEqual([
        expect.objectContaining({ result: expectedResult }),
      ]);
    }
  );

  it.each([
    {
      label: "opponent-confirmed no-show win",
      viewerWon: true,
      status: "confirmed",
      noShowStatus: "confirmed",
      finalizedSource: "opponent_confirmation",
      finalRound: true,
    },
    {
      label: "automatically confirmed no-show loss",
      viewerWon: false,
      status: "auto_approved",
      noShowStatus: "auto_confirmed",
      finalizedSource: "cron_auto_approval",
      finalRound: false,
    },
    {
      label: "Admin-approved no-show win",
      viewerWon: true,
      status: "approved",
      noShowStatus: "approved",
      finalizedSource: "admin_approval",
      finalRound: false,
    },
  ])(
    "excludes a finalized accepted $label from played statistics and history",
    async ({
      viewerWon,
      status,
      noShowStatus,
      finalizedSource,
      finalRound,
    }) => {
      const winnerRegistrationId = viewerWon
        ? "registration-1"
        : "registration-2";
      const noShowRegistrationId = viewerWon
        ? "registration-2"
        : "registration-1";
      const playerOneScore = viewerWon ? 2 : 0;
      const playerTwoScore = viewerWon ? 0 : 2;
      const dashboardClient = createDashboardClient({
        roundNumber: finalRound ? 2 : 1,
        slotCount: 4,
        matchOverrides: {
          player_one_score: playerOneScore,
          player_two_score: playerTwoScore,
          winner_registration_id: winnerRegistrationId,
          official_result_submission_id: null,
        },
        reportGroupOverrides: {
          submitted_by_registration_id: winnerRegistrationId,
          opponent_registration_id: noShowRegistrationId,
          winner_registration_id: winnerRegistrationId,
          player_one_score: playerOneScore,
          player_two_score: playerTwoScore,
          status,
          no_show_registration_id: noShowRegistrationId,
          no_show_status: noShowStatus,
          finalized_source: finalizedSource,
        },
      });
      createSupabaseAdminClientMock.mockReturnValue(dashboardClient.client);

      const dashboard = await loadPlayerCareerDashboard(viewerClerkUserId);

      expect(dashboard.statistics).toMatchObject({
        matchesPlayed: 0,
        matchesWon: 0,
        matchesLost: 0,
        winRate: 0,
        tournamentsWon: finalRound && viewerWon ? 1 : 0,
      });
      expect(dashboard.matchHistory).toEqual([]);
      expect(dashboard.notifications).toEqual([
        expect.objectContaining({
          resultType: "no_show",
          noShowRegistrationId,
          noShowStatus,
          status,
          reportedWinner: viewerWon ? "Viewer" : "Opponent",
        }),
      ]);
      expect(dashboard.champions).toHaveLength(finalRound && viewerWon ? 1 : 0);
    }
  );

  it.each([
    {
      label: "pending no-show",
      reportGroupOverrides: {
        status: "pending_confirmation",
        no_show_status: "pending",
        finalized_at: null,
        finalized_source: null,
      },
    },
    {
      label: "disputed no-show",
      reportGroupOverrides: {
        status: "disputed",
        no_show_status: "disputed",
        finalized_at: null,
        finalized_source: null,
      },
    },
    {
      label: "rejected no-show",
      reportGroupOverrides: {
        status: "rejected",
        no_show_status: "rejected",
        finalized_source: "admin_override",
      },
    },
    {
      label: "Admin-corrected normal result",
      reportGroupOverrides: {
        result_type: "normal",
        status: "approved",
        no_show_registration_id: null,
        no_show_status: null,
        finalized_source: "admin_override",
      },
    },
  ])(
    "does not exclude a completed official result for a $label report group",
    async ({ reportGroupOverrides }) => {
      const dashboardClient = createDashboardClient({ reportGroupOverrides });
      createSupabaseAdminClientMock.mockReturnValue(dashboardClient.client);

      const dashboard = await loadPlayerCareerDashboard(viewerClerkUserId);

      expect(dashboard.statistics).toMatchObject({
        matchesPlayed: 1,
        matchesWon: 1,
        matchesLost: 0,
        winRate: 100,
      });
      expect(dashboard.matchHistory).toEqual([
        expect.objectContaining({ result: "win" }),
      ]);
    }
  );
});

function createDashboardClient({
  metadataError = null,
  launchedAt = "2026-08-06T03:00:00.000Z",
  matchOverrides = {},
  reportGroupOverrides = null,
  roundNumber = 1,
  slotCount = 4,
  registrationResponse = "normal",
}: {
  metadataError?: unknown;
  launchedAt?: string | null;
  matchOverrides?: Record<string, unknown>;
  reportGroupOverrides?: Record<string, unknown> | null;
  roundNumber?: number;
  slotCount?: number;
  registrationResponse?: "normal" | "empty" | "null";
} = {}) {
  const selects: { table: string; columns: string }[] = [];

  return {
    client: {
      from(table: string) {
        const filters = new Map<string, unknown>();
        const target: Partial<QueryMock> = {};
        const query = target as QueryMock;

        target.select = (...args: unknown[]) => {
          const columns = typeof args[0] === "string" ? args[0] : "";
          selects.push({ table, columns });
          return query;
        };
        target.eq = (...args: unknown[]) => {
          if (typeof args[0] === "string") {
            filters.set(args[0], args[1]);
          }
          return query;
        };
        target.in = (...args: unknown[]) => {
          if (typeof args[0] === "string") {
            filters.set(args[0], args[1]);
          }
          return query;
        };
        target.order = () => query;
        target.then = (resolve, reject) =>
          Promise.resolve(
            resolveDashboardQuery(
              table,
              filters,
              metadataError,
              launchedAt,
              matchOverrides,
              reportGroupOverrides,
              roundNumber,
              slotCount,
              registrationResponse
            )
          ).then(resolve, reject);

        return query;
      },
    },
    selects,
  };
}

function resolveDashboardQuery(
  table: string,
  filters: ReadonlyMap<string, unknown>,
  metadataError: unknown,
  launchedAt: string | null,
  matchOverrides: Record<string, unknown>,
  reportGroupOverrides: Record<string, unknown> | null,
  roundNumber: number,
  slotCount: number,
  registrationResponse: "normal" | "empty" | "null"
): QueryResult {
  const viewerRegistration = {
    id: "registration-1",
    clerk_user_id: viewerClerkUserId,
    tournament_id: "tournament-1",
    tournament_bracket_id: "bracket-1",
    tournament_title: "Synthetic Tournament",
    bracket_name: "Main",
    player_name: "Viewer",
    registration_status: "approved",
  };
  const opponentRegistration = {
    id: "registration-2",
    clerk_user_id: "user_synthetic_dashboard_opponent",
    tournament_id: "tournament-1",
    tournament_bracket_id: "bracket-1",
    tournament_title: "Synthetic Tournament",
    bracket_name: "Main",
    player_name: "Opponent",
    registration_status: "approved",
  };
  const match = {
    id: "match-1",
    generated_bracket_id: "generated-1",
    round_id: "round-1",
    match_number: 1,
    series_best_of: 3,
    player_one_registration_id: "registration-1",
    player_two_registration_id: "registration-2",
    player_one_score: 2,
    player_two_score: 0,
    winner_registration_id: "registration-1",
    official_result_submission_id: "submission-1",
    outcome_type: null,
    status: "completed",
    updated_at: "2026-07-25T00:00:00.000Z",
    ...matchOverrides,
  };
  const reportGroup =
    reportGroupOverrides === null
      ? null
      : {
          id: "report-group-1",
          match_id: "match-1",
          tournament_id: "tournament-1",
          result_type: "no_show",
          submitted_by_registration_id: "registration-1",
          opponent_registration_id: "registration-2",
          winner_registration_id: match.winner_registration_id,
          player_one_score: match.player_one_score,
          player_two_score: match.player_two_score,
          status: "approved",
          confirmation_deadline_at: "2026-07-24T12:00:00.000Z",
          confirmed_at: null,
          disputed_at: null,
          dispute_notes: null,
          reviewed_at: "2026-07-25T00:00:00.000Z",
          review_notes: null,
          no_show_registration_id: "registration-2",
          no_show_status: "approved",
          finalized_at: "2026-07-25T00:00:00.000Z",
          finalized_source: "admin_approval",
          created_at: "2026-07-24T00:00:00.000Z",
          ...reportGroupOverrides,
        };

  const dataByTable: Record<string, unknown> = {
    bracket_rounds: [
      {
        id: "round-1",
        round_number: roundNumber,
        name: roundNumber === Math.log2(slotCount) ? "Final" : "Semifinal",
      },
    ],
    generated_brackets: [
      {
        id: "generated-1",
        tournament_bracket_id: "bracket-1",
        format: "single_elimination",
        slot_count: slotCount,
      },
    ],
    match_result_report_groups: reportGroup ? [reportGroup] : [],
    match_result_submissions: [
      {
        id: "submission-1",
        submission_number: 1,
        game_number: 1,
        match_id: "match-1",
        submitted_by_clerk_user_id: viewerClerkUserId,
        submitted_by_registration_id: "registration-1",
        claimed_winner_registration_id: "registration-1",
        player_one_score: 2,
        player_two_score: 0,
        replay_storage_path: replayStoragePath,
        screenshot_storage_path: screenshotStoragePath,
        replay_content_hash: replayContentHash,
        status: "approved",
        review_notes: null,
        reviewed_at: "2026-07-25T00:00:00.000Z",
        created_at: "2026-07-25T00:00:00.000Z",
        report_group_id: "report-group-1",
      },
    ],
    tournament_brackets: [
      {
        id: "bracket-1",
        tournament_id: "tournament-1",
        name: "Main",
        launched_at: launchedAt,
      },
    ],
    player_report_group_notification_dismissals: [],
    tournament_standings: [],
    tournaments: [
      {
        id: "tournament-1",
        title: "Synthetic Tournament",
        banner_image_url: null,
      },
    ],
  };

  if (table === "registrations") {
    return {
      data:
        registrationResponse === "null"
          ? null
          : registrationResponse === "empty"
            ? []
            : filters.has("clerk_user_id")
              ? [viewerRegistration]
              : [viewerRegistration, opponentRegistration],
      error: null,
    };
  }

  if (table === "tournament_matches") {
    return {
      data: filters.has("player_one_registration_id") ? [match] : [],
      error: null,
    };
  }

  if (table === "match_result_submissions" && metadataError) {
    return {
      data: null,
      error: metadataError,
    };
  }

  if (!(table in dataByTable)) {
    throw new Error(`Unexpected dashboard test table: ${table}`);
  }

  return {
    data: dataByTable[table],
    error: null,
  };
}
