// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InAppNotification } from "@/lib/notifications";

const push = vi.hoisted(() => vi.fn());
const markRead = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));
vi.mock("@/app/dashboard/actions", () => ({ dismissDashboardNotifications: vi.fn() }));
vi.mock("@/app/notifications/actions", () => ({
  markInAppNotificationRead: markRead,
  markAllInAppNotificationsRead: vi.fn(),
  markVisibleInAppNotificationsRead: vi.fn(),
  deleteSelectedInAppNotifications: vi.fn(),
}));
vi.mock("@/components/NotificationPermissionControl", () => ({ default: () => null }));
vi.mock("@/lib/app-badge", () => ({
  closeDisplayedIronCladNotifications: vi.fn(),
  requestNotificationBadgeReconciliation: vi.fn(),
}));

import InAppNotificationCenter from "@/components/InAppNotificationCenter";
import DashboardPreviousRegistrations from "@/components/dashboard/DashboardPreviousRegistrations";
import { notifyDashboardRegistrationNavigation } from "@/components/dashboard/registration-navigation";

const registrationId = "22222222-2222-4222-8222-222222222222";
const href = `/dashboard#registration-${registrationId}`;
const notification: InAppNotification = {
  id: "55555555-5555-4555-8555-555555555555",
  recipientRole: "player",
  type: "registration.waitlist_offer",
  title: "Previous waitlist offer",
  message: "Review the registration linked to this update.",
  actorDisplayName: null,
  tournamentId: "11111111-1111-4111-8111-111111111111",
  tournamentTitle: "Historical Cup",
  registrationId,
  matchId: null,
  reportGroupId: null,
  deadlineAt: null,
  readAt: "2026-08-20T01:00:00.000Z",
  createdAt: "2026-08-20T00:00:00.000Z",
  href,
};

describe("Standalone previous registration notification navigation", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/dashboard");
    // App Router changes history without dispatching a native hashchange.
    push.mockImplementation((url: string) => window.history.pushState(null, "", url));
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    window.history.replaceState(null, "", "/");
  });

  it("reveals an exact previous registration from the real notification click path", async () => {
    renderDashboard();
    expect(screen.getByText("Historical registration")).not.toBeVisible();
    expect(markRead).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Previous waitlist offer/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(href));
    expect(screen.getByText("Historical registration")).toBeVisible();
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    expect(markRead).not.toHaveBeenCalled();
  });

  it("reopens the same registration after the disclosure is closed", async () => {
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: /Previous waitlist offer/ }));
    await waitFor(() => expect(screen.getByText("Historical registration")).toBeVisible());
    fireEvent.click(screen.getByText("Previous registrations"));
    expect(screen.getByText("Historical registration")).not.toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Previous waitlist offer/ }));
    await waitFor(() => expect(screen.getByText("Historical registration")).toBeVisible());
    expect(markRead).not.toHaveBeenCalled();
  });

  it("ignores external, unrelated and unknown registration destinations", () => {
    renderDashboard();
    for (const destination of [
      `https://example.test${href}`,
      "/tournaments#registration-other",
      "/dashboard#division-invitations",
      "/dashboard#registration-unknown",
    ]) {
      notifyDashboardRegistrationNavigation(destination);
      expect(screen.getByText("Historical registration")).not.toBeVisible();
    }
    expect(markRead).not.toHaveBeenCalled();
  });
});

function renderDashboard() {
  render(<>
    <InAppNotificationCenter
      scope="player" presentation="dashboard" title="Updates"
      description="Recent updates" emptyMessage="No updates"
      notifications={[notification]} totalCount={1} unreadCount={0}
    />
    <DashboardPreviousRegistrations title="Previous registrations" count={1}>
      <article id={`registration-${registrationId}`}>Historical registration</article>
    </DashboardPreviousRegistrations>
  </>);
}
