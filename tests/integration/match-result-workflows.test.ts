import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminIdentity,
  playerIdentity,
} from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const createInAppNotificationMock = vi.hoisted(() => vi.fn());
const createInAppNotificationsMock = vi.hoisted(() => vi.fn());
const notifyAdminsOfMatchDisputeMock = vi.hoisted(() => vi.fn());
const notifyNoShowReporterOfResponseMock = vi.hoisted(() => vi.fn());
const notifyPlayersOfLegacyMatchResultReviewMock = vi.hoisted(() => vi.fn());
const notifyPlayersOfReportGroupReviewMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

vi.mock("@/lib/notifications", () => ({
  createInAppNotification: createInAppNotificationMock,
  createInAppNotifications: createInAppNotificationsMock,
}));

vi.mock("@/lib/notification-events", () => ({
  notifyAdminsOfMatchDispute: notifyAdminsOfMatchDisputeMock,
  notifyNoShowReporterOfResponse: notifyNoShowReporterOfResponseMock,
  notifyPlayersOfLegacyMatchResultReview:
    notifyPlayersOfLegacyMatchResultReviewMock,
  notifyPlayersOfReportGroupReview: notifyPlayersOfReportGroupReviewMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import {
  confirmMatchResultReportGroup,
  disputeMatchResultReportGroup,
  resetAdminMatch,
  reviewMatchResult,
  reviewMatchResultReportGroup,
  submitNoShowReport,
} from "@/app/tournaments/match-actions";
import {
  confirmDashboardMatchResult,
  dismissDashboardNotifications,
} from "@/app/dashboard/actions";

const idleState = {
  status: "idle" as const,
  message: "",
};
const REPORT_GROUP_UUID =
  "11111111-1111-4111-8111-111111111111";
const SUBMISSION_UUID =
  "22222222-2222-4222-8222-222222222222";

function createFormData(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return formData;
}

function createThenableQuery(result: { data: unknown; error: unknown }) {
  const query = {
    eq: vi.fn(),
    in: vi.fn(),
    is: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(async () => result),
    order: vi.fn(),
    select: vi.fn(),
    then: (
      resolve: (value: typeof result) => unknown,
      reject: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject),
  };

  for (const method of [
    query.eq,
    query.in,
    query.is,
    query.limit,
    query.order,
    query.select,
  ]) {
    method.mockReturnValue(query);
  }

  return query;
}

function createRpcClient({
  rpcError = null,
}: {
  rpcError?: { code?: string; message: string } | null;
} = {}) {
  const rpc = vi.fn(async () => ({ data: null, error: rpcError }));
  return {
    client: {
      from: vi.fn(() => {
        throw new Error("Unexpected table query.");
      }),
      rpc,
    },
    rpc,
  };
}

describe("match-result workflow contracts", () => {
  beforeEach(() => {
    authMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    createInAppNotificationMock.mockReset();
    createInAppNotificationsMock.mockReset();
    notifyAdminsOfMatchDisputeMock.mockReset();
    notifyNoShowReporterOfResponseMock.mockReset();
    notifyPlayersOfLegacyMatchResultReviewMock.mockReset();
    notifyPlayersOfReportGroupReviewMock.mockReset();
    revalidatePathMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("preserves opponent confirmation and notification behavior", async () => {
    const service = createRpcClient();
    authMock.mockResolvedValue(playerIdentity);
    createSupabaseAdminClientMock.mockReturnValue(service.client);

    await expect(
      confirmMatchResultReportGroup(
        idleState,
        createFormData({ reportGroupId: "report-group-1" })
      )
    ).resolves.toEqual({
      status: "success",
      message: "Result confirmed. The winner has been advanced.",
    });

    expect(service.rpc).toHaveBeenCalledWith(
      "confirm_match_result_report_group",
      {
        p_report_group_id: "report-group-1",
        p_confirmed_by_clerk_user_id: playerIdentity.userId,
      }
    );
    expect(notifyNoShowReporterOfResponseMock).toHaveBeenCalledWith(
      service.client,
      {
        reportGroupId: "report-group-1",
        decision: "confirmed",
      }
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/tournaments");
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard");
  });

  it("preserves dispute RPC parameters and both notification flows", async () => {
    const service = createRpcClient();
    authMock.mockResolvedValue(playerIdentity);
    createSupabaseAdminClientMock.mockReturnValue(service.client);

    await expect(
      disputeMatchResultReportGroup(
        idleState,
        createFormData({
          reportGroupId: "report-group-1",
          disputeNotes: "The recorded score is wrong.",
        })
      )
    ).resolves.toEqual({
      status: "success",
      message: "Result disputed. An administrator must review it.",
    });

    expect(service.rpc).toHaveBeenCalledWith(
      "dispute_match_result_report_group",
      {
        p_report_group_id: "report-group-1",
        p_disputed_by_clerk_user_id: playerIdentity.userId,
        p_dispute_notes: "The recorded score is wrong.",
      }
    );
    expect(notifyAdminsOfMatchDisputeMock).toHaveBeenCalledWith(
      service.client,
      "report-group-1",
      playerIdentity.userId
    );
    expect(notifyNoShowReporterOfResponseMock).toHaveBeenCalledWith(
      service.client,
      expect.objectContaining({ decision: "disputed" })
    );
  });

  it("preserves participant ownership checks and no-show submission", async () => {
    const matchQuery = createThenableQuery({
      data: {
        id: "match-1",
        generated_bracket_id: "generated-1",
        match_number: 7,
        series_best_of: 3,
        player_one_registration_id: "registration-player-one",
        player_two_registration_id: "registration-player-two",
        player_one: { player_name: "Player One" },
        player_two: { player_name: "Player Two" },
        bracket_rounds: { name: "Final" },
        generated_brackets: {
          tournament_brackets: {
            tournament_id: "tournament-1",
            launched_at: "2026-08-06T03:00:00.000Z",
            tournaments: {
              id: "tournament-1",
              title: "Test Tournament",
            },
          },
        },
      },
      error: null,
    });
    const registrationsQuery = createThenableQuery({
      data: [
        {
          id: "registration-player-one",
          clerk_user_id: playerIdentity.userId,
          player_name: "Player One",
        },
        {
          id: "registration-player-two",
          clerk_user_id: "user_test_opponent",
          player_name: "Player Two",
        },
      ],
      error: null,
    });
    const rpc = vi.fn(async () => ({
      data: { report_group_id: "report-group-1" },
      error: null,
    }));
    const client = {
      from: vi.fn((table: string) => {
        if (table === "tournament_matches") return matchQuery;
        if (table === "registrations") return registrationsQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
      rpc,
    };
    authMock.mockResolvedValue(playerIdentity);
    createSupabaseAdminClientMock.mockReturnValue(client);

    await expect(
      submitNoShowReport(
        idleState,
        createFormData({
          matchId: "match-1",
          noShowRegistrationId: "registration-player-two",
          noShowNotes: "Opponent did not arrive.",
        })
      )
    ).resolves.toMatchObject({ status: "success" });

    expect(rpc).toHaveBeenCalledWith("submit_match_no_show_report", {
      p_match_id: "match-1",
      p_submitted_by_clerk_user_id: playerIdentity.userId,
      p_no_show_registration_id: "registration-player-two",
      p_notes: "Opponent did not arrive.",
    });
    expect(createInAppNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientClerkUserId: "user_test_opponent",
        reportGroupId: "report-group-1",
        type: "match.no_show_reported",
      })
    );
    expect(createInAppNotificationMock.mock.calls[0][0]).not.toHaveProperty(
      "actorClerkUserId"
    );
  });

  it("rejects match activity while the division bracket is still private", async () => {
    const matchQuery = createThenableQuery({
      data: {
        id: "match-1",
        generated_bracket_id: "generated-1",
        match_number: 1,
        series_best_of: 3,
        player_one_registration_id: "registration-player-one",
        player_two_registration_id: "registration-player-two",
        player_one: { player_name: "Player One" },
        player_two: { player_name: "Player Two" },
        bracket_rounds: { name: "Final" },
        generated_brackets: {
          tournament_brackets: {
            tournament_id: "tournament-1",
            launched_at: null,
            tournaments: {
              id: "tournament-1",
              title: "Test Tournament",
            },
          },
        },
      },
      error: null,
    });
    const rpc = vi.fn();
    const client = {
      from: vi.fn((table: string) => {
        if (table === "tournament_matches") return matchQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
      rpc,
    };
    authMock.mockResolvedValue(playerIdentity);
    createSupabaseAdminClientMock.mockReturnValue(client);

    const result = await submitNoShowReport(
      idleState,
      createFormData({
        matchId: "match-1",
        noShowRegistrationId: "registration-player-two",
      })
    );

    expect(result).toEqual({
      status: "error",
      message: "This tournament match is no longer available.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("preserves administrator report-group review without notification audit IDs", async () => {
    const service = createRpcClient();
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue(service.client);

    await expect(
      reviewMatchResultReportGroup(
        idleState,
        createFormData({
          reportGroupId: "report-group-1",
          decision: "approved",
          reviewNotes: "Reviewed.",
        })
      )
    ).resolves.toEqual({
      status: "success",
      message: "Report group approved and winner advanced.",
    });

    expect(service.rpc).toHaveBeenCalledWith(
      "admin_finalize_match_result_report_group",
      {
        p_report_group_id: "report-group-1",
        p_decision: "approved",
        p_reviewed_by: adminIdentity.userId,
        p_review_notes: "Reviewed.",
      }
    );
    expect(notifyPlayersOfReportGroupReviewMock).toHaveBeenCalledWith(
      service.client,
      {
        reportGroupId: "report-group-1",
        decision: "approved",
      }
    );
  });

  it("preserves legacy administrator review without notification audit IDs", async () => {
    const service = createRpcClient();
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue(service.client);

    await expect(
      reviewMatchResult(
        idleState,
        createFormData({
          submissionId: "submission-1",
          decision: "resubmission_requested",
          reviewNotes: "Upload the correct replay.",
        })
      )
    ).resolves.toMatchObject({
      status: "success",
      message: "Resubmission requested. The bracket remains unchanged.",
    });

    expect(service.rpc).toHaveBeenCalledWith("review_match_series_result", {
      p_submission_id: "submission-1",
      p_decision: "resubmission_requested",
      p_reviewed_by: adminIdentity.userId,
      p_review_notes: "Upload the correct replay.",
    });
    expect(notifyPlayersOfLegacyMatchResultReviewMock).toHaveBeenCalledWith(
      service.client,
      {
        submissionId: "submission-1",
        decision: "resubmission_requested",
      }
    );
  });

  it("returns and logs a generic error for an internal path-bearing failure", async () => {
    const secretPath =
      "match-1/user_secret_clerk/private-result-proof.rec";
    const service = createRpcClient({
      rpcError: {
        code: "storage_error",
        message: `Could not inspect ${secretPath}`,
      },
    });
    authMock.mockResolvedValue(playerIdentity);
    createSupabaseAdminClientMock.mockReturnValue(service.client);

    const result = await confirmMatchResultReportGroup(
      idleState,
      createFormData({ reportGroupId: "report-group-1" })
    );
    const visibleOutput = JSON.stringify({
      result,
      logs: vi.mocked(console.error).mock.calls,
    });

    expect(result).toEqual({
      status: "error",
      message: "The match result could not be confirmed. Please try again.",
    });
    expect(visibleOutput).not.toContain(secretPath);
    expect(visibleOutput).not.toContain("user_secret_clerk");
  });

  it("keeps dashboard confirmation errors path-free as well", async () => {
    const secretPath =
      "match-1/user_secret_dashboard/private-result-proof.rec";
    const service = createRpcClient({
      rpcError: {
        code: "storage_error",
        message: `Could not inspect ${secretPath}`,
      },
    });
    authMock.mockResolvedValue(playerIdentity);
    createSupabaseAdminClientMock.mockReturnValue(service.client);

    const result = await confirmDashboardMatchResult(
      createFormData({ reportGroupId: REPORT_GROUP_UUID })
    );
    const visibleOutput = JSON.stringify({
      result,
      logs: vi.mocked(console.error).mock.calls,
    });

    expect(result).toEqual({
      status: "error",
      message: "The match result could not be confirmed. Please try again.",
    });
    expect(visibleOutput).not.toContain(secretPath);
    expect(visibleOutput).not.toContain("user_secret_dashboard");
  });

  it("keeps dashboard notification lookup errors out of logs", async () => {
    const secretValues = [
      "match-1/user_secret_notification/private-result-proof.rec",
      "b".repeat(64),
      "user_private_notification_recipient",
      '{"actorClerkUserId":"user_private_notification_actor"}',
      "https://private.supabase.co/storage/v1/object/sign/match-proofs/private",
    ];
    const registrationsQuery = createThenableQuery({
      data: [{ id: "registration-player-one" }],
      error: null,
    });
    const playerOneMatchesQuery = createThenableQuery({
      data: [{ id: "match-1" }],
      error: null,
    });
    const playerTwoMatchesQuery = createThenableQuery({
      data: [],
      error: null,
    });
    const submissionsQuery = createThenableQuery({
      data: null,
      error: {
        code: "storage_error",
        message: secretValues.join(" "),
      },
    });
    const reportGroupsQuery = createThenableQuery({
      data: [],
      error: null,
    });
    let tournamentMatchQueryCount = 0;
    const client = {
      from: vi.fn((table: string) => {
        if (table === "registrations") return registrationsQuery;
        if (table === "tournament_matches") {
          tournamentMatchQueryCount += 1;
          return tournamentMatchQueryCount === 1
            ? playerOneMatchesQuery
            : playerTwoMatchesQuery;
        }
        if (table === "match_result_submissions") {
          return submissionsQuery;
        }
        if (table === "match_result_report_groups") {
          return reportGroupsQuery;
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    authMock.mockResolvedValue(playerIdentity);
    createSupabaseAdminClientMock.mockReturnValue(client);

    const result = await dismissDashboardNotifications(
      createFormData({
        notificationId: `submission:${SUBMISSION_UUID}`,
      })
    );
    const visibleOutput = JSON.stringify({
      result,
      logs: vi.mocked(console.error).mock.calls,
    });

    expect(result).toEqual({
      status: "error",
      message: "Your notifications could not be updated.",
      dismissedIds: [],
    });
    expect(vi.mocked(console.error)).toHaveBeenCalledWith(
      "Dashboard match result operation failed.",
      {
        operation: "load-notifications",
        code: "RESULT_FAILED",
      }
    );
    for (const secretValue of secretValues) {
      expect(visibleOutput).not.toContain(secretValue);
    }
  });

  it("removes the ordinary post-launch participant reassignment path", () => {
    const actionSource = readFileSync(
      resolve(process.cwd(), "app/tournaments/match-actions.ts"),
      "utf8"
    );
    const controlsSource = readFileSync(
      resolve(process.cwd(), "components/MatchResultControls.tsx"),
      "utf8"
    );
    const tournamentSource = readFileSync(
      resolve(process.cwd(), "components/TournamentsExperience.tsx"),
      "utf8"
    );

    expect(actionSource).not.toContain("editAdminMatchParticipants");
    expect(actionSource).not.toContain("admin_update_match_participants");
    expect(controlsSource).not.toContain("AdminParticipantEditForm");
    expect(tournamentSource).not.toContain("AdminParticipantEditForm");
  });

  it("preserves a safe downstream reset business error", async () => {
    const service = createRpcClient({
      rpcError: {
        message:
          "Reset blocked because the downstream match has result activity or an official result",
      },
    });
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue(service.client);

    await expect(
      resetAdminMatch(
        idleState,
        createFormData({
          matchId: "match-1",
          confirmation: "RESET",
        })
      )
    ).resolves.toEqual({
      status: "error",
      message:
        "This match cannot be reset while the downstream match has result activity.",
    });
  });

  it("preserves a safe replay-count error on dashboard confirmation", async () => {
    const service = createRpcClient({
      rpcError: {
        message: "This final score requires exactly 3 replay files",
      },
    });
    authMock.mockResolvedValue(playerIdentity);
    createSupabaseAdminClientMock.mockReturnValue(service.client);

    await expect(
      confirmDashboardMatchResult(
        createFormData({ reportGroupId: REPORT_GROUP_UUID })
      )
    ).resolves.toEqual({
      status: "error",
      message:
        "The number of replay files does not match the reported score.",
    });
  });

  it.each([
    [
      "At least one replay file is required",
      "This result cannot be finalized because its replay proof is missing.",
    ],
    [
      "Winner correction blocked because the downstream match already has review activity, submissions, proof, or an official result.",
      "This result cannot be finalized because a downstream match already has result activity. An administrator must resolve it first.",
    ],
  ])(
    "keeps the database business error path-free: %s",
    async (databaseMessage, expectedMessage) => {
      const service = createRpcClient({
        rpcError: { message: databaseMessage },
      });
      authMock.mockResolvedValue(playerIdentity);
      createSupabaseAdminClientMock.mockReturnValue(service.client);

      await expect(
        confirmDashboardMatchResult(
          createFormData({ reportGroupId: REPORT_GROUP_UUID })
        )
      ).resolves.toEqual({
        status: "error",
        message: expectedMessage,
      });
    }
  );
});
