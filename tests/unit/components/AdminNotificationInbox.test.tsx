// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminNotificationInbox from "@/components/admin/tournaments/AdminNotificationInbox";
import type { AdminInboxData, AdminInboxScope } from "@/lib/admin-notification-inbox";
import type { InAppNotification } from "@/lib/notifications";

const actions = vi.hoisted(() => ({ read: vi.fn(), readAll: vi.fn(), remove: vi.fn() }));
vi.mock("@/app/admin/notifications/actions", () => ({
  markSelectedAdminNotificationsRead: actions.read,
  markAllAdminNotificationsRead: actions.readAll,
  dismissSelectedAdminNotifications: actions.remove,
}));

const TOURNAMENT_A = "11111111-1111-4111-8111-111111111111";
const TOURNAMENT_B = "22222222-2222-4222-8222-222222222222";

function notification(id = "notice-1"): InAppNotification {
  return {
    id, recipientRole: "admin", type: "registration.submitted", title: `Notification ${id}`,
    message: "Original registration event", actorDisplayName: null, tournamentId: TOURNAMENT_A,
    tournamentTitle: "Tournament A", registrationId: null, matchId: null, reportGroupId: null,
    deadlineAt: null, readAt: null, createdAt: "2026-11-01T10:00:00.000Z", href: "/admin/tournaments/original-record",
  };
}

function data(overrides: Partial<AdminInboxData> = {}): AdminInboxData {
  return {
    scope: { kind: "tournament", tournamentId: TOURNAMENT_A },
    notifications: [notification(), notification("notice-2")], totalCount: 30, unreadCount: 12,
    filteredCount: 30, page: 2, pageCount: 2, filter: "all", selectedNotification: notification(),
    ...overrides,
  };
}

function renderInbox(value = data()) {
  return render(<AdminNotificationInbox data={value} baseHref="/admin/tournaments/a?section=notifications" title="Tournament A notifications" />);
}

beforeEach(() => {
  actions.read.mockResolvedValue({ ok: true, data: data({ unreadCount: 10 }) });
  actions.readAll.mockResolvedValue({ ok: true, data: data({ unreadCount: 0 }) });
  actions.remove.mockResolvedValue({ ok: true, data: data({ notifications: [], selectedNotification: null, totalCount: 28 }) });
});
afterEach(cleanup);

