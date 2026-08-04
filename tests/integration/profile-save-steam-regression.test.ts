import { beforeEach, describe, expect, it, vi } from "vitest";
import { playerIdentity } from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const checkCoh3ProfileOwnershipMock = vi.hoisted(() => vi.fn());
const createAuthenticatedSupabaseClientMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/coh3-profile-ownership", () => ({
  COH3_PROFILE_LINKED_ACCOUNT_MISMATCH_MESSAGE:
    "Use the coh3stats profile linked to your IronClad account.",
  checkCoh3ProfileOwnership: checkCoh3ProfileOwnershipMock,
}));

vi.mock("@/lib/supabase-server", () => ({
  createAuthenticatedSupabaseClient: createAuthenticatedSupabaseClientMock,
}));

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

import { savePlayerProfile } from "@/app/profile/actions";

function createProfileClient() {
  const maybeSingle = vi.fn(async () => ({
    data: {
      avatar_url: null,
      coh3_profile_id: null,
      id: "player-existing",
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
    upsert,
  };
}

function createValidProfileForm() {
  const formData = new FormData();
  formData.set("displayName", "Test Player");
  formData.set("inGameName", "Test IGN");
  formData.set("discordUsername", "test-discord");
  formData.set("steamUsername", "display-only-steam-name");
  formData.set("coh3PlayerCardUrl", "");
  formData.set("country", "Test Country");
  formData.set("region", "Test Region");
  formData.set("timezone", "UTC");
  formData.set("currentElo", "1000");
  formData.set("bio", "");
  return formData;
}

describe("profile save Steam identity regression", () => {
  beforeEach(() => {
    authMock.mockResolvedValue(playerIdentity);
    checkCoh3ProfileOwnershipMock.mockResolvedValue({ ok: true });
  });

  it("keeps the existing profile save successful without writing protected verification fields", async () => {
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
      steam_username: "display-only-steam-name",
    });
    for (const protectedField of [
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
    expect(options).toEqual({ onConflict: "clerk_user_id" });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/profile");
  });
});
