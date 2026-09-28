import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveNotificationDestination } from "@/lib/notifications";
import { createSupabaseQueryMock } from "@/tests/helpers/supabase-query-mock";

const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

const NOTIFICATION_ID = "11111111-1111-4111-8111-111111111111";

function destinationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: NOTIFICATION_ID,
    recipient_role: null,
    type: "match.ready",
    tournament_id: "tournament-1",
    registration_id: null,
    match_id: "match-1",
    report_group_id: null,
    metadata: {},
    ...overrides,
  };
}

describe("notification destination ownership resolution", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });


  it("routes a message episode to its immutable room under exact recipient ownership", async () => {
    const matchId = "33333333-3333-4333-8333-333333333333";
    const roomId = "22222222-2222-4222-8222-222222222222";
    const supabase = createSupabaseQueryMock({
      data: destinationRow({
        recipient_role: "player", type: "match.message_received",
        match_id: matchId, metadata: { roomId, roomRevision: 1, body: "PRIVATE_TEXT" },
      }),
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);
    await expect(resolveNotificationDestination(NOTIFICATION_ID, "player", "original_player"))
      .resolves.toBe("/tournaments?tab=brackets&match=" + matchId + "&room=" + roomId);
    expect(supabase.calls).toContainEqual({
      method: "eq", args: ["recipient_clerk_user_id", "original_player"],
    });
  });

  it.each([undefined, null, "", "not-a-room", "https://example.test", 42])(
    "never substitutes a current room for malformed message room context %s",
    async (roomId) => {
      const supabase = createSupabaseQueryMock({
        data: destinationRow({
          recipient_role: "player", type: "match.message_received",
          match_id: "33333333-3333-4333-8333-333333333333", metadata: { roomId },
        }),
      });
      createSupabaseAdminClientMock.mockReturnValue(supabase.client);
      await expect(resolveNotificationDestination(NOTIFICATION_ID, "player", "replacement_player"))
        .resolves.toBeNull();
    }
  );

  it("fails safely when a replacement participant does not own the old notification", async () => {
    const supabase = createSupabaseQueryMock({ data: null });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);
    await expect(resolveNotificationDestination(NOTIFICATION_ID, "player", "replacement_player"))
      .resolves.toBeNull();
    expect(supabase.calls).toContainEqual({
      method: "eq", args: ["recipient_clerk_user_id", "replacement_player"],
    });
  });

  it("refuses explicitly malformed assistance room context instead of falling back", async () => {
    const supabase = createSupabaseQueryMock({
      data: destinationRow({
        recipient_role: "admin", type: "match.admin_assistance_requested",
        metadata: { roomId: null },
      }),
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);
    await expect(resolveNotificationDestination(NOTIFICATION_ID, "admin")).resolves.toBeNull();
  });

  it("looks up a Player destination only under the authenticated Clerk owner", async () => {
    const supabase = createSupabaseQueryMock({ data: destinationRow() });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    await expect(
      resolveNotificationDestination(
        NOTIFICATION_ID,
        "player",
        " user_player_a "
      )
    ).resolves.toBe(
      "/tournaments?tournament=tournament-1&tab=brackets&match=match-1"
    );

    expect(supabase.calls).toEqual(
      expect.arrayContaining([
        { method: "eq", args: ["id", NOTIFICATION_ID] },
        {
          method: "eq",
          args: ["recipient_clerk_user_id", "user_player_a"],
        },
        { method: "maybeSingle", args: [] },
      ])
    );
  });

  it("looks up an Admin destination only in the global Admin queue", async () => {
    const supabase = createSupabaseQueryMock({
      data: destinationRow({ recipient_role: "admin" }),
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    await expect(
      resolveNotificationDestination(NOTIFICATION_ID, "admin")
    ).resolves.toBe(
      "/tournaments?tournament=tournament-1&tab=brackets&match=match-1"
    );

    expect(supabase.calls).toContainEqual({
      method: "eq",
      args: ["recipient_role", "admin"],
    });
    expect(supabase.calls).not.toContainEqual({
      method: "eq",
      args: ["recipient_clerk_user_id", expect.anything()],
    });
  });

  it("pins room-scoped assistance to the original room in the admin match workspace", async () => {
    const roomId = "22222222-2222-4222-8222-222222222222";
    const supabase = createSupabaseQueryMock({
      data: destinationRow({
        recipient_role: "admin",
        type: "match.admin_assistance_requested",
        metadata: { roomId, roomRevision: 1 },
      }),
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);
    await expect(resolveNotificationDestination(NOTIFICATION_ID, "admin")).resolves.toBe(
      "/admin/tournaments/tournament-1?section=matches&match=match-1&room=" + roomId
    );
  });
  it("routes an Admin registration notification to the global registrations workspace", async () => {
    const supabase = createSupabaseQueryMock({
      data: destinationRow({
        recipient_role: "admin",
        tournament_id: null,
        registration_id: "registration-1",
        match_id: null,
      }),
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    await expect(
      resolveNotificationDestination(NOTIFICATION_ID, "admin")
    ).resolves.toBe(
      "/admin/registrations?filter=all&selected=registration-1"
    );
  });

  it("routes a Badge unlock notification to the authenticated collection", async () => {
    const supabase = createSupabaseQueryMock({
      data: destinationRow({
        type: "badge.unlocked",
        tournament_id: null,
        match_id: null,
        metadata: {
          awardId: "22222222-2222-4222-8222-222222222222",
          badgeSlug: "first-victory",
          badgeNumber: 3,
        },
      }),
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    await expect(
      resolveNotificationDestination(
        NOTIFICATION_ID,
        "player",
        "user_player_a"
      )
    ).resolves.toBe("/dashboard/badges");
  });

  it("rejects invalid identity before service-role access", async () => {
    await expect(
      resolveNotificationDestination("not-a-uuid", "player", "user_player_a")
    ).resolves.toBeNull();
    await expect(
      resolveNotificationDestination(NOTIFICATION_ID, "player", "")
    ).resolves.toBeNull();

    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("fails closed when the database returns no owned row or a malformed row", async () => {
    const supabase = createSupabaseQueryMock({
      data: { id: NOTIFICATION_ID, type: "match.ready" },
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    await expect(
      resolveNotificationDestination(
        NOTIFICATION_ID,
        "player",
        "user_player_a"
      )
    ).resolves.toBeNull();
  });
});
