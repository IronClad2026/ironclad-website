import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseQueryMock } from "@/tests/helpers/supabase-query-mock";

const publicSupabaseClientMock = vi.hoisted(() => ({
  from: vi.fn(),
}));
const createNoStoreSupabaseClientMock = vi.hoisted(() =>
  vi.fn(() => publicSupabaseClientMock)
);

vi.mock("@/lib/supabase", () => ({
  createNoStoreSupabaseClient: createNoStoreSupabaseClientMock,
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
    publicSupabaseClientMock.from.mockReset();
    createNoStoreSupabaseClientMock.mockClear();
  });

  it("queries the public view and maps only public-safe fields", async () => {
    const supabase = createSupabaseQueryMock({ data: [publicRow] });
    publicSupabaseClientMock.from.mockImplementation(supabase.from);

    const players = await getPublicPlayers();

    expect(publicSupabaseClientMock.from).toHaveBeenCalledWith(
      "public_player_profiles"
    );
    expect(createNoStoreSupabaseClientMock).toHaveBeenCalledOnce();
    expect(supabase.calls.find((call) => call.method === "select")?.args[0])
      .toBe(
        "id, display_name, player_name, country, region, current_elo, public_profile_enabled, discord_public_enabled, discord_username, has_avatar, avatar_url, created_at"
      );
    expect(supabase.calls).toContainEqual({
      method: "eq",
      args: ["public_profile_enabled", true],
    });
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
    publicSupabaseClientMock.from.mockImplementation(supabase.from);

    await expect(getPublicPlayers()).resolves.toMatchObject([
      {
        discordPublicEnabled: true,
        discordUsername: "public-discord-name",
        avatarUrl: `/players/${publicRow.id}/avatar`,
      },
    ]);
  });

  it("neutralizes an inconsistent Discord opt-in with no usable username", async () => {
    const supabase = createSupabaseQueryMock({
      data: [
        {
          ...publicRow,
          discord_public_enabled: true,
          discord_username: "   ",
        },
      ],
    });
    publicSupabaseClientMock.from.mockImplementation(supabase.from);

    await expect(getPublicPlayers()).resolves.toMatchObject([
      {
        discordPublicEnabled: false,
        discordUsername: null,
      },
    ]);
  });

  it("rejects an invalid player ID before creating a Supabase client", async () => {
    await expect(getPublicPlayerById("not-a-uuid")).resolves.toBeNull();
    expect(publicSupabaseClientMock.from).not.toHaveBeenCalled();
    expect(createNoStoreSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("loads a detail profile only through the filtered public view", async () => {
    const supabase = createSupabaseQueryMock({ data: publicRow });
    publicSupabaseClientMock.from.mockImplementation(supabase.from);

    await expect(getPublicPlayerById(publicRow.id)).resolves.toMatchObject({
      id: publicRow.id,
      discordUsername: null,
      avatarUrl: `/players/${publicRow.id}/avatar`,
    });
    expect(publicSupabaseClientMock.from).toHaveBeenCalledWith(
      "public_player_profiles"
    );
    expect(supabase.calls).toContainEqual({
      method: "eq",
      args: ["id", publicRow.id],
    });
    expect(supabase.calls).toContainEqual({
      method: "eq",
      args: ["public_profile_enabled", true],
    });
  });

  it("returns null when the filtered public view has no matching row", async () => {
    const supabase = createSupabaseQueryMock({ data: null });
    publicSupabaseClientMock.from.mockImplementation(supabase.from);

    await expect(getPublicPlayerById(publicRow.id)).resolves.toBeNull();
  });
});
