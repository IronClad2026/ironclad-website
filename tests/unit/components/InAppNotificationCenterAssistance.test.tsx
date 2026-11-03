// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InAppNotification } from "@/lib/notifications";

const NOTIFICATION_ID = "11111111-1111-4111-8111-111111111111";
const TOURNAMENT_ID = "22222222-2222-4222-8222-222222222222";
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const CONVERSATION_HREF = `/assistance/${REQUEST_ID}?tournament=${TOURNAMENT_ID}`;
const TITLE = "Admin reply to private assistance";
const ERROR = "Your notifications could not be updated.";

const pushMock = vi.hoisted(() => vi.fn());
const refreshMock = vi.hoisted(() => vi.fn());
const markReadMock = vi.hoisted(() => vi.fn());
const closeDisplayedNotificationsMock = vi.hoisted(() => vi.fn());
const requestBadgeReconciliationMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
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
vi.mock("@/components/NotificationPermissionControl", () => ({
  default: () => <div data-testid="notification-permission-control" />,
}));
vi.mock("@/lib/app-badge", () => ({
  closeDisplayedIronCladNotifications: closeDisplayedNotificationsMock,
  requestNotificationBadgeReconciliation: requestBadgeReconciliationMock,
}));

import InAppNotificationCenter from "@/components/InAppNotificationCenter";

function renderNotification(expanded: boolean, overrides: Partial<InAppNotification> = {}) {
  const notification: InAppNotification = {
    id: NOTIFICATION_ID,
    recipientRole: "player",
    type: "assistance.admin_replied",
    title: TITLE,
    message: "An IronClad admin replied. Open your private conversation.",
    actorDisplayName: null,
    tournamentId: TOURNAMENT_ID,
    tournamentTitle: "Synthetic assistance tournament A",
    registrationId: null,
    matchId: "44444444-4444-4444-8444-444444444444",
    reportGroupId: null,
    deadlineAt: null,
    readAt: null,
    createdAt: "2026-11-03T00:00:00.000Z",
    href: CONVERSATION_HREF,
    ...overrides,
  };

  render(
    <InAppNotificationCenter
      scope="player"
      presentation="dashboard"
      title="Updates"
      description="Recent updates."
      emptyMessage="No updates."
      notifications={[notification]}
      totalCount={1}
      unreadCount={notification.readAt ? 0 : 1}
    />
  );
  if (expanded) fireEvent.click(screen.getByRole("button", { name: /Updates/i }));
  return screen.getByRole("button", { name: new RegExp(TITLE, "i") });
}

describe.each([
  { presentation: "collapsed preview", expanded: false },
  { presentation: "expanded list", expanded: true },
])("private assistance navigation in the $presentation", ({ expanded }) => {
  beforeEach(() => {
    markReadMock.mockResolvedValue({ ok: true, unreadCount: 0 });
    closeDisplayedNotificationsMock.mockResolvedValue({
      status: "closed", enumerated: 1, matched: 1, closed: 1, remaining: 0,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("marks an unread reply read once and opens its exact private conversation", async () => {
    fireEvent.click(renderNotification(expanded));

    await waitFor(() => {
      expect(markReadMock).toHaveBeenCalledOnce();
      expect(pushMock).toHaveBeenCalledExactlyOnceWith(CONVERSATION_HREF);
    });
    const form = markReadMock.mock.calls[0][0] as FormData;
    expect(form.get("scope")).toBe("player");
    expect(form.getAll("notificationId")).toEqual([NOTIFICATION_ID]);
    expect(closeDisplayedNotificationsMock).toHaveBeenCalledWith({
      notificationIds: [NOTIFICATION_ID], scope: "player",
    });
    expect(screen.getByText("1 total · 0 unread")).toBeInTheDocument();
  });

  it("opens an already-read reply without another read mutation", async () => {
    fireEvent.click(renderNotification(expanded, { readAt: "2026-11-03T00:01:00.000Z" }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledExactlyOnceWith(CONVERSATION_HREF));
    expect(markReadMock).not.toHaveBeenCalled();
    expect(closeDisplayedNotificationsMock).not.toHaveBeenCalled();
  });

  it.each([null, ""])("keeps a reply with missing link %s visible without changing or navigating", async (href) => {
    fireEvent.click(renderNotification(expanded, { href }));

    expect(await screen.findByRole("alert")).toHaveTextContent(ERROR);
    expect(screen.getByText(TITLE)).toBeVisible();
    expect(screen.getByText("1 total · 1 unread")).toBeInTheDocument();
    expect(markReadMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
    expect(closeDisplayedNotificationsMock).not.toHaveBeenCalled();
  });

  it("preserves unread state after a failed read while still opening the exact conversation", async () => {
    markReadMock.mockResolvedValue({ ok: false, code: "unavailable" });
    fireEvent.click(renderNotification(expanded));

    await waitFor(() => expect(pushMock).toHaveBeenCalledExactlyOnceWith(CONVERSATION_HREF));
    expect(markReadMock).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert")).toHaveTextContent(ERROR);
    expect(screen.getByText("1 total · 1 unread")).toBeInTheDocument();
    expect(closeDisplayedNotificationsMock).not.toHaveBeenCalled();
    expect(requestBadgeReconciliationMock).not.toHaveBeenCalled();
  });
});
