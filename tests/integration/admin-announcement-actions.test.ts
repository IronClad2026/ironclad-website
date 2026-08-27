import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("node:crypto", () => ({
  randomUUID: () => "123e4567-e89b-42d3-a456-426614174000",
}));

import {
  createAnnouncementMediaUpload,
  discardAnnouncementMediaUpload,
  publishAnnouncement,
  withdrawAnnouncement,
} from "@/app/admin/announcements/actions";
import {
  ANNOUNCEMENT_LIMITS,
  ANNOUNCEMENT_MEDIA_MIME_TYPES,
} from "@/lib/announcement-contract";

const imagePath =
  "media/123e4567-e89b-42d3-a456-426614174000.jpg";
const videoPath =
  "media/123e4567-e89b-42d3-a456-426614174000.mp4";
const tournamentId = "323e4567-e89b-42d3-a456-426614174000";

describe("Admin official announcement actions", () => {
  beforeEach(() => {
    authMock.mockResolvedValue({
      userId: "user_admin",
      sessionClaims: { metadata: { role: "admin" } },
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    [null, null],
    ["user_player", "player"],
  ])("rejects non-Admin direct mutations before creating a trusted client", async (userId, role) => {
    authMock.mockResolvedValue({
      userId,
      sessionClaims: role ? { metadata: { role } } : null,
    });

    await expect(
      createAnnouncementMediaUpload({
        fileName: "notice.png",
        contentType: "image/png",
        size: 100,
      })
    ).rejects.toThrow("Unauthorized");
    await expect(
      publishAnnouncement({
        title: "Title",
        body: "Body",
        mediaPath: null,
        mediaDescription: null,
        linkToTournament: false,
        linkedTournamentId: null,
      })
    ).rejects.toThrow("Unauthorized");
    await expect(
      withdrawAnnouncement("123e4567-e89b-42d3-a456-426614174000")
    ).rejects.toThrow("Unauthorized");
    await expect(discardAnnouncementMediaUpload(imagePath)).rejects.toThrow(
      "Unauthorized"
    );
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("authorizes one opaque direct upload only after exact bucket validation", async () => {
    const fixture = storageClient();
    fixture.storage.getBucket.mockResolvedValue({
      data: {
        id: "announcement-media",
        public: true,
        file_size_limit: ANNOUNCEMENT_LIMITS.videoBytes,
        allowed_mime_types: [...ANNOUNCEMENT_MEDIA_MIME_TYPES],
      },
      error: null,
    });
    fixture.bucket.createSignedUploadUrl.mockResolvedValue({
      data: { path: imagePath, token: "short-lived-token" },
      error: null,
    });
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);

    const result = await createAnnouncementMediaUpload({
      fileName: "owner-check.jpeg",
      contentType: "image/jpeg",
      size: ANNOUNCEMENT_LIMITS.imageBytes,
    });

    expect(result).toMatchObject({
      bucket: "announcement-media",
      path: imagePath,
      token: "short-lived-token",
    });
    expect(result.path).not.toContain("owner-check");
    expect(fixture.bucket.createSignedUploadUrl).toHaveBeenCalledWith(
      imagePath,
      { upsert: false }
    );
  });

  it("rejects declared invalid media before trusted Storage access", async () => {
    await expect(
      createAnnouncementMediaUpload({
        fileName: "too-large.png",
        contentType: "image/png",
        size: ANNOUNCEMENT_LIMITS.imageBytes + 1,
      })
    ).rejects.toThrow("one JPG");
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("publishes text only with DB-authored publication time", async () => {
    const fixture = storageClient();
    fixture.client.rpc.mockResolvedValue({
      data: {
        id: "223e4567-e89b-42d3-a456-426614174000",
        published_at: "2026-08-26T02:00:00.000Z",
      },
      error: null,
    });
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);

    const result = await publishAnnouncement({
      title: "  Official update  ",
      body: "  Plain body  ",
      mediaPath: null,
      mediaDescription: null,
      linkToTournament: false,
      linkedTournamentId: null,
    });

    expect(result).toEqual({
      ok: true,
      announcementId: "223e4567-e89b-42d3-a456-426614174000",
      publishedAt: "2026-08-26T02:00:00.000Z",
    });
    const rpcInput = fixture.client.rpc.mock.calls[0][1];
    expect(rpcInput).toMatchObject({
      p_title: "Official update",
      p_body: "Plain body",
      p_media_kind: null,
      p_actor_clerk_user_id: "user_admin",
    });
    expect(rpcInput).not.toHaveProperty("p_published_at");
  });

  it("publishes one server-verified linked Tournament through the atomic linked RPC", async () => {
    const fixture = storageClient();
    fixture.client.rpc.mockResolvedValue({
      data: {
        id: "223e4567-e89b-42d3-a456-426614174000",
        published_at: "2026-08-26T02:00:00.000Z",
      },
      error: null,
    });
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);

    await expect(
      publishAnnouncement({
        title: "Academy registration",
        body: "Registration is open.",
        mediaPath: null,
        mediaDescription: null,
        linkToTournament: true,
        linkedTournamentId: tournamentId,
      })
    ).resolves.toMatchObject({ ok: true });

    expect(fixture.client.from).toHaveBeenCalledWith("tournaments");
    expect(fixture.tournamentQuery.select).toHaveBeenCalledWith("id");
    expect(fixture.tournamentQuery.eq).toHaveBeenCalledWith("id", tournamentId);
    expect(fixture.client.rpc).toHaveBeenCalledWith(
      "publish_official_announcement_with_tournament",
      expect.objectContaining({ p_linked_tournament_id: tournamentId })
    );
  });

  it("rejects missing, nonexistent, and toggle-off injected Tournament links safely", async () => {
    await expect(
      publishAnnouncement({
        title: "Missing link",
        body: "Body",
        mediaPath: null,
        mediaDescription: null,
        linkToTournament: true,
        linkedTournamentId: null,
      })
    ).resolves.toEqual({ ok: false, message: "Select an existing Tournament." });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();

    await expect(
      publishAnnouncement({
        title: "Injected link",
        body: "Body",
        mediaPath: null,
        mediaDescription: null,
        linkToTournament: false,
        linkedTournamentId: tournamentId,
      })
    ).resolves.toEqual({ ok: false, message: "Select an existing Tournament." });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();

    const fixture = storageClient({ tournamentExists: false });
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);
    await expect(
      publishAnnouncement({
        title: "Deleted Tournament",
        body: "Body",
        mediaPath: null,
        mediaDescription: null,
        linkToTournament: true,
        linkedTournamentId: tournamentId,
      })
    ).resolves.toEqual({ ok: false, message: "Select an existing Tournament." });
    expect(fixture.client.rpc).not.toHaveBeenCalled();
  });

  it("retires unreferenced media when linked Tournament validation fails", async () => {
    const fixture = storageClient({ tournamentExists: false });
    fixture.bucket.remove.mockResolvedValue({ error: null });
    fixture.bucket.list.mockResolvedValue({ data: [], error: null });
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);

    await expect(
      publishAnnouncement({
        title: "Deleted Tournament",
        body: "Body",
        mediaPath: imagePath,
        mediaDescription: "Announcement art",
        linkToTournament: true,
        linkedTournamentId: tournamentId,
      })
    ).resolves.toEqual({ ok: false, message: "Select an existing Tournament." });

    expect(fixture.bucket.remove).toHaveBeenCalledWith([imagePath]);
    expect(fixture.client.rpc).not.toHaveBeenCalled();
  });

  it("validates actual video metadata and signature without proxying its body", async () => {
    const fixture = storageClient({ referenced: false });
    fixture.storage.getBucket.mockResolvedValue(exactBucket());
    fixture.bucket.list.mockResolvedValueOnce({
      data: [
        {
          name: videoPath.slice("media/".length),
          metadata: { size: 512, mimetype: "video/mp4" },
        },
      ],
      error: null,
    });
    fixture.client.rpc.mockResolvedValue({
      data: {
        id: "223e4567-e89b-42d3-a456-426614174000",
        published_at: "2026-08-26T02:00:00.000Z",
      },
      error: null,
    });
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);
    const fetchMock = vi.fn(async () =>
      new Response(
        Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]),
        { status: 206 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await publishAnnouncement({
      title: "Video update",
      body: "Plain body",
      mediaPath: videoPath,
      mediaDescription: "Captioned Admin briefing",
      linkToTournament: false,
      linkedTournamentId: null,
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(videoPath),
      expect.objectContaining({ headers: { Range: "bytes=0-31" } })
    );
    expect(fixture.client.rpc).toHaveBeenCalledWith(
      "publish_official_announcement",
      expect.objectContaining({
        p_media_kind: "video",
        p_media_mime_type: "video/mp4",
      })
    );
  });

  it("rejects oversized actual image metadata and retires only the orphan", async () => {
    const fixture = storageClient({ referenced: false });
    fixture.storage.getBucket.mockResolvedValue(exactBucket());
    fixture.bucket.list
      .mockResolvedValueOnce({
        data: [
          {
            name: imagePath.slice("media/".length),
            metadata: {
              size: ANNOUNCEMENT_LIMITS.imageBytes + 1,
              mimetype: "image/jpeg",
            },
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: [], error: null });
    fixture.bucket.remove.mockResolvedValue({ data: [], error: null });
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);

    const result = await publishAnnouncement({
      title: "Image update",
      body: "Plain body",
      mediaPath: imagePath,
      mediaDescription: "Announcement art",
      linkToTournament: false,
      linkedTournamentId: null,
    });

    expect(result).toMatchObject({ ok: false });
    expect(fixture.client.rpc).not.toHaveBeenCalled();
    expect(fixture.bucket.remove).toHaveBeenCalledWith([imagePath]);
  });

  it("preserves media when an ambiguous publication is already referenced", async () => {
    const fixture = storageClient();
    fixture.storage.getBucket.mockResolvedValue(exactBucket());
    fixture.referenceQuery.limit
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{ id: "committed" }], error: null });
    fixture.bucket.list.mockResolvedValueOnce({
      data: [
        {
          name: imagePath.slice("media/".length),
          metadata: { size: 512, mimetype: "image/jpeg" },
        },
      ],
      error: null,
    });
    fixture.client.rpc.mockResolvedValue({
      data: null,
      error: { code: "NETWORK_UNKNOWN" },
    });
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]), {
          status: 206,
        })
      )
    );

    const result = await publishAnnouncement({
      title: "Ambiguous image update",
      body: "Plain body",
      mediaPath: imagePath,
      mediaDescription: "Announcement art",
      linkToTournament: false,
      linkedTournamentId: null,
    });

    expect(result).toMatchObject({ ok: false });
    expect(fixture.referenceQuery.limit).toHaveBeenCalledTimes(2);
    expect(fixture.bucket.remove).not.toHaveBeenCalled();
  });

  it("retires a verified orphan after an uncommitted publication failure", async () => {
    const fixture = storageClient();
    fixture.storage.getBucket.mockResolvedValue(exactBucket());
    fixture.referenceQuery.limit
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    fixture.bucket.list
      .mockResolvedValueOnce({
        data: [
          {
            name: imagePath.slice("media/".length),
            metadata: { size: 512, mimetype: "image/jpeg" },
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: [], error: null });
    fixture.bucket.remove.mockResolvedValue({ data: [], error: null });
    fixture.client.rpc.mockResolvedValue({
      data: null,
      error: { code: "RPC_FAILED" },
    });
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]), {
          status: 206,
        })
      )
    );

    const result = await publishAnnouncement({
      title: "Failed image update",
      body: "Plain body",
      mediaPath: imagePath,
      mediaDescription: "Announcement art",
      linkToTournament: false,
      linkedTournamentId: null,
    });

    expect(result).toMatchObject({ ok: false });
    expect(fixture.bucket.remove).toHaveBeenCalledWith([imagePath]);
  });

  it("never discards a media object already referenced by an announcement", async () => {
    const fixture = storageClient({ referenced: true });
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);

    await expect(discardAnnouncementMediaUpload(imagePath)).resolves.toEqual({
      deleted: false,
    });
    expect(fixture.bucket.remove).not.toHaveBeenCalled();
  });

  it("withdraws in the database before best-effort media retirement", async () => {
    const fixture = storageClient();
    fixture.client.rpc.mockResolvedValue({
      data: {
        withdrawn: true,
        withdrawn_at: "2026-08-26T03:00:00.000Z",
        media_path: imagePath,
      },
      error: null,
    });
    fixture.bucket.remove.mockResolvedValue({ data: [], error: null });
    fixture.bucket.list.mockResolvedValue({ data: [], error: null });
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);

    const result = await withdrawAnnouncement(
      "223e4567-e89b-42d3-a456-426614174000"
    );

    expect(result).toEqual({ ok: true, mediaCleanupWarning: false });
    expect(fixture.client.rpc).toHaveBeenCalledWith(
      "withdraw_official_announcement",
      expect.any(Object)
    );
    expect(fixture.client.rpc.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.bucket.remove.mock.invocationCallOrder[0]
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/announcements");
  });

  it("keeps withdrawal successful when media retirement fails safely", async () => {
    const fixture = storageClient();
    fixture.client.rpc.mockResolvedValue({
      data: {
        withdrawn: true,
        withdrawn_at: "2026-08-26T03:00:00.000Z",
        media_path: imagePath,
      },
      error: null,
    });
    fixture.bucket.remove.mockResolvedValue({
      data: null,
      error: { code: "STORAGE_UNAVAILABLE" },
    });
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);

    await expect(
      withdrawAnnouncement("223e4567-e89b-42d3-a456-426614174000")
    ).resolves.toEqual({ ok: true, mediaCleanupWarning: true });
    expect(revalidatePathMock).toHaveBeenCalledWith("/announcements");
  });
});

