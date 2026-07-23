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

function createStorageClient() {
  const bucket = {
    createSignedUploadUrl: vi.fn(async (path: string) => ({
      data: { path, token: "test-upload-token" },
      error: null,
    })),
    getPublicUrl: vi.fn((path: string) => ({
      data: { publicUrl: `http://127.0.0.1:54321/storage/${path}` },
    })),
  };

  return {
    bucket,
    client: {
      storage: {
        createBucket: vi.fn(),
        from: vi.fn(() => bucket),
        getBucket: vi.fn(async () => ({
          data: { id: "tournament-banners" },
          error: null,
        })),
      },
    },
  };
}

describe("admin authorization boundary", () => {
  beforeEach(() => {
    authMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
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

  it("allows the admin identity to reach the mocked storage boundary", async () => {
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
  });
});
