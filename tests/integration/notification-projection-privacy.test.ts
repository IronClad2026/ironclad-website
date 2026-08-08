import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseQueryMock } from "@/tests/helpers/supabase-query-mock";

const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const createInAppNotificationMock = vi.hoisted(() => vi.fn());
const createInAppNotificationsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

vi.mock("@/lib/notifications", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/notifications")>();

  return {
    ...actual,
    createInAppNotification: createInAppNotificationMock,
    createInAppNotifications: createInAppNotificationsMock,
  };
});

import {
  notifyPlayersOfLegacyMatchResultReview,
  notifyPlayersOfReportGroupReview,
} from "@/lib/notification-events";
import { loadPlayerNotifications } from "@/lib/notifications";

const recipientClerkUserId = "user_synthetic_notification_recipient";
const actorClerkUserId = "user_synthetic_notification_actor";
const reviewerClerkUserId = "user_synthetic_notification_reviewer";

describe("notification browser privacy boundary", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
    createInAppNotificationMock.mockReset();
    createInAppNotificationsMock.mockReset();
  });

  it("projects notifications without recipient or actor Clerk identifiers", async () => {
    const notificationQuery = createNotificationProjectionClient({
      id: "notification-1",
      recipient_clerk_user_id: recipientClerkUserId,
      recipient_role: "player",
      type: "match.result_approved",
      title: "Match Result Approved",
      message: "Your submitted match result has been approved.",
      actor_clerk_user_id: actorClerkUserId,
      actor_display_name: "IronClad Admin",
      tournament_id: "tournament-1",
      tournament_title: "Synthetic Tournament",
      registration_id: "registration-1",
      match_id: "match-1",
      report_group_id: "report-group-1",
      event_key: "match:match-1:activation:1:reminder:1",
      metadata: {
        deadlineAt: "2026-08-01T12:00:00.000Z",
        actor_clerk_user_id: actorClerkUserId,
        proofPath:
          "match-1/user_synthetic_notification_actor/private.rec",
      },
      read_at: null,
      created_at: "2026-07-25T00:00:00.000Z",
    });
    createSupabaseAdminClientMock.mockReturnValue(
      notificationQuery.client
    );

    const result = await loadPlayerNotifications(recipientClerkUserId);
    const projectionSelect = notificationQuery.calls.find(
      (call) =>
        call.method === "select" &&
        typeof call.args[0] === "string" &&
        call.args[0].includes("actor_display_name")
    )?.args[0];
    const payload = JSON.stringify(result.notifications);

    expect(projectionSelect).not.toContain("recipient_clerk_user_id");
    expect(projectionSelect).not.toContain("actor_clerk_user_id");
    expect(projectionSelect).toContain("metadata");
    expect(result.notifications).toHaveLength(1);
    expect(Object.keys(result.notifications[0])).not.toContain(
      "recipientClerkUserId"
    );
    expect(Object.keys(result.notifications[0])).not.toContain(
      "actorClerkUserId"
    );
    expect(Object.keys(result.notifications[0])).not.toContain("metadata");
    expect(Object.keys(result.notifications[0])).not.toContain("eventKey");
    expect(result.notifications[0].deadlineAt).toBe(
      "2026-08-01T12:00:00.000Z"
    );
    expect(payload).not.toContain(recipientClerkUserId);
    expect(payload).not.toContain(actorClerkUserId);
  });

  it("routes a waitlist spot offer to its exact owner dashboard card", async () => {
    const registrationId = "11111111-1111-4111-8111-111111111111";
    const notificationQuery = createNotificationProjectionClient({
      id: "notification-offer-1",
      recipient_role: "player",
      type: "registration.waitlist_offer",
      title: "Tournament Spot Available",
      message: "A place is available until the stated deadline.",
      actor_display_name: null,
      tournament_id: "22222222-2222-4222-8222-222222222222",
      tournament_title: "Synthetic Tournament",
      registration_id: registrationId,
      match_id: null,
      report_group_id: null,
      event_key: "registration:offer:1",
      metadata: {},
      read_at: null,
      created_at: "2026-08-06T03:00:00.000Z",
    });
    createSupabaseAdminClientMock.mockReturnValue(notificationQuery.client);

    const result = await loadPlayerNotifications(recipientClerkUserId);

    expect(result.notifications[0]?.href).toBe(
      `/dashboard#registration-${registrationId}`
    );
  });

  it("routes a deadline event to the exact tournament bracket match", async () => {
    const tournamentId = "22222222-2222-4222-8222-222222222222";
    const matchId = "33333333-3333-4333-8333-333333333333";
    const notificationQuery = createNotificationProjectionClient({
      id: "notification-deadline-1",
      recipient_role: "player",
      type: "match.deadline_reminder",
      title: "Match Deadline Reminder",
      message: "Your matchup deadline is approaching.",
      actor_display_name: null,
      tournament_id: tournamentId,
      tournament_title: "Synthetic Tournament",
      registration_id: null,
      match_id: matchId,
      report_group_id: null,
      event_key: `match:${matchId}:activation:1:reminder:1`,
      metadata: {
        reminderOrdinal: 1,
        deadlineAt: "2026-08-01T12:00:00.000Z",
        privateReason: "must not project",
      },
      read_at: null,
      created_at: "2026-07-29T12:00:00.000Z",
    });
    createSupabaseAdminClientMock.mockReturnValue(notificationQuery.client);

    const result = await loadPlayerNotifications(recipientClerkUserId);

    expect(result.notifications[0]).toMatchObject({
      matchId,
      deadlineAt: "2026-08-01T12:00:00.000Z",
      href: `/tournaments?tournament=${tournamentId}&tab=brackets&match=${matchId}`,
    });
    expect(JSON.stringify(result.notifications[0])).not.toContain(
      "privateReason"
    );
  });

  it("does not persist a reviewer Clerk ID in report-group review notifications", async () => {
    const client = createNotificationContextClient();
    createInAppNotificationsMock.mockResolvedValue(true);
    const legacyCompatibleCall =
      notifyPlayersOfReportGroupReview as unknown as (
        supabase: unknown,
        input: {
          reportGroupId: string;
          decision: string;
          reviewedBy: string;
        }
      ) => Promise<void>;

    await legacyCompatibleCall(client, {
      reportGroupId: "report-group-1",
      decision: "approved",
      reviewedBy: reviewerClerkUserId,
    });

    expect(createInAppNotificationsMock).toHaveBeenCalledOnce();
    const notifications = createInAppNotificationsMock.mock.calls[0][0];
    const payload = JSON.stringify(notifications);

    expect(notifications).toHaveLength(2);
    for (const notification of notifications) {
      expect(notification).not.toHaveProperty("actorClerkUserId");
    }
    expect(payload).not.toContain(reviewerClerkUserId);
  });

  it("does not persist a reviewer Clerk ID in legacy-result review notifications", async () => {
    const client = createNotificationContextClient();
    createInAppNotificationMock.mockResolvedValue(true);
    const legacyCompatibleCall =
      notifyPlayersOfLegacyMatchResultReview as unknown as (
        supabase: unknown,
        input: {
          submissionId: string;
          decision: string;
          reviewedBy: string;
        }
      ) => Promise<void>;

    await legacyCompatibleCall(client, {
      submissionId: "submission-1",
      decision: "resubmission_requested",
      reviewedBy: reviewerClerkUserId,
    });

    expect(createInAppNotificationMock).toHaveBeenCalledOnce();
    const notification = createInAppNotificationMock.mock.calls[0][0];

    expect(notification).not.toHaveProperty("actorClerkUserId");
    expect(JSON.stringify(notification)).not.toContain(
      reviewerClerkUserId
    );
  });
});

