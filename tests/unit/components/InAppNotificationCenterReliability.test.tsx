// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InAppNotification } from "@/lib/notifications";
import type { DashboardNotification } from "@/lib/player-dashboard";

const pushMock = vi.hoisted(() => vi.fn());
const refreshMock = vi.hoisted(() => vi.fn());
const deleteSelectedMock = vi.hoisted(() => vi.fn());
const markAllMock = vi.hoisted(() => vi.fn());
const markReadMock = vi.hoisted(() => vi.fn());
const markSelectedMock = vi.hoisted(() => vi.fn());
const requestBadgeReconciliationMock = vi.hoisted(() => vi.fn());
const closeDisplayedNotificationsMock = vi.hoisted(() => vi.fn());
const dismissDashboardNotificationsMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));
vi.mock("@/app/dashboard/actions", () => ({
  dismissDashboardNotifications: dismissDashboardNotificationsMock,
}));
vi.mock("@/app/notifications/actions", () => ({
  deleteSelectedInAppNotifications: deleteSelectedMock,
  markAllInAppNotificationsRead: markAllMock,
  markInAppNotificationRead: markReadMock,
  markVisibleInAppNotificationsRead: markSelectedMock,
}));
vi.mock("@/components/NotificationPermissionControl", () => ({
  default: () => <div data-testid="notification-permission-control" />,
}));
vi.mock("@/lib/app-badge", () => ({
  closeDisplayedIronCladNotifications: closeDisplayedNotificationsMock,
  requestNotificationBadgeReconciliation: requestBadgeReconciliationMock,
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

function projectedMatchAction(): DashboardNotification {
  return {
    id: "projected-match-action",
    source: "report_group",
    sourceId: "44444444-4444-4444-8444-444444444444",
    reportGroupId: "44444444-4444-4444-8444-444444444444",
    resultType: "normal",
    noShowRegistrationId: null,
    noShowStatus: null,
    submissionNumber: 1,
    gameNumber: 1,
    tournamentName: "Reliability Cup",
    roundName: "Round 1",
    matchNumber: 1,
    opponentName: "Opponent",
    reportedWinner: "Player",
    reportedLoser: "Opponent",
    reportedScore: "1-0",
    status: "pending_confirmation",
    reviewNotes: null,
    submittedAt: "2026-08-20T00:00:00.000Z",
    reviewedAt: null,
    submittedByViewer: false,
    confirmationDeadlineAt: "2026-08-21T00:00:00.000Z",
    finalizedAt: null,
    canConfirm: true,
    canDispute: true,
  };
}

describe("notification-center mutation reliability", () => {
  beforeEach(() => {
    deleteSelectedMock.mockResolvedValue({ ok: true, unreadCount: 0 });
    markAllMock.mockResolvedValue({ ok: true, unreadCount: 0 });
    markReadMock.mockResolvedValue({ ok: true, unreadCount: 2 });
    markSelectedMock.mockResolvedValue({ ok: true, unreadCount: 0 });
    closeDisplayedNotificationsMock.mockResolvedValue(undefined);
    dismissDashboardNotificationsMock.mockResolvedValue({ status: "success" });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("uses the authoritative post-mutation unread count on success", async () => {
    renderPlayerCenter(notification());

    fireEvent.click(
      screen.getByRole("button", { name: /Registration Rejected/i })
    );

    await waitFor(() => {
      expect(screen.getByText("4 total · 2 unread")).toBeInTheDocument();
      expect(requestBadgeReconciliationMock).toHaveBeenCalledOnce();
    });
    expect(screen.queryByText("New")).not.toBeInTheDocument();
    expect(closeDisplayedNotificationsMock).toHaveBeenCalledWith({
      notificationIds: ["notification-reliability"],
    });
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
    expect(requestBadgeReconciliationMock).not.toHaveBeenCalled();
    expect(closeDisplayedNotificationsMock).not.toHaveBeenCalled();
    expect(refreshMock).toHaveBeenCalled();
  });

  it("reconciles badge truth after marking selected durable notifications read", async () => {
    renderPlayerCenter(notification());
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /Select Registration Rejected/i,
      })
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Mark selected read" })
    );

    await waitFor(() => expect(markSelectedMock).toHaveBeenCalledOnce());
    expect(requestBadgeReconciliationMock).toHaveBeenCalledOnce();
    expect(closeDisplayedNotificationsMock).toHaveBeenCalledWith({
      notificationIds: ["notification-reliability"],
    });
  });

  it("reconciles badge truth after marking all durable notifications read", async () => {
    renderPlayerCenter(notification());

    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));

    await waitFor(() => expect(markAllMock).toHaveBeenCalledOnce());
    expect(requestBadgeReconciliationMock).toHaveBeenCalledOnce();
    expect(closeDisplayedNotificationsMock).toHaveBeenCalledWith({
      scope: "player",
    });
  });

  it("reconciles badge truth after hiding a selected durable notification", async () => {
    renderPlayerCenter(notification());
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /Select Registration Rejected/i,
      })
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Delete selected" })
    );

    await waitFor(() => expect(deleteSelectedMock).toHaveBeenCalledOnce());
    expect(requestBadgeReconciliationMock).toHaveBeenCalledOnce();
    expect(closeDisplayedNotificationsMock).toHaveBeenCalledWith({
      notificationIds: ["notification-reliability"],
    });
  });

  it("reconciles committed durable truth if a projected dismissal later fails", async () => {
    dismissDashboardNotificationsMock.mockResolvedValue({ status: "error" });
    render(
      <InAppNotificationCenter
        scope="player"
        title="Notifications"
        description="Recent updates."
        emptyMessage="No updates."
        notifications={[notification()]}
        totalCount={1}
        unreadCount={1}
        matchNotifications={[projectedMatchAction()]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Notifications/i }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Select Registration Rejected/i })
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /select match result confirmation notification/i,
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete selected" }));

    await waitFor(() => {
      expect(dismissDashboardNotificationsMock).toHaveBeenCalledOnce();
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Your notifications could not be updated."
      );
    });
    expect(requestBadgeReconciliationMock).toHaveBeenCalledOnce();
    expect(closeDisplayedNotificationsMock).toHaveBeenCalledWith({
      notificationIds: ["notification-reliability"],
    });
  });

  it("does not request badge reconciliation from a failed initial load", async () => {
    render(
      <InAppNotificationCenter
        scope="player"
        title="Notifications"
        description="Recent updates."
        emptyMessage="No updates."
        notifications={[]}
        totalCount={0}
        unreadCount={0}
        error="Notifications could not be loaded."
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Notifications/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Notifications could not be loaded.")
      ).toBeInTheDocument();
    });
    expect(requestBadgeReconciliationMock).not.toHaveBeenCalled();
  });

  it("does not use projected Match actions as badge truth", () => {
    render(
      <InAppNotificationCenter
        scope="player"
        title="Notifications"
        description="Recent updates."
        emptyMessage="No updates."
        notifications={[notification()]}
        totalCount={4}
        unreadCount={3}
        matchNotifications={[projectedMatchAction()]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Notifications/i }));

    expect(screen.getByText("5 total · 4 unread")).toBeInTheDocument();
    expect(requestBadgeReconciliationMock).not.toHaveBeenCalled();
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
