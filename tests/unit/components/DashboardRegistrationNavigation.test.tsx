// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
import DashboardRegistrationNavigation from "@/components/dashboard/DashboardRegistrationNavigation";
import { resolveDashboardRegistrationHref } from "@/components/dashboard/registration-navigation";

const registrationId = "22222222-2222-4222-8222-222222222222";
const href = `/dashboard#registration-${registrationId}`;
const notification: InAppNotification = {
  id: "55555555-5555-4555-8555-555555555555",
  recipientRole: "player",
  type: "registration.waitlist_offer",
  title: "Registration update",
  message: "Review the registration linked to this update.",
  actorDisplayName: null,
  tournamentId: "11111111-1111-4111-8111-111111111111",
  tournamentTitle: "IronClad Cup",
  registrationId,
  matchId: null,
  reportGroupId: null,
  deadlineAt: null,
  readAt: "2026-08-20T01:00:00.000Z",
  createdAt: "2026-08-20T00:00:00.000Z",
  href,
};

describe("Dashboard registration link compatibility", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/dashboard");
    // App Router pushState does not emit a hashchange event.
    push.mockImplementation((url: string) => window.history.pushState(null, "", url));
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    window.history.replaceState(null, "", "/");
  });

  it("removes an initial historical hash while preserving the route, query and browser history state", async () => {
    const state = { nextNavigation: "retained" };
    window.history.replaceState(state, "", `/dashboard?locale=it#registration-${registrationId}`);
    const dispatch = vi.spyOn(window, "dispatchEvent");
    await renderDashboard(false);

    expect(window.location.pathname).toBe("/dashboard");
    expect(window.location.search).toBe("?locale=it");
    expect(window.location.hash).toBe("");
    expect(window.history.state).toEqual(state);
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(document.getElementById(`registration-${registrationId}`)).toBeNull();
    expect(screen.queryByText(/Registration Archive/)).not.toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("keeps an initial current registration hash and scrolls its exact visible card", async () => {
    window.history.replaceState(null, "", href);
    const dispatch = vi.spyOn(window, "dispatchEvent");
    await renderDashboard(true);

    const current = screen.getByRole("article");
    expect(current).toBeVisible();
    expect(window.location.hash).toBe(`#registration-${registrationId}`);
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: "start" });
    expect(vi.mocked(HTMLElement.prototype.scrollIntoView).mock.contexts).toEqual([current]);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("normalizes later stale hashes and preserves later current hashes without archive events", async () => {
    await renderDashboard(true);
    const dispatch = vi.spyOn(window, "dispatchEvent");
    window.history.pushState(null, "", "/dashboard?locale=en#registration-removed");
    fireEvent(window, new HashChangeEvent("hashchange"));
    expect(window.location.search).toBe("?locale=en");
    expect(window.location.hash).toBe("");
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();

    window.history.pushState(null, "", href);
    fireEvent(window, new HashChangeEvent("hashchange"));
    expect(window.location.hash).toBe(`#registration-${registrationId}`);
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledOnce();
    expect(dispatch.mock.calls.some(([event]) => event instanceof CustomEvent)).toBe(false);
  });

  it.each([false, true])("handles repeated notification clicks safely with current card present=%s", async (current) => {
    await renderDashboard(current);
    const dispatch = vi.spyOn(window, "dispatchEvent");
    const expectedHref = current ? href : "/dashboard";
    for (let click = 1; click <= 2; click += 1) {
      const notificationButton = screen.getByRole("button", { name: /Registration update/ });
      fireEvent.click(notificationButton);
      await waitFor(() => expect(push).toHaveBeenCalledTimes(click));
      // A routed transition can commit after push; real users cannot click the
      // disabled notification again until that commit enables it.
      await waitFor(() => expect(notificationButton).toBeEnabled());
      expect(push).toHaveBeenLastCalledWith(expectedHref);
      expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(current ? click : 0);
    }
    expect(markRead).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(window.location.hash).toBe(current ? `#registration-${registrationId}` : "");
  });

  it("preserves queries when resolving missing or malformed registration hashes", async () => {
    await renderDashboard(false);
    expect(resolveDashboardRegistrationHref(`/dashboard?source=notification#registration-${registrationId}`))
      .toEqual({ href: "/dashboard?source=notification", target: null });
    expect(resolveDashboardRegistrationHref("/dashboard?source=email#registration-%E0%A4%A"))
      .toEqual({ href: "/dashboard?source=email", target: null });
  });

  it("leaves external and unrelated destinations untouched", async () => {
    await renderDashboard(true);
    for (const destination of [
      `https://example.test${href}`,
      "/tournaments#registration-other",
      "/dashboard#division-invitations",
      "/dashboard/badges",
      "/admin/registrations?filter=all&selected=registration-id",
      "https://[invalid",
    ]) {
      expect(resolveDashboardRegistrationHref(destination)).toEqual({ href: destination, target: null });
    }
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("does not classify registration links until the actual Dashboard is mounted", () => {
    expect(resolveDashboardRegistrationHref(href)).toEqual({ href, target: null });
    render(<main data-dashboard-command-centre />);
    window.history.replaceState(null, "", "/tournaments");
    expect(resolveDashboardRegistrationHref(href)).toEqual({ href, target: null });
  });

  it("accepts only current cards inside the Dashboard, never arbitrary matching IDs", () => {
    render(<>
      <article id={`registration-${registrationId}`} data-registration-presentation="current" />
      <main data-dashboard-command-centre>
        <article id="registration-historical" data-registration-presentation="historical" />
      </main>
    </>);
    expect(resolveDashboardRegistrationHref(href)).toEqual({ href: "/dashboard", target: null });
    expect(resolveDashboardRegistrationHref("/dashboard#registration-historical"))
      .toEqual({ href: "/dashboard", target: null });
  });
});

async function renderDashboard(current: boolean) {
  render(<main data-dashboard-command-centre>
    <DashboardRegistrationNavigation />
    <InAppNotificationCenter
      scope="player" presentation="dashboard" title="Updates"
      description="Recent updates" emptyMessage="No updates"
      notifications={[notification]} totalCount={1} unreadCount={0}
    />
    {current && <article id={`registration-${registrationId}`} data-registration-presentation="current">Current registration</article>}
  </main>);
  await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 10)); });
}
