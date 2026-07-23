import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseQueryMock } from "@/tests/helpers/supabase-query-mock";

const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

import {
  getPublicPlayerById,
  getPublicPlayers,
} from "@/lib/public-players";

const publicRow = {
  id: "11111111-1111-4111-8111-111111111111",
  display_name: "Test Commander",
  player_name: "IronTester",
  country: "Australia",
  region: "Oceania",
  current_elo: 1450,
  public_profile_enabled: true,
  discord_public_enabled: false,
  discord_username: "must-not-leak",
  has_avatar: true,
  avatar_url: "user_test_player/private/avatar",
  created_at: "2026-01-01T00:00:00.000Z",
  clerk_user_id: "user_test_player",
  admin_notes: "private",
};

describe("public-player projection", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
  });

  it("queries the public view and maps only public-safe fields", async () => {
    const supabase = createSupabaseQueryMock({ data: [publicRow] });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const players = await getPublicPlayers();

    expect(supabase.from).toHaveBeenCalledWith("public_player_profiles");
    expect(supabase.calls.find((call) => call.method === "select")?.args[0])
      .toBe(
        "id, display_name, player_name, country, region, current_elo, public_profile_enabled, discord_public_enabled, discord_username, has_avatar, avatar_url, created_at"
      );
    expect(players).toEqual([
      {
        id: publicRow.id,
        displayName: "Test Commander",
        playerName: "IronTester",
        country: "Australia",
        region: "Oceania",
        currentElo: 1450,
        publicProfileEnabled: true,
        discordPublicEnabled: false,
        discordUsername: null,
        hasAvatar: true,
        avatarUrl: `/players/${publicRow.id}/avatar`,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    expect(players[0]).not.toHaveProperty("clerkUserId");
    expect(players[0]).not.toHaveProperty("adminNotes");
    expect(JSON.stringify(players[0])).not.toContain("private/avatar");
    expect(JSON.stringify(players[0])).not.toContain("must-not-leak");
  });

  it("returns an opted-in Discord username while keeping the avatar proxied", async () => {
    const supabase = createSupabaseQueryMock({
      data: [
        {
          ...publicRow,
          discord_public_enabled: true,
          discord_username: "public-discord-name",
        },
      ],
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    await expect(getPublicPlayers()).resolves.toMatchObject([
      {
        discordPublicEnabled: true,
        discordUsername: "public-discord-name",
        avatarUrl: `/players/${publicRow.id}/avatar`,
      },
    ]);
  });

  it("rejects an invalid player ID before creating a service-role client", async () => {
    await expect(getPublicPlayerById("not-a-uuid")).resolves.toBeNull();
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });
});
