import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminIdentity,
  anonymousIdentity,
  playerIdentity,
} from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

import { createTournamentBannerUpload } from "@/app/admin/tournaments/actions";

const validBanner = {
  fileName: "banner.png",
  contentType: "image/png",
  size: 1024,
};
const maxBannerBytes = 10 * 1024 * 1024;
const bannerPathPattern =
  /^banners\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/;

function createStorageClient(options?: {
  bucketConfigured?: boolean;
  bucketLookupThrows?: unknown;
  signedUploadError?: unknown;
}) {
  const bucket = {
    createSignedUploadUrl: vi.fn(async (path: string) =>
      options?.signedUploadError
        ? { data: null, error: options.signedUploadError }
        : {
            data: { path, token: "test-upload-token" },
            error: null,
          }
    ),
    getPublicUrl: vi.fn((path: string) => ({
      data: {
        publicUrl:
          `http://127.0.0.1:54321/storage/v1/object/public/` +
          `tournament-banners/${path}`,
      },
    })),
  };

  return {
    bucket,
    client: {
      storage: {
        createBucket: vi.fn(),
        from: vi.fn(() => bucket),
        getBucket: vi.fn(async () => {
          if (options?.bucketLookupThrows) {
            throw options.bucketLookupThrows;
          }
          return {
            data: {
              id: "tournament-banners",
              public: true,
              file_size_limit: options?.bucketConfigured === false
                ? null
                : maxBannerBytes,
              allowed_mime_types: ["image/jpeg", "image/png", "image/webp"],
            },
            error: null,
          };
        }),
        updateBucket: vi.fn(async () => ({ data: {}, error: null })),
      },
    },
  };
}

describe("admin authorization boundary", () => {
  beforeEach(() => {
    authMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it.each([
    ["anonymous", anonymousIdentity],
    ["player", playerIdentity],
  ])("rejects the %s identity before service-role access", async (_name, identity) => {
    authMock.mockResolvedValue(identity);

    await expect(createTournamentBannerUpload(validBanner)).rejects.toThrow(
      "Unauthorized"
    );
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("issues an admin-only opaque UUID capability without an identity-bearing path", async () => {
    const storage = createStorageClient();
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue(storage.client);

    const result = await createTournamentBannerUpload(validBanner);

    expect(createSupabaseAdminClientMock).toHaveBeenCalledOnce();
    expect(storage.client.storage.from).toHaveBeenCalledWith(
      "tournament-banners"
    );
    expect(result).toMatchObject({
      bucket: "tournament-banners",
      token: "test-upload-token",
    });
    expect(result.path).toMatch(bannerPathPattern);
    expect(result.path).not.toContain(adminIdentity.userId);
    expect(result.path).not.toContain(validBanner.fileName);
    expect(storage.bucket.createSignedUploadUrl).toHaveBeenCalledWith(
      result.path,
      { upsert: false }
    );
    expect(storage.client.storage.updateBucket).not.toHaveBeenCalled();
  });

  it("enforces 10 MiB without mutating a correctly configured bucket", async () => {
    const storage = createStorageClient();
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue(storage.client);

    await expect(
      createTournamentBannerUpload({
        ...validBanner,
        size: maxBannerBytes,
      })
    ).resolves.toMatchObject({ bucket: "tournament-banners" });
    expect(storage.client.storage.createBucket).not.toHaveBeenCalled();
    expect(storage.client.storage.updateBucket).not.toHaveBeenCalled();

    createSupabaseAdminClientMock.mockClear();
    await expect(
      createTournamentBannerUpload({
        ...validBanner,
        size: maxBannerBytes + 1,
      })
    ).rejects.toThrow("no larger than 10 MiB");
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("rejects a misconfigured bucket without creating or updating it", async () => {
    const storage = createStorageClient({ bucketConfigured: false });
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue(storage.client);

    await expect(createTournamentBannerUpload(validBanner)).rejects.toThrow(
      "Tournament banner storage is not configured."
    );
    expect(storage.client.storage.createBucket).not.toHaveBeenCalled();
    expect(storage.client.storage.updateBucket).not.toHaveBeenCalled();
    expect(storage.bucket.createSignedUploadUrl).not.toHaveBeenCalled();

    const privateValues =
      "drafts/user_private/banner.png signed-token credential-value";
    const providerFailure = createStorageClient({
      bucketLookupThrows: { message: privateValues },
    });
    createSupabaseAdminClientMock.mockReturnValue(providerFailure.client);

    await expect(createTournamentBannerUpload(validBanner)).rejects.toThrow(
      "Tournament banner storage is not configured."
    );
    expect(providerFailure.client.storage.createBucket).not.toHaveBeenCalled();
    expect(providerFailure.client.storage.updateBucket).not.toHaveBeenCalled();
    expect(providerFailure.bucket.createSignedUploadUrl).not.toHaveBeenCalled();
    const visibleOutput = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(visibleOutput).not.toContain(privateValues);
    expect(visibleOutput).not.toContain("user_private");
    expect(visibleOutput).not.toContain("signed-token");
    expect(visibleOutput).not.toContain("credential-value");
  });

  it("does not log or return provider details when signing fails", async () => {
    const privateValues =
      "drafts/user_private/banner.png signed-token credential-value";
    const storage = createStorageClient({
      signedUploadError: {
        message: privateValues,
        provider: { authorization: "Bearer credential-value" },
      },
    });
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue(storage.client);

    let visibleError = "";
    try {
      await createTournamentBannerUpload(validBanner);
    } catch (error) {
      visibleError = error instanceof Error ? error.message : String(error);
    }

    const visibleOutput = JSON.stringify({
      error: visibleError,
      logs: vi.mocked(console.error).mock.calls,
    });
    expect(visibleOutput).not.toContain(privateValues);
    expect(visibleOutput).not.toContain("user_private");
    expect(visibleOutput).not.toContain("credential-value");
    expect(visibleOutput).not.toContain("Bearer");
    expect(visibleOutput).not.toContain("provider");
    expect(visibleError).toBe("Unable to prepare the banner upload. Try again.");
  });
});
