import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseQueryMock } from "@/tests/helpers/supabase-query-mock";

const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const createInAppNotificationMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

vi.mock("@/lib/notifications", () => ({
  createInAppNotification: createInAppNotificationMock,
}));

import {
  createBadgeUnlockedNotification,
  reconcileBadgeUnlockedNotificationsForPlayer,
} from "@/lib/badge-notifications";

const PLAYER_ID = "11111111-1111-4111-8111-111111111111";
const AWARD_ID = "22222222-2222-4222-8222-222222222222";
const SECOND_AWARD_ID = "33333333-3333-4333-8333-333333333333";

describe("Badge unlocked notifications", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
    createInAppNotificationMock.mockReset();
    createInAppNotificationMock.mockResolvedValue(true);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("creates one existing-system event from a genuine immutable award", async () => {
    const client = createBadgeNotificationClient({
      award: awardRow(AWARD_ID, "first-victory"),
      player: { clerk_user_id: "user_badge_owner" },
    });
    createSupabaseAdminClientMock.mockReturnValue(client);

    await expect(
      createBadgeUnlockedNotification({
        awardId: AWARD_ID,
        playerId: PLAYER_ID,
        badgeSlug: "first-victory",
      })
    ).resolves.toBe(true);

    expect(createInAppNotificationMock).toHaveBeenCalledOnce();
    expect(createInAppNotificationMock).toHaveBeenCalledWith({
      recipientClerkUserId: "user_badge_owner",
      recipientRole: "player",
      type: "badge.unlocked",
      title: "Badge unlocked",
      message: "You unlocked the First Victory Badge.",
      eventKey: `badge-award:${AWARD_ID}:unlocked`,
      metadata: {
        awardId: AWARD_ID,
        badgeSlug: "first-victory",
        badgeNumber: 3,
      },
    });
  });

  it("suppresses controlled backfill notifications without suppressing ownership", async () => {
    const from = vi.fn((table: string) => {
      if (table !== "player_badge_awards") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return createSupabaseQueryMock({
        data: awardRow(AWARD_ID, "first-victory", {
          evaluationMode: "backfill",
        }),
      }).query;
    });
    createSupabaseAdminClientMock.mockReturnValue({ from });

    await expect(
      createBadgeUnlockedNotification({
        awardId: AWARD_ID,
        playerId: PLAYER_ID,
        badgeSlug: "first-victory",
      })
    ).resolves.toBe(true);

    expect(from).toHaveBeenCalledOnce();
    expect(createInAppNotificationMock).not.toHaveBeenCalled();
  });

  it("reconciles only non-backfill awards with deterministic award keys", async () => {
    const client = createBadgeNotificationClient({
      awards: [
        awardRow(AWARD_ID, "first-victory"),
        awardRow(SECOND_AWARD_ID, "battle-tested"),
        awardRow(
          "44444444-4444-4444-8444-444444444444",
          "first-deployment",
          { evaluationMode: "backfill" }
        ),
      ],
      player: { clerk_user_id: "user_badge_owner" },
    });
    createSupabaseAdminClientMock.mockReturnValue(client);

    await expect(
      reconcileBadgeUnlockedNotificationsForPlayer(PLAYER_ID)
    ).resolves.toEqual({ succeeded: true });

    expect(createInAppNotificationMock).toHaveBeenCalledTimes(2);
    expect(
      createInAppNotificationMock.mock.calls.map(
        ([input]) => input.eventKey
      )
    ).toEqual([
      `badge-award:${AWARD_ID}:unlocked`,
      `badge-award:${SECOND_AWARD_ID}:unlocked`,
    ]);
  });

  it("retries a false notification result and deduplicates successful later attempts", async () => {
    const awards = [awardRow(AWARD_ID, "first-victory")];
    const awardSnapshot = structuredClone(awards);
    const client = createBadgeNotificationClient({
      awards,
      player: { clerk_user_id: "user_badge_owner" },
    });
    createSupabaseAdminClientMock.mockReturnValue(client);
    const canonicalNotifications = new Set<string>();
    let insertCount = 0;
    let failFirstAttempt = true;
    createInAppNotificationMock.mockImplementation(
      async ({ eventKey }: { eventKey: string }) => {
        if (failFirstAttempt) {
          failFirstAttempt = false;
          return false;
        }

        if (!canonicalNotifications.has(eventKey)) {
          canonicalNotifications.add(eventKey);
          insertCount += 1;
        }
        return true;
      }
    );

    await expect(
      reconcileBadgeUnlockedNotificationsForPlayer(PLAYER_ID)
    ).resolves.toEqual({
      succeeded: false,
      errorCode: "BADGE_NOTIFICATION_CREATE_FAILED",
    });
    await expect(
      reconcileBadgeUnlockedNotificationsForPlayer(PLAYER_ID)
    ).resolves.toEqual({ succeeded: true });
    await expect(
      reconcileBadgeUnlockedNotificationsForPlayer(PLAYER_ID)
    ).resolves.toEqual({ succeeded: true });

    expect(canonicalNotifications).toEqual(
      new Set([`badge-award:${AWARD_ID}:unlocked`])
    );
    expect(insertCount).toBe(1);
    expect(awards).toEqual(awardSnapshot);
    expect(client.from).not.toHaveBeenCalledWith("player_badge_reveals");
  });

  it("recovers multiple awards after a partial attempt without duplicate notifications", async () => {
    const awards = [
      awardRow(AWARD_ID, "first-victory", {
        evaluationMode: "live",
        evaluator: "match-threshold",
      }),
      awardRow(SECOND_AWARD_ID, "battle-tested", {
        evaluationMode: "reconciliation",
        evaluator: "match-threshold",
      }),
    ];
    const awardSnapshot = structuredClone(awards);
    const client = createBadgeNotificationClient({
      awards,
      player: { clerk_user_id: "user_badge_owner" },
    });
    createSupabaseAdminClientMock.mockReturnValue(client);
    const canonicalNotifications = new Set<string>();
    let insertCount = 0;
    let failSecondAward = true;
    createInAppNotificationMock.mockImplementation(
      async ({ eventKey }: { eventKey: string }) => {
        if (
          eventKey === `badge-award:${SECOND_AWARD_ID}:unlocked` &&
          failSecondAward
        ) {
          failSecondAward = false;
          return false;
        }

        if (!canonicalNotifications.has(eventKey)) {
          canonicalNotifications.add(eventKey);
          insertCount += 1;
        }
        return true;
      }
    );

    await expect(
      reconcileBadgeUnlockedNotificationsForPlayer(PLAYER_ID)
    ).resolves.toEqual({
      succeeded: false,
      errorCode: "BADGE_NOTIFICATION_CREATE_FAILED",
    });
    expect(canonicalNotifications).toEqual(
      new Set([`badge-award:${AWARD_ID}:unlocked`])
    );

    await expect(
      reconcileBadgeUnlockedNotificationsForPlayer(PLAYER_ID)
    ).resolves.toEqual({ succeeded: true });
    await expect(
      reconcileBadgeUnlockedNotificationsForPlayer(PLAYER_ID)
    ).resolves.toEqual({ succeeded: true });

    expect(canonicalNotifications).toEqual(
      new Set([
        `badge-award:${AWARD_ID}:unlocked`,
        `badge-award:${SECOND_AWARD_ID}:unlocked`,
      ])
    );
    expect(insertCount).toBe(2);
    expect(awards).toEqual(awardSnapshot);
    expect(client.from.mock.calls.map(([table]) => table)).not.toContain(
      "player_badge_reveals"
    );
  });

  it("does not retry valid backfill-only awards or create notifications", async () => {
    const client = createBadgeNotificationClient({
      awards: [
        awardRow(AWARD_ID, "first-victory", {
          evaluationMode: "backfill",
        }),
      ],
      playerError: { message: "transient recipient lookup failure" },
    });
    createSupabaseAdminClientMock.mockReturnValue(client);

    await expect(
      reconcileBadgeUnlockedNotificationsForPlayer(PLAYER_ID)
    ).resolves.toEqual({ succeeded: true });
    expect(createInAppNotificationMock).not.toHaveBeenCalled();
  });

  it("completes a proven closed or unavailable player without notification", async () => {
    const client = createBadgeNotificationClient({
      player: null,
      awardError: { message: "irrelevant after proven account closure" },
    });
    createSupabaseAdminClientMock.mockReturnValue(client);

    await expect(
      reconcileBadgeUnlockedNotificationsForPlayer(PLAYER_ID)
    ).resolves.toEqual({ succeeded: true });
    expect(createInAppNotificationMock).not.toHaveBeenCalled();
  });

  it("reports recipient read failures and invalid recipient results", async () => {
    const failedClient = createBadgeNotificationClient({
      awards: [awardRow(AWARD_ID, "first-victory")],
      playerError: { message: "recipient query failed" },
    });
    createSupabaseAdminClientMock.mockReturnValueOnce(failedClient);

    await expect(
      reconcileBadgeUnlockedNotificationsForPlayer(PLAYER_ID)
    ).resolves.toEqual({
      succeeded: false,
      errorCode: "BADGE_NOTIFICATION_PLAYER_LOAD_FAILED",
    });

    const malformedClient = createBadgeNotificationClient({
      awards: [awardRow(AWARD_ID, "first-victory")],
      player: { clerk_user_id: "" },
    });
    createSupabaseAdminClientMock.mockReturnValueOnce(malformedClient);

    await expect(
      reconcileBadgeUnlockedNotificationsForPlayer(PLAYER_ID)
    ).resolves.toEqual({
      succeeded: false,
      errorCode: "BADGE_NOTIFICATION_PLAYER_RESULT_INVALID",
    });
  });

  it("reports thrown recipient and award reads as retryable failures", async () => {
    const recipientThrowClient = createBadgeNotificationClient({
      awards: [awardRow(AWARD_ID, "first-victory")],
      playerThrows: true,
    });
    createSupabaseAdminClientMock.mockReturnValueOnce(recipientThrowClient);

    await expect(
      reconcileBadgeUnlockedNotificationsForPlayer(PLAYER_ID)
    ).resolves.toEqual({
      succeeded: false,
      errorCode: "BADGE_NOTIFICATION_PLAYER_LOAD_FAILED",
    });

    const awardThrowClient = createBadgeNotificationClient({
      awardThrows: true,
    });
    createSupabaseAdminClientMock.mockReturnValueOnce(awardThrowClient);

    await expect(
      reconcileBadgeUnlockedNotificationsForPlayer(PLAYER_ID)
    ).resolves.toEqual({
      succeeded: false,
      errorCode: "BADGE_NOTIFICATION_AWARD_LOAD_FAILED",
    });
  });

  it("reports award query failures for an open player", async () => {
    const client = createBadgeNotificationClient({
      awardError: { message: "award query failed" },
    });
    createSupabaseAdminClientMock.mockReturnValue(client);

    await expect(
      reconcileBadgeUnlockedNotificationsForPlayer(PLAYER_ID)
    ).resolves.toEqual({
      succeeded: false,
      errorCode: "BADGE_NOTIFICATION_AWARD_LOAD_FAILED",
    });
  });

  it.each([
    ["non-array result", null],
    ["malformed award row", [{ badge_slug: "first-victory" }]],
    ["unknown Badge slug", [awardRow(AWARD_ID, "unknown-badge")]],
    [
      "unknown backfill Badge slug",
      [
        awardRow(AWARD_ID, "unknown-badge", {
          evaluationMode: "backfill",
        }),
      ],
    ],
    [
      "malformed source metadata",
      [
        {
          id: AWARD_ID,
          badge_slug: "first-victory",
          source_metadata: [],
        },
      ],
    ],
    [
      "duplicate Badge ownership",
      [
        awardRow(AWARD_ID, "first-victory"),
        awardRow(SECOND_AWARD_ID, "first-victory"),
      ],
    ],
    [
      "duplicate award identifier",
      [
        awardRow(AWARD_ID, "first-victory"),
        awardRow(AWARD_ID, "battle-tested"),
      ],
    ],
  ])("rejects %s instead of silently completing", async (_label, awards) => {
    const client = createBadgeNotificationClient({ awards });
    createSupabaseAdminClientMock.mockReturnValue(client);

    await expect(
      reconcileBadgeUnlockedNotificationsForPlayer(PLAYER_ID)
    ).resolves.toEqual({
      succeeded: false,
      errorCode: "BADGE_NOTIFICATION_AWARD_RESULT_INVALID",
    });
    expect(createInAppNotificationMock).not.toHaveBeenCalled();
  });

  it("reports a thrown notification write as incomplete", async () => {
    const client = createBadgeNotificationClient({
      awards: [awardRow(AWARD_ID, "first-victory")],
    });
    createSupabaseAdminClientMock.mockReturnValue(client);
    createInAppNotificationMock.mockRejectedValue(new Error("insert failed"));

    await expect(
      reconcileBadgeUnlockedNotificationsForPlayer(PLAYER_ID)
    ).resolves.toEqual({
      succeeded: false,
      errorCode: "BADGE_NOTIFICATION_CREATE_FAILED",
    });
  });

  it("uses one canonical notification under concurrent repeated reconciliation", async () => {
    const client = createBadgeNotificationClient({
      awards: [awardRow(AWARD_ID, "first-victory")],
    });
    createSupabaseAdminClientMock.mockReturnValue(client);
    const canonicalNotifications = new Set<string>();
    let insertCount = 0;
    createInAppNotificationMock.mockImplementation(
      async ({ eventKey }: { eventKey: string }) => {
        if (!canonicalNotifications.has(eventKey)) {
          canonicalNotifications.add(eventKey);
          insertCount += 1;
        }
        return true;
      }
    );

    await expect(
      Promise.all([
        reconcileBadgeUnlockedNotificationsForPlayer(PLAYER_ID),
        reconcileBadgeUnlockedNotificationsForPlayer(PLAYER_ID),
      ])
    ).resolves.toEqual([{ succeeded: true }, { succeeded: true }]);
    await expect(
      reconcileBadgeUnlockedNotificationsForPlayer(PLAYER_ID)
    ).resolves.toEqual({ succeeded: true });

    expect(insertCount).toBe(1);
    expect(canonicalNotifications).toEqual(
      new Set([`badge-award:${AWARD_ID}:unlocked`])
    );
  });

  it("does not notify a missing or closed-account recipient", async () => {
    const client = createBadgeNotificationClient({
      award: awardRow(AWARD_ID, "first-victory"),
      player: null,
    });
    createSupabaseAdminClientMock.mockReturnValue(client);

    await expect(
      createBadgeUnlockedNotification({
        awardId: AWARD_ID,
        playerId: PLAYER_ID,
        badgeSlug: "first-victory",
      })
    ).resolves.toBe(false);
    expect(createInAppNotificationMock).not.toHaveBeenCalled();
  });

  it("rejects invalid internal identifiers before service-role access", async () => {
    await expect(
      createBadgeUnlockedNotification({
        awardId: "invalid",
        playerId: PLAYER_ID,
        badgeSlug: "first-victory",
      })
    ).resolves.toBe(false);
    await expect(
      reconcileBadgeUnlockedNotificationsForPlayer("invalid")
    ).resolves.toEqual({
      succeeded: false,
      errorCode: "BADGE_NOTIFICATION_PLAYER_RESULT_INVALID",
    });

    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
    expect(createInAppNotificationMock).not.toHaveBeenCalled();
  });
});

