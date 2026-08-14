import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_AVATAR_UPLOAD_SIZE_BYTES } from "@/lib/avatar";
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
  const upload = vi.fn(
    async (
      _path: string,
      _file: File,
      _options: {
        cacheControl: string;
        contentType: string;
        upsert: boolean;
      }
    ) => {
      void _path;
      void _file;
      void _options;
      return { error: null };
    }
  );
  const storageFrom = vi.fn(() => ({ upload }));

  return {
    client: { from, storage: { from: storageFrom } },
    from,
    select,
    storageFrom,
    upload,
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

function createPngAvatar(size: number) {
  const signature = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);

  return new File(
    [signature, new Uint8Array(Math.max(0, size - signature.length))],
    "avatar.png",
    { type: "image/png" }
  );
}

describe("profile save validation and Steam identity regression", () => {
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

  it("accepts an avatar exactly at the 4 MiB application boundary", async () => {
    const fixture = createProfileClient();
    createAuthenticatedSupabaseClientMock.mockResolvedValue(fixture.client);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const formData = createValidProfileForm();
    formData.set("avatar", createPngAvatar(MAX_AVATAR_UPLOAD_SIZE_BYTES));

    await expect(
      savePlayerProfile(
        {
          status: "idle",
          message: "",
          errors: {},
        },
        formData
      )
    ).resolves.toMatchObject({ status: "success" });

    expect(fixture.storageFrom).toHaveBeenCalledWith("player-avatars");
    expect(fixture.upload).toHaveBeenCalledOnce();
    const uploadedAvatar = fixture.upload.mock.calls[0][1];
    expect(uploadedAvatar).toBeInstanceOf(File);
    expect(uploadedAvatar.size).toBe(MAX_AVATAR_UPLOAD_SIZE_BYTES);
  });

  it("accepts a smaller valid avatar", async () => {
    const fixture = createProfileClient();
    createAuthenticatedSupabaseClientMock.mockResolvedValue(fixture.client);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const formData = createValidProfileForm();
    formData.set("avatar", createPngAvatar(1024));

    await expect(
      savePlayerProfile(
        {
          status: "idle",
          message: "",
          errors: {},
        },
        formData
      )
    ).resolves.toMatchObject({ status: "success" });

    expect(fixture.upload).toHaveBeenCalledOnce();
    expect(fixture.upload.mock.calls[0][1].size).toBe(1024);
    expect(fixture.upsert).toHaveBeenCalledOnce();
  });

  it("rejects an avatar one byte above the 4 MiB application boundary", async () => {
    const fixture = createProfileClient();
    createAuthenticatedSupabaseClientMock.mockResolvedValue(fixture.client);
    const formData = createValidProfileForm();
    formData.set(
      "avatar",
      createPngAvatar(MAX_AVATAR_UPLOAD_SIZE_BYTES + 1)
    );

    await expect(
      savePlayerProfile(
        {
          status: "idle",
          message: "",
          errors: {},
        },
        formData
      )
    ).resolves.toEqual({
      status: "error",
      message: "Review the highlighted profile fields.",
      errors: { avatar: "Avatar image must be 4 MiB or smaller." },
    });

    expect(fixture.upload).not.toHaveBeenCalled();
    expect(fixture.upsert).not.toHaveBeenCalled();
  });

  it("rejects an unsupported avatar type before Storage or profile mutation", async () => {
    const fixture = createProfileClient();
    createAuthenticatedSupabaseClientMock.mockResolvedValue(fixture.client);
    const formData = createValidProfileForm();
    formData.set(
      "avatar",
      new File([new Uint8Array(12)], "avatar.txt", { type: "text/plain" })
    );

    await expect(
      savePlayerProfile(
        {
          status: "idle",
          message: "",
          errors: {},
        },
        formData
      )
    ).resolves.toEqual({
      status: "error",
      message: "Review the highlighted profile fields.",
      errors: { avatar: "Use a PNG, JPG, JPEG, or WEBP image." },
    });

    expect(fixture.upload).not.toHaveBeenCalled();
    expect(fixture.upsert).not.toHaveBeenCalled();
  });

  it("rejects an invalid avatar signature before Storage or profile mutation", async () => {
    const fixture = createProfileClient();
    createAuthenticatedSupabaseClientMock.mockResolvedValue(fixture.client);
    const formData = createValidProfileForm();
    formData.set(
      "avatar",
      new File([new Uint8Array(12)], "avatar.png", { type: "image/png" })
    );

    await expect(
      savePlayerProfile(
        {
          status: "idle",
          message: "",
          errors: {},
        },
        formData
      )
    ).resolves.toEqual({
      status: "error",
      message: "Review the highlighted profile fields.",
      errors: {
        avatar: "The selected file does not contain a valid supported image.",
      },
    });

    expect(fixture.upload).not.toHaveBeenCalled();
    expect(fixture.upsert).not.toHaveBeenCalled();
  });
});
