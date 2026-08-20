// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InAppNotification } from "@/lib/notifications";

const pushMock = vi.hoisted(() => vi.fn());
const markReadMock = vi.hoisted(() =>
  vi.fn(async () => ({ ok: true, unreadCount: 0 }))
);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}));
vi.mock("@/app/dashboard/actions", () => ({
  dismissDashboardNotifications: vi.fn(),
}));
vi.mock("@/app/notifications/actions", () => ({
  deleteSelectedInAppNotifications: vi.fn(),
  markAllInAppNotificationsRead: vi.fn(),
  markInAppNotificationRead: markReadMock,
  markVisibleInAppNotificationsRead: vi.fn(),
}));

import InAppNotificationCenter from "@/components/InAppNotificationCenter";

afterEach(() => {
  cleanup();
  pushMock.mockReset();
  markReadMock.mockClear();
});

describe("poll notification navigation", () => {
  it.each([
    {
      type: "poll.published",
      href: "/dashboard#community-polls",
      title: "Community Poll Open",
    },
    {
      type: "poll.decision_published",
      href: "/tournaments?tournament=tournament-id&tab=decisions&poll=poll-id",
      title: "Tournament Decision Published",
    },
  ])("marks $type read and opens its exact safe context", async ({ type, href, title }) => {
    const notification: InAppNotification = {
      id: "notification-id",
      recipientRole: "player",
      type,
      title,
      message: "A Poll update is ready.",
      actorDisplayName: null,
      tournamentId: null,
      tournamentTitle: null,
      registrationId: null,
      matchId: null,
      reportGroupId: null,
      deadlineAt: null,
      readAt: null,
      createdAt: "2026-08-18T00:00:00.000Z",
      href,
    };

    render(
      <InAppNotificationCenter
        scope="player"
        title="Notifications"
        description="Recent updates."
        emptyMessage="No updates."
        notifications={[notification]}
        totalCount={1}
        unreadCount={1}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Notifications/i }));
    fireEvent.click(screen.getByRole("button", { name: new RegExp(title, "i") }));

    await waitFor(() => {
      expect(markReadMock).toHaveBeenCalledOnce();
      expect(pushMock).toHaveBeenCalledWith(href);
    });
  });
});
