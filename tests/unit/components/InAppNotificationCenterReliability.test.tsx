// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InAppNotification } from "@/lib/notifications";

const pushMock = vi.hoisted(() => vi.fn());
const refreshMock = vi.hoisted(() => vi.fn());
const deleteSelectedMock = vi.hoisted(() => vi.fn());
const markAllMock = vi.hoisted(() => vi.fn());
const markReadMock = vi.hoisted(() => vi.fn());
const markSelectedMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));
vi.mock("@/app/dashboard/actions", () => ({
  dismissDashboardNotifications: vi.fn(),
}));
vi.mock("@/app/notifications/actions", () => ({
  deleteSelectedInAppNotifications: deleteSelectedMock,
  markAllInAppNotificationsRead: markAllMock,
  markInAppNotificationRead: markReadMock,
  markVisibleInAppNotificationsRead: markSelectedMock,
}));

import InAppNotificationCenter from "@/components/InAppNotificationCenter";

function notification(
  overrides: Partial<InAppNotification> = {}
): InAppNotification {
  return {
    id: "notification-reliability",
    recipientRole: "player",
    type: "registration.rejected",
    title: "Registration Rejected",
    message: "Your registration was rejected.",
    actorDisplayName: "IronClad Admin",
    tournamentId: "11111111-1111-4111-8111-111111111111",
    tournamentTitle: "Reliability Cup",
    registrationId: "22222222-2222-4222-8222-222222222222",
    matchId: null,
    reportGroupId: null,
    deadlineAt: null,
    readAt: null,
    createdAt: "2026-08-20T00:00:00.000Z",
    href: "/dashboard",
    ...overrides,
  };
}

function renderPlayerCenter(item: InAppNotification) {
  const rendered = render(
    <InAppNotificationCenter
      scope="player"
      title="Notifications"
      description="Recent updates."
      emptyMessage="No updates."
      notifications={[item]}
      totalCount={4}
      unreadCount={3}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: /Notifications/i }));
  return rendered;
}

describe("notification-center mutation reliability", () => {
  beforeEach(() => {
    deleteSelectedMock.mockResolvedValue({ ok: true, unreadCount: 0 });
    markAllMock.mockResolvedValue({ ok: true, unreadCount: 0 });
    markReadMock.mockResolvedValue({ ok: true, unreadCount: 2 });
    markSelectedMock.mockResolvedValue({ ok: true, unreadCount: 0 });
  });

  afterEach(() => {
    cleanup();
  });

  it("uses the authoritative post-mutation unread count on success", async () => {
    renderPlayerCenter(notification());

    fireEvent.click(
      screen.getByRole("button", { name: /Registration Rejected/i })
    );

    await waitFor(() => {
      expect(screen.getByText("4 total · 2 unread")).toBeInTheDocument();
    });
    expect(screen.queryByText("New")).not.toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalled();
  });

  it("preserves unread UI state and shows sanitized feedback on failure", async () => {
    markReadMock.mockResolvedValue({ ok: false, code: "unavailable" });
    renderPlayerCenter(notification());

    fireEvent.click(
      screen.getByRole("button", { name: /Registration Rejected/i })
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Your notifications could not be updated."
      );
    });
    expect(screen.getByText("4 total · 3 unread")).toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalled();
  });

  it("continues to an approved Match destination when mark-read fails", async () => {
    markReadMock.mockResolvedValue({ ok: false, code: "unavailable" });
    const href =
      "/tournaments?tournament=11111111-1111-4111-8111-111111111111&tab=brackets&match=33333333-3333-4333-8333-333333333333";
    renderPlayerCenter(
      notification({
        type: "match.confirmation_required",
        title: "Match result needs confirmation",
        message: "Confirm or dispute the submitted result.",
        matchId: "33333333-3333-4333-8333-333333333333",
        reportGroupId: "44444444-4444-4444-8444-444444444444",
        registrationId: null,
        href,
      })
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /Match result needs confirmation/i,
      })
    );

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(href);
    });
    expect(markReadMock).toHaveBeenCalledOnce();
  });
});
