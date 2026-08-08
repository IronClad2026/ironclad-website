import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationsRead,
} from "@/lib/notifications";
import { createSupabaseQueryMock } from "@/tests/helpers/supabase-query-mock";

const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

describe("notification read-state filtering", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("scopes a player update to that player's Clerk ID", async () => {
    const supabase = createSupabaseQueryMock();
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    await expect(
      markNotificationRead({
        notificationId: "notification-owned-by-player-b",
        scope: "player",
        clerkUserId: "user_player_a",
      })
    ).resolves.toBe(true);

    expect(supabase.calls).toEqual(
      expect.arrayContaining([
        { method: "eq", args: ["id", "notification-owned-by-player-b"] },
        {
          method: "eq",
          args: ["recipient_clerk_user_id", "user_player_a"],
        },
        { method: "is", args: ["read_at", null] },
      ])
    );
  });

  it("scopes an admin update to admin notifications", async () => {
    const supabase = createSupabaseQueryMock();
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    await expect(
      markAllNotificationsRead({ scope: "admin" })
    ).resolves.toBe(true);

    expect(supabase.calls).toEqual(
      expect.arrayContaining([
        { method: "eq", args: ["recipient_role", "admin"] },
        { method: "is", args: ["read_at", null] },
      ])
    );
  });

  it("deduplicates notification IDs and limits a mutation to 100 rows", async () => {
    const supabase = createSupabaseQueryMock();
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);
    const notificationIds = [
      ...Array.from({ length: 105 }, (_, index) => `notification-${index}`),
      "notification-0",
    ];

    await markNotificationsRead({
      notificationIds,
      scope: "player",
      clerkUserId: "user_player_a",
    });

    const inCall = supabase.calls.find((call) => call.method === "in");
    expect(inCall?.args[0]).toBe("id");
    expect(inCall?.args[1]).toHaveLength(100);
    expect(new Set(inCall?.args[1] as string[]).size).toBe(100);
  });

  it("does not create a broad mutation for an empty ID list", async () => {
    await expect(
      markNotificationsRead({
        notificationIds: [],
        scope: "player",
        clerkUserId: "user_player_a",
      })
    ).resolves.toBe(true);
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("returns false when the filtered update fails", async () => {
    const supabase = createSupabaseQueryMock({
      error: { message: "mock update failure" },
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    await expect(
      markNotificationRead({
        notificationId: "notification-1",
        scope: "player",
        clerkUserId: "user_player_a",
      })
    ).resolves.toBe(false);
  });

  it("soft-hides canonical events while physically deleting only legacy rows", async () => {
    const supabase = createSupabaseQueryMock();
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    await expect(
      deleteNotifications({
        notificationIds: ["canonical-or-legacy-notification"],
        scope: "player",
        clerkUserId: "user_player_a",
      })
    ).resolves.toBe(true);

    expect(supabase.from).toHaveBeenCalledTimes(2);
    expect(supabase.calls).toEqual(
      expect.arrayContaining([
        {
          method: "update",
          args: [{ in_app_hidden_at: expect.any(String) }],
        },
        { method: "not", args: ["event_key", "is", null] },
        { method: "delete", args: [] },
        { method: "is", args: ["event_key", null] },
      ])
    );
    expect(
      supabase.calls.filter(
        (call) =>
          call.method === "eq" &&
          call.args[0] === "recipient_clerk_user_id" &&
          call.args[1] === "user_player_a"
      )
    ).toHaveLength(2);
  });

  it("never recreates a broad delete when there are no selected rows", async () => {
    await expect(
      deleteNotifications({
        notificationIds: [],
        scope: "player",
        clerkUserId: "user_player_a",
      })
    ).resolves.toBe(true);

    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });
});
