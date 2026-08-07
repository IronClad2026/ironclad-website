import { beforeEach, describe, expect, it, vi } from "vitest";
import { playerIdentity } from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const createAuthenticatedSupabaseClientMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/supabase-server", () => ({
  createAuthenticatedSupabaseClient: createAuthenticatedSupabaseClientMock,
}));

import { savePlayerProfile } from "@/app/profile/actions";

function createProfileClient() {
  const maybeSingle = vi.fn(async () => ({
    data: {
      avatar_url: "/api/players/player-existing/avatar",
      id: "player-existing",
      steam_username: "Synced Steam 名 ✨",
    },
    error: null,
  }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const upsert = vi.fn(
    async (
      _profileUpdate: Record<string, unknown>,
      _options: { onConflict: string }
    ) => {
      void _profileUpdate;
      void _options;
      return { error: null };
    }
  );
  const from = vi.fn(() => ({ select, upsert }));

  return {
    client: { from },
    from,
    select,
    upsert,
  };
}

function createValidProfileForm() {
  const formData = new FormData();
  formData.set("displayName", "Test Player");
  formData.set("inGameName", "Test IGN");
  formData.set("discordUsername", "test-discord");
  formData.set("steamUsername", "forged-browser-steam-name");
  formData.set(
    "coh3PlayerCardUrl",
    "https://coh3stats.com/players/forged-legacy-value"
  );
  formData.set("country", "Test Country");
  formData.set("region", "Test Region");
  formData.set("timezone", "UTC");
  formData.set("currentElo", "4999");
  formData.set("bio", "");
  return formData;
}

describe("profile save Steam identity regression", () => {
  beforeEach(() => {
    authMock.mockResolvedValue(playerIdentity);
  });

  it("ignores a forged Steam display name and leaves completion to the protected database rule", async () => {
    const fixture = createProfileClient();
    createAuthenticatedSupabaseClientMock.mockResolvedValue(fixture.client);

    await expect(
      savePlayerProfile(
        {
          status: "idle",
          message: "",
          errors: {},
        },
        createValidProfileForm()
      )
    ).resolves.toEqual({
      status: "success",
      message: "Player profile saved successfully.",
      errors: {},
    });

    expect(fixture.upsert).toHaveBeenCalledOnce();
    const [profileUpdate, options] = fixture.upsert.mock.calls[0];

    expect(profileUpdate).toMatchObject({
      clerk_user_id: playerIdentity.userId,
      id: "player-existing",
    });
    for (const protectedField of [
      "steam_username",
      "profile_completed",
      "current_elo",
      "coh3_player_card_url",
      "steam_id64",
      "relic_verified_elo",
      "relic_verified_faction",
      "relic_verified_division",
      "relic_elo_calculation_version",
      "relic_elo_verified_at",
      "relic_elo_last_attempt_at",
    ]) {
      expect(profileUpdate).not.toHaveProperty(protectedField);
    }
    expect(fixture.select).toHaveBeenCalledWith("id");
    expect(options).toEqual({ onConflict: "clerk_user_id" });
    expect(revalidatePathMock).toHaveBeenCalledWith("/profile");
  });
});
