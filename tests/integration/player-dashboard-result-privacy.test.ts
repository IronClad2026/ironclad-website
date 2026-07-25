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

    expect(dashboard.error).toBe(
      "Your competitive history could not be loaded."
    );
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
});

function createDashboardClient({
  metadataError = null,
}: {
  metadataError?: unknown;
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
            resolveDashboardQuery(table, filters, metadataError)
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
  metadataError: unknown
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
    status: "completed",
    updated_at: "2026-07-25T00:00:00.000Z",
  };

  const dataByTable: Record<string, unknown> = {
    bracket_rounds: [
      {
        id: "round-1",
        round_number: 1,
        name: "Semifinal",
      },
    ],
    generated_brackets: [
      {
        id: "generated-1",
        tournament_bracket_id: "bracket-1",
        format: "single_elimination",
        slot_count: 4,
      },
    ],
    match_result_report_groups: [],
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
      },
    ],
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
      data: filters.has("clerk_user_id")
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
