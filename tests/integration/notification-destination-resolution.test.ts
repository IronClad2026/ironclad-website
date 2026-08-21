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
