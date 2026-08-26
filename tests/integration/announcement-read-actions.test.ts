import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const loadAuthenticatedStateMock = vi.hoisted(() => vi.fn());
const loadLatestMock = vi.hoisted(() => vi.fn());
const markSeenMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/announcements", () => ({
  loadAuthenticatedAnnouncementNavigationState: loadAuthenticatedStateMock,
  loadLatestPublicAnnouncement: loadLatestMock,
  markAuthenticatedAnnouncementSeen: markSeenMock,
}));

import {
  loadAnnouncementNavigationState,
  markAnnouncementSeen,
} from "@/app/announcements/actions";

const latest = {
  id: "223e4567-e89b-42d3-a456-426614174000",
  publishedAt: "2026-08-26T02:30:00.000Z",
};

describe("official announcement read actions", () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ userId: null });
    loadLatestMock.mockResolvedValue(latest);
    loadAuthenticatedStateMock.mockResolvedValue({
      latest,
      unread: true,
    });
    markSeenMock.mockResolvedValue(true);
  });

  it("uses only browser-local context for a signed-out navigation response", async () => {
    await expect(loadAnnouncementNavigationState()).resolves.toEqual({
      ok: true,
      viewer: "anonymous",
      latest,
    });
    expect(loadLatestMock).toHaveBeenCalledOnce();
    expect(loadAuthenticatedStateMock).not.toHaveBeenCalled();
  });

  it("makes authenticated server state authoritative after sign-in", async () => {
    authMock.mockResolvedValue({ userId: "user_player_a" });

    await expect(loadAnnouncementNavigationState()).resolves.toEqual({
      ok: true,
      viewer: "authenticated",
      latest,
      unread: true,
    });
    expect(loadAuthenticatedStateMock).toHaveBeenCalledWith("user_player_a");
    expect(loadLatestMock).not.toHaveBeenCalled();
  });

  it("fails closed when identity or authoritative state cannot be loaded", async () => {
    authMock.mockRejectedValueOnce(new Error("identity unavailable"));
    await expect(loadAnnouncementNavigationState()).resolves.toEqual({
      ok: false,
    });

    authMock.mockResolvedValueOnce({ userId: "user_player_a" });
    loadAuthenticatedStateMock.mockResolvedValueOnce(null);
    await expect(loadAnnouncementNavigationState()).resolves.toEqual({
      ok: false,
    });

    authMock.mockResolvedValueOnce({ userId: null });
    loadLatestMock.mockResolvedValueOnce(undefined);
    await expect(loadAnnouncementNavigationState()).resolves.toEqual({
      ok: false,
    });
  });

  it("rejects invalid or signed-out direct seen mutations", async () => {
    await expect(markAnnouncementSeen("not-a-uuid")).resolves.toEqual({
      ok: false,
    });
    expect(authMock).not.toHaveBeenCalled();

    await expect(markAnnouncementSeen(latest.id)).resolves.toEqual({
      ok: false,
    });
    expect(markSeenMock).not.toHaveBeenCalled();
  });

  it("marks only the authenticated caller's exact announcement", async () => {
    authMock.mockResolvedValue({ userId: "user_player_b" });

    await expect(markAnnouncementSeen(latest.id)).resolves.toEqual({
      ok: true,
    });
    expect(markSeenMock).toHaveBeenCalledWith("user_player_b", latest.id);

    markSeenMock.mockResolvedValueOnce(false);
    await expect(markAnnouncementSeen(latest.id)).resolves.toEqual({
      ok: false,
    });
  });
});