describe("shared scoped admin inbox", () => {
  it("labels team behavior and gives explicit page, filter and exact related-record links", () => {
    renderInbox();
    expect(screen.getByText(/Reading or removing a notification affects all administrators/)).toBeInTheDocument();
    expect(screen.getByText(/does not resolve an assistance request/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Unread notifications" })).toHaveAttribute("href", "/admin/tournaments/a?section=notifications&filter=unread&page=1");
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute("href", "/admin/tournaments/a?section=notifications&filter=all&page=1");
    expect(screen.getByRole("link", { name: "Open related record" })).toHaveAttribute("href", "/admin/tournaments/original-record");
  });

  it("sends only checked page IDs and complete scope to read-selected and updates authoritative counts locally", async () => {
    renderInbox();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all on this page" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark selected read" }));
    await waitFor(() => expect(actions.read).toHaveBeenCalledTimes(1));
    const form = actions.read.mock.calls[0][0] as FormData;
    expect(form.get("kind")).toBe("tournament");
    expect(form.get("tournamentId")).toBe(TOURNAMENT_A);
    expect(form.get("page")).toBe("2");
    expect(form.get("selected")).toBe("notice-1");
    expect(form.getAll("notificationId")).toEqual(["notice-1", "notice-2"]);
    await waitFor(() => expect(screen.getByText("10")).toBeInTheDocument());
    expect(screen.getByRole("checkbox", { name: "Select Notification notice-1" })).not.toBeChecked();
  });

  it("marks all in the tournament even when viewing one unread page", async () => {
    renderInbox(data({ filter: "unread" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark all in this tournament read" }));
    await waitFor(() => expect(actions.readAll).toHaveBeenCalledTimes(1));
    const form = actions.readAll.mock.calls[0][0] as FormData;
    expect(form.get("tournamentId")).toBe(TOURNAMENT_A);
    expect(form.get("filter")).toBe("unread");
    expect(form.getAll("notificationId")).toEqual([]);
  });

  it("supports independent one-read and one-remove without selecting rows", async () => {
    renderInbox();
    fireEvent.click(screen.getByRole("button", { name: "Mark this notification read" }));
    await waitFor(() => expect(actions.read).toHaveBeenCalledTimes(1));
    expect((actions.read.mock.calls[0][0] as FormData).getAll("notificationId")).toEqual(["notice-1"]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Remove this notification from inbox" })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Remove this notification from inbox" }));
    await waitFor(() => expect(actions.remove).toHaveBeenCalledTimes(1));
    expect((actions.remove.mock.calls[0][0] as FormData).getAll("notificationId")).toEqual(["notice-1"]);
    await waitFor(() => expect(screen.queryByRole("article", { name: "Notification details" })).not.toBeInTheDocument());
  });

  it.each(["platform", "unassigned"] as const)("keeps %s scope explicit and omits mark-all", async (kind) => {
    renderInbox(data({ scope: { kind } }));
    expect(screen.queryByRole("button", { name: "Mark all in this tournament read" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mark this notification read" }));
    await waitFor(() => expect(actions.read).toHaveBeenCalledTimes(1));
    const form = actions.read.mock.calls[0][0] as FormData;
    expect(form.get("kind")).toBe(kind);
    expect(form.has("tournamentId")).toBe(false);
  });

  it.each(["tournament", "filter", "page", "refreshed message"])("clears checkboxes when %s changes", (change) => {
    const view = renderInbox();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Notification notice-1" }));
    const scope: AdminInboxScope = change === "tournament" ? { kind: "tournament", tournamentId: TOURNAMENT_B } : { kind: "tournament", tournamentId: TOURNAMENT_A };
    view.rerender(<AdminNotificationInbox data={data({ scope, filter: change === "filter" ? "unread" : "all", page: change === "page" ? 1 : 2,
      selectedNotification: change === "refreshed message" ? { ...notification(), message: "Redacted event" } : notification(),
    })} baseHref="/admin/tournaments/a?section=notifications" title="Inbox" />);
    expect(screen.getByRole("checkbox", { name: "Select Notification notice-1" })).not.toBeChecked();
    if (change === "refreshed message") expect(screen.getByText("Redacted event")).toBeInTheDocument();
  });

  it("keeps a late action response from replacing a newly opened tournament", async () => {
    let finish!: (value: unknown) => void;
    actions.read.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const view = renderInbox();
    fireEvent.click(screen.getByRole("button", { name: "Mark this notification read" }));
    const next = data({ scope: { kind: "tournament", tournamentId: TOURNAMENT_B }, notifications: [], selectedNotification: null, totalCount: 0, unreadCount: 0 });
    view.rerender(<AdminNotificationInbox data={next} baseHref="/admin/tournaments/b?section=notifications" title="Tournament B notifications" />);
    await act(async () => { finish({ ok: true, data: data() }); });
    expect(screen.getByRole("heading", { name: "Tournament B notifications" })).toBeInTheDocument();
    expect(screen.queryByText("Original registration event")).not.toBeInTheDocument();
  });

  it("shows an action failure while preserving the visible inbox", async () => {
    actions.remove.mockResolvedValue({ ok: false, message: "Selection no longer belongs to this inbox." });
    renderInbox();
    fireEvent.click(screen.getByRole("button", { name: "Remove this notification from inbox" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Selection no longer belongs to this inbox.");
    expect(screen.getAllByText("Original registration event").length).toBeGreaterThan(0);
  });
});
