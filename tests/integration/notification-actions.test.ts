import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const deleteNotificationsMock = vi.hoisted(() => vi.fn());
const loadUnreadNotificationCountMock = vi.hoisted(() => vi.fn());
const markAllNotificationsReadMock = vi.hoisted(() => vi.fn());
const markNotificationReadMock = vi.hoisted(() => vi.fn());
const markNotificationsReadMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/notifications", () => ({
  deleteNotifications: deleteNotificationsMock,
  loadUnreadNotificationCount: loadUnreadNotificationCountMock,
  markAllNotificationsRead: markAllNotificationsReadMock,
  markNotificationRead: markNotificationReadMock,
  markNotificationsRead: markNotificationsReadMock,
}));

import {
  deleteSelectedInAppNotifications,
  markAllInAppNotificationsRead,
  markInAppNotificationRead,
  markVisibleInAppNotificationsRead,
} from "@/app/notifications/actions";

const PLAYER_ID = "user_notification_player";

function formData(
  scope: "player" | "admin",
  notificationIds: string[] = []
) {
  const data = new FormData();
  data.set("scope", scope);
  for (const notificationId of notificationIds) {
    data.append("notificationId", notificationId);
  }
  return data;
}

describe("notification Server Action mutation results", () => {
  beforeEach(() => {
    authMock.mockResolvedValue({
      userId: PLAYER_ID,
      sessionClaims: { metadata: { role: "player" } },
    });
    deleteNotificationsMock.mockResolvedValue(true);
    loadUnreadNotificationCountMock.mockResolvedValue(3);
    markAllNotificationsReadMock.mockResolvedValue(true);
    markNotificationReadMock.mockResolvedValue(true);
    markNotificationsReadMock.mockResolvedValue(true);
  });

  it.each([
    {
      name: "mark one",
      run: () =>
        markInAppNotificationRead(
          formData("player", ["notification-player-one"])
        ),
      mutation: markNotificationReadMock,
    },
    {
      name: "mark selected",
      run: () =>
        markVisibleInAppNotificationsRead(
          formData("player", ["notification-player-one"])
        ),
      mutation: markNotificationsReadMock,
    },
    {
      name: "mark all",
      run: () => markAllInAppNotificationsRead(formData("player")),
      mutation: markAllNotificationsReadMock,
    },
    {
      name: "hide or delete selected",
      run: () =>
        deleteSelectedInAppNotifications(
          formData("player", ["notification-player-one"])
        ),
      mutation: deleteNotificationsMock,
    },
  ])("returns the authoritative post-$name Player count", async ({ run, mutation }) => {
    await expect(run()).resolves.toEqual({ ok: true, unreadCount: 3 });

    expect(mutation).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "player",
        clerkUserId: PLAYER_ID,
      })
    );
    expect(loadUnreadNotificationCountMock).toHaveBeenCalledWith({
      scope: "player",
      clerkUserId: PLAYER_ID,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard");
  });

  it("derives Player ownership from Clerk instead of browser fields", async () => {
    const data = formData("player", ["notification-owned-by-someone-else"]);
    data.set("clerkUserId", "forged-user");
    data.set("role", "admin");

    await markInAppNotificationRead(data);

    expect(markNotificationReadMock).toHaveBeenCalledWith({
      notificationId: "notification-owned-by-someone-else",
      scope: "player",
      clerkUserId: PLAYER_ID,
    });
  });

  it("returns the authoritative global Admin count after server-side authorization", async () => {
    authMock.mockResolvedValue({
      userId: "user_notification_admin",
      sessionClaims: { metadata: { role: "admin" } },
    });
    loadUnreadNotificationCountMock.mockResolvedValue(11);

    await expect(
      markAllInAppNotificationsRead(formData("admin"))
    ).resolves.toEqual({ ok: true, unreadCount: 11 });

    expect(markAllNotificationsReadMock).toHaveBeenCalledWith({
      scope: "admin",
      clerkUserId: null,
    });
    expect(loadUnreadNotificationCountMock).toHaveBeenCalledWith({
      scope: "admin",
      clerkUserId: null,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin");
  });

  it("denies a browser-selected Admin scope to a non-Admin", async () => {
    await expect(
      markAllInAppNotificationsRead(formData("admin"))
    ).resolves.toEqual({ ok: false, code: "unavailable" });

    expect(markAllNotificationsReadMock).not.toHaveBeenCalled();
    expect(loadUnreadNotificationCountMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("does not report success when the trusted mutation fails", async () => {
    markNotificationReadMock.mockResolvedValue(false);

    await expect(
      markInAppNotificationRead(
        formData("player", ["notification-player-one"])
      )
    ).resolves.toEqual({ ok: false, code: "unavailable" });

    expect(loadUnreadNotificationCountMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("sanitizes a post-mutation count failure without inventing zero", async () => {
    loadUnreadNotificationCountMock.mockResolvedValue(null);

    await expect(
      markInAppNotificationRead(
        formData("player", ["notification-player-one"])
      )
    ).resolves.toEqual({ ok: false, code: "unavailable" });

    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard");
  });

  it("denies missing authentication without calling the database", async () => {
    authMock.mockResolvedValue({ userId: null, sessionClaims: null });

    await expect(
      markInAppNotificationRead(
        formData("player", ["notification-player-one"])
      )
    ).resolves.toEqual({ ok: false, code: "unavailable" });

    expect(markNotificationReadMock).not.toHaveBeenCalled();
  });
});
