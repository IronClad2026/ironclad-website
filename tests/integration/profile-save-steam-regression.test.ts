import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_AVATAR_UPLOAD_SIZE_BYTES } from "@/lib/avatar";
import { playerIdentity } from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const createAuthenticatedSupabaseClientMock = vi.hoisted(() => vi.fn());
const evaluateProfileBadgeAwardsMock = vi.hoisted(() => vi.fn());
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

vi.mock("@/lib/badges/authority", () => ({
  BadgeAuthorityError: class BadgeAuthorityError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
  evaluateProfileBadgeAwards: evaluateProfileBadgeAwardsMock,
}));

import { savePlayerProfile } from "@/app/profile/actions";

function createProfileClient(options?: { uploadError?: unknown }) {
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
      return { error: options?.uploadError ?? null };
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

function createPngAvatar(size: number, fileName = "avatar.png") {
  const signature = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);

  return new File(
    [signature, new Uint8Array(Math.max(0, size - signature.length))],
    fileName,
    { type: "image/png" }
  );
}

describe("profile save validation and Steam identity regression", () => {
  beforeEach(() => {
    authMock.mockResolvedValue(playerIdentity);
    evaluateProfileBadgeAwardsMock.mockReset();
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
      code: "saved",
      message: "Player profile saved successfully.",
      errors: {},
    });

    expect(fixture.upsert).toHaveBeenCalledOnce();
    const [profileUpdate, options] = fixture.upsert.mock.calls[0];

    expect(profileUpdate).toMatchObject({
      clerk_user_id: playerIdentity.userId,
      id: "player-existing",
      discord_username: "test-discord",
    });
    expect(profileUpdate).not.toHaveProperty("discord_public_enabled");
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
    expect(evaluateProfileBadgeAwardsMock).toHaveBeenCalledWith({
      playerId: "player-existing",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/profile");
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/badges");
  });

  it("allows Discord to be cleared and neutralizes public visibility", async () => {
    const fixture = createProfileClient();
    createAuthenticatedSupabaseClientMock.mockResolvedValue(fixture.client);
    const formData = createValidProfileForm();
    formData.set("discordUsername", "   ");

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

    expect(fixture.upsert).toHaveBeenCalledOnce();
    expect(fixture.upsert.mock.calls[0][0]).toMatchObject({
      discord_username: null,
      discord_public_enabled: false,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePathMock).toHaveBeenCalledWith("/players");
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/players/player-existing"
    );
  });

  it("still validates the maximum length of a supplied Discord username", async () => {
    const formData = createValidProfileForm();
    formData.set("discordUsername", "d".repeat(101));

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
      code: "review-fields",
      message: "Review the highlighted profile fields.",
      errors: {
        discordUsername: "Discord username must be 100 characters or fewer.",
      },
      errorCodes: {
        discordUsername: {
          code: "too-long",
          count: 100,
          field: "Discord username",
        },
      },
    });

    expect(createAuthenticatedSupabaseClientMock).not.toHaveBeenCalled();
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
      code: "review-fields",
      message: "Review the highlighted profile fields.",
      errors: { avatar: "Avatar image must be 4 MiB or smaller." },
      errorCodes: {
        avatar: { code: "avatar-too-large", size: "4 MiB" },
      },
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
      code: "review-fields",
      message: "Review the highlighted profile fields.",
      errors: { avatar: "Use a PNG, JPG, JPEG, or WEBP image." },
      errorCodes: { avatar: { code: "avatar-type" } },
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
      code: "review-fields",
      message: "Review the highlighted profile fields.",
      errors: {
        avatar: "The selected file does not contain a valid supported image.",
      },
      errorCodes: { avatar: { code: "avatar-invalid" } },
    });

    expect(fixture.upload).not.toHaveBeenCalled();
    expect(fixture.upsert).not.toHaveBeenCalled();
  });

  it("logs successful avatar uploads without identity, path, filename, or token details", async () => {
    const privateUserId = "user_private_avatar_identity";
    const privateToken = "private-session-token-value";
    const privateFileName = "private-original-avatar-name.png";
    const getToken = vi.fn(async () => privateToken);
    const fixture = createProfileClient();
    const consoleInfo = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);
    authMock.mockResolvedValue({
      userId: privateUserId,
      sessionClaims: { metadata: { role: "player" } },
      getToken,
    });
    createAuthenticatedSupabaseClientMock.mockResolvedValue(fixture.client);
    const formData = createValidProfileForm();
    formData.set("avatar", createPngAvatar(1024, privateFileName));

    await expect(
      savePlayerProfile(
        { status: "idle", message: "", errors: {} },
        formData
      )
    ).resolves.toMatchObject({ status: "success" });

    expect(getToken).not.toHaveBeenCalled();
    expect(consoleInfo).toHaveBeenNthCalledWith(
      1,
      "Player avatar upload attempt:",
      {
        bucket: "player-avatars",
        contentType: "image/png",
        fileSize: 1024,
      }
    );
    expect(consoleInfo).toHaveBeenNthCalledWith(
      2,
      "Player avatar upload succeeded:",
      {
        bucket: "player-avatars",
        contentType: "image/png",
        fileSize: 1024,
      }
    );

    const visibleLogs = JSON.stringify(consoleInfo.mock.calls);
    for (const privateValue of [
      privateUserId,
      privateToken,
      privateFileName,
      `${privateUserId}/avatar`,
      "objectPath",
      "fullStoragePath",
      "sessionTokenLength",
      "hasSessionToken",
      "projectHost",
    ]) {
      expect(visibleLogs).not.toContain(privateValue);
    }
  });

  it("normalizes failed avatar logs and never returns raw provider context", async () => {
    const providerMessage = "private provider response and project details";
    const providerCause = "private connection cause";
    const providerError = Object.assign(new Error(providerMessage), {
      statusCode: 503,
      error: "private-provider-error-value",
      cause: new Error(providerCause),
    });
    const fixture = createProfileClient({ uploadError: providerError });
    const consoleInfo = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    createAuthenticatedSupabaseClientMock.mockResolvedValue(fixture.client);
    const formData = createValidProfileForm();
    formData.set(
      "avatar",
      createPngAvatar(2048, "private-failed-avatar-name.png")
    );

    const result = await savePlayerProfile(
      { status: "idle", message: "", errors: {} },
      formData
    );

    expect(result).toEqual({
      status: "error",
      code: "avatar-upload-failed",
      message: "Your avatar could not be uploaded. Check the image and try again.",
      errors: {
        avatar: "Avatar upload failed. Please try again.",
      },
      errorCodes: { avatar: { code: "avatar-upload-failed" } },
    });
    expect(consoleInfo).toHaveBeenCalledWith(
      "Player avatar upload attempt:",
      {
        bucket: "player-avatars",
        contentType: "image/png",
        fileSize: 2048,
      }
    );
    expect(consoleError).toHaveBeenCalledWith(
      "Player avatar upload failed:",
      {
        bucket: "player-avatars",
        contentType: "image/png",
        fileSize: 2048,
        providerStatus: 503,
        errorCode: "STORAGE_UPLOAD_FAILED",
      }
    );
    expect(fixture.upsert).not.toHaveBeenCalled();

    const visibleOutput = JSON.stringify({
      result,
      info: consoleInfo.mock.calls,
      error: consoleError.mock.calls,
    });
    for (const privateValue of [
      providerMessage,
      providerCause,
      "private-provider-error-value",
      "private-failed-avatar-name.png",
      playerIdentity.userId,
      `${playerIdentity.userId}/avatar`,
      "cause",
      "storageError",
    ]) {
      expect(visibleOutput).not.toContain(privateValue);
    }
  });
});