function awardRow(
  id: string,
  badgeSlug: string,
  sourceMetadata: Record<string, unknown> = { evaluationMode: "live" }
) {
  return {
    id,
    badge_slug: badgeSlug,
    source_metadata: sourceMetadata,
  };
}

function createBadgeNotificationClient({
  award,
  awards,
  player = { clerk_user_id: "user_badge_owner" },
  playerError = null,
  awardError = null,
  playerThrows = false,
  awardThrows = false,
}: {
  award?: Record<string, unknown>;
  awards?: unknown;
  player?: unknown;
  playerError?: { message: string } | null;
  awardError?: { message: string } | null;
  playerThrows?: boolean;
  awardThrows?: boolean;
}) {
  const from = vi.fn((table: string) => {
    if (table === "players") {
      return playerThrows
        ? createRejectedPlayerQuery()
        : createSupabaseQueryMock({
            data: player,
            error: playerError,
          }).query;
    }

    if (table === "player_badge_awards") {
      return awardThrows
        ? createRejectedAwardQuery()
        : createSupabaseQueryMock({
            data: awards !== undefined ? awards : award ?? null,
            error: awardError,
          }).query;
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    from,
  };
}

function createRejectedPlayerQuery() {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    maybeSingle: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.maybeSingle.mockRejectedValue(new Error("recipient read threw"));
  return query;
}

function createRejectedAwardQuery() {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order
    .mockReturnValueOnce(query)
    .mockRejectedValueOnce(new Error("award read threw"));
  return query;
}