function exactBucket() {
  return {
    data: {
      id: "announcement-media",
      public: true,
      file_size_limit: ANNOUNCEMENT_LIMITS.videoBytes,
      allowed_mime_types: [...ANNOUNCEMENT_MEDIA_MIME_TYPES],
    },
    error: null,
  };
}

function storageClient({
  referenced = false,
  tournamentExists = true,
  tournamentError = null,
}: {
  referenced?: boolean;
  tournamentExists?: boolean;
  tournamentError?: { code: string } | null;
} = {}) {
  const bucket = {
    createSignedUploadUrl: vi.fn(),
    list: vi.fn(),
    remove: vi.fn(),
  };
  const storage = {
    getBucket: vi.fn(),
    from: vi.fn(() => bucket),
  };
  const referenceQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    limit: vi.fn(async () => ({
      data: referenced ? [{ id: "existing" }] : [],
      error: null,
    })),
  };
  referenceQuery.select.mockReturnValue(referenceQuery);
  referenceQuery.eq.mockReturnValue(referenceQuery);
  const tournamentQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({
      data: tournamentExists
        ? { id: "323e4567-e89b-42d3-a456-426614174000" }
        : null,
      error: tournamentError,
    })),
  };
  tournamentQuery.select.mockReturnValue(tournamentQuery);
  tournamentQuery.eq.mockReturnValue(tournamentQuery);
  const client = {
    storage,
    rpc: vi.fn(),
    from: vi.fn((table: string) =>
      table === "tournaments" ? tournamentQuery : referenceQuery
    ),
  };
  return { bucket, storage, client, referenceQuery, tournamentQuery };
}