function createNotificationContextClient() {
  const reportGroup = {
    id: "report-group-1",
    match_id: "match-1",
    tournament_id: "tournament-1",
    result_type: "normal",
    no_show_registration_id: null,
    submitted_by_clerk_user_id: "user_submitter",
    submitted_by_registration_id: "registration-1",
    opponent_registration_id: "registration-2",
    player_one_score: 2,
    player_two_score: 1,
  };
  const submission = {
    id: "submission-1",
    match_id: "match-1",
    submitted_by_clerk_user_id: "user_submitter",
    submitted_by_registration_id: "registration-1",
  };
  const match = {
    id: "match-1",
    match_number: 1,
    bracket_rounds: { name: "Final" },
    generated_brackets: {
      tournament_brackets: {
        tournament_id: "tournament-1",
        tournaments: {
          id: "tournament-1",
          title: "Synthetic Tournament",
        },
      },
    },
  };
  const registrations = [
    {
      id: "registration-1",
      clerk_user_id: "user_submitter",
      player_name: "Submitter",
    },
    {
      id: "registration-2",
      clerk_user_id: "user_opponent",
      player_name: "Opponent",
    },
  ];

  return {
    from: vi.fn((table: string) => {
      const data = {
        match_result_report_groups: reportGroup,
        match_result_submissions: submission,
        registrations,
        tournament_matches: match,
        tournaments: { title: "Synthetic Tournament" },
      }[table];

      if (data === undefined) {
        throw new Error(`Unexpected notification test table: ${table}`);
      }

      return createSupabaseQueryMock({ data }).query;
    }),
  };
}

function createNotificationProjectionClient(row: Record<string, unknown>) {
  type MethodName = "eq" | "is" | "limit" | "order" | "select";
  type Result = {
    count: number | null;
    data: unknown;
    error: null;
  };
  type Method = (...args: unknown[]) => Query;
  type Query = PromiseLike<Result> & Record<MethodName, Method>;

  const calls: { args: unknown[]; method: string }[] = [];
  const from = vi.fn(() => {
    const target: Partial<Query> = {};
    const query = target as Query;
    let result: Result = {
      count: null,
      data: [row],
      error: null,
    };

    for (const method of [
      "eq",
      "is",
      "limit",
      "order",
    ] as const) {
      target[method] = (...args: unknown[]) => {
        calls.push({ method, args });
        return query;
      };
    }

    target.select = (...args: unknown[]) => {
      calls.push({ method: "select", args });
      if (args[0] === "id") {
        result = {
          count: 1,
          data: null,
          error: null,
        };
      }
      return query;
    };
    target.then = (resolve, reject) =>
      Promise.resolve(result).then(resolve, reject);

    return query;
  });

  return {
    calls,
    client: { from },
  };
}
