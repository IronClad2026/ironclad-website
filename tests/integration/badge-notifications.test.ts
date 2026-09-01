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

    await reconcileBadgeUnlockedNotificationsForPlayer(PLAYER_ID);

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
    await reconcileBadgeUnlockedNotificationsForPlayer("invalid");

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
  player,
}: {
  award?: Record<string, unknown>;
  awards?: Array<Record<string, unknown>>;
  player: Record<string, unknown> | null;
}) {
  return {
    from: vi.fn((table: string) => {
      if (table === "players") {
        return createSupabaseQueryMock({ data: player }).query;
      }

      if (table === "player_badge_awards") {
        return createSupabaseQueryMock({
          data: awards ?? award ?? null,
        }).query;
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}
