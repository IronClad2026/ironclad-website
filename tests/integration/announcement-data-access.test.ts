import { beforeEach, describe, expect, it, vi } from "vitest";

const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

import {
  loadAuthenticatedAnnouncementNavigationState,
  loadLatestPublicAnnouncement,
  loadPublicAnnouncements,
  markAuthenticatedAnnouncementSeen,
} from "@/lib/announcements";

const id = "223e4567-e89b-42d3-a456-426614174000";
const publishedAt = "2026-08-26T02:30:00.000Z";

describe("official announcement server data access", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("serves anonymous feed data through a server-only projection and strips raw paths", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        announcements: [
          {
            id,
            title: "Official update",
            body: "Plain text",
            media_kind: "image",
            media_path: `media/${id}.png`,
            media_mime_type: "image/png",
            media_description: "Orange shield on a dark field",
            published_at: publishedAt,
          },
        ],
      },
      error: null,
    });
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    const result = await loadPublicAnnouncements();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected a successful public feed");
    expect(result.announcements[0]).toMatchObject({
      id,
      mediaKind: "image",
      mediaMimeType: "image/png",
    });
    expect(result.announcements[0]).not.toHaveProperty("mediaPath");
    expect(result.announcements[0].mediaUrl).toContain(
      `/announcement-media/media/${id}.png`
    );
    expect(rpc).toHaveBeenCalledWith("list_active_announcements");
  });

  it("keeps feed load failure distinct from a valid empty feed", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: "unavailable" } })
      .mockResolvedValueOnce({
        data: { announcements: [] },
        error: null,
      });
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    await expect(loadPublicAnnouncements()).resolves.toEqual({
      ok: false,
      announcements: [],
    });
    await expect(loadPublicAnnouncements()).resolves.toEqual({
      ok: true,
      announcements: [],
    });
  });

  it("loads only the latest active marker for anonymous navigation", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { latest: { id, published_at: publishedAt } },
      error: null,
    });
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    await expect(loadLatestPublicAnnouncement()).resolves.toEqual({
      id,
      publishedAt,
    });
    expect(rpc).toHaveBeenCalledWith("get_latest_active_announcement");
  });

  it("uses one account-scoped service RPC for authenticated unread state", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        latest: { id, published_at: publishedAt },
        unread: true,
      },
      error: null,
    });
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    await expect(
      loadAuthenticatedAnnouncementNavigationState("user_player_a")
    ).resolves.toEqual({
      latest: { id, publishedAt },
      unread: true,
    });
    expect(rpc).toHaveBeenCalledWith("get_announcement_navigation_state", {
      p_clerk_user_id: "user_player_a",
    });
  });

  it("accepts only an exact successful monotonic seen projection", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          marked: true,
          latest: { id, published_at: publishedAt },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          marked: true,
          latest: {
            id: "123e4567-e89b-42d3-a456-426614174000",
            published_at: publishedAt,
          },
        },
        error: null,
      });
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    await expect(
      markAuthenticatedAnnouncementSeen("user_player_a", id)
    ).resolves.toBe(true);
    await expect(
      markAuthenticatedAnnouncementSeen("user_player_a", id)
    ).resolves.toBe(false);
    expect(rpc).toHaveBeenCalledWith("mark_announcement_seen", {
      p_clerk_user_id: "user_player_a",
      p_announcement_id: id,
    });
  });
});
