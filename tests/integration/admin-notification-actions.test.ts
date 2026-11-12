import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dismissSelectedAdminNotifications, markAllAdminNotificationsRead, markSelectedAdminNotificationsRead,
} from "@/app/admin/notifications/actions";
import { type AdminInboxScope } from "@/lib/admin-notification-inbox";
import {
  ADMIN_INBOX_NOTIFICATION_ID as NOTICE, ADMIN_INBOX_TOURNAMENT_ID as TOURNAMENT,
  adminInboxRow, adminInboxSnapshot,
} from "@/tests/fixtures/admin-inbox";

const authMock = vi.hoisted(() => vi.fn());
const rpcMock = vi.hoisted(() => vi.fn());
const createClientMock = vi.hoisted(() => vi.fn());
const legalMock = vi.hoisted(() => vi.fn());
vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/patch2-admin-access", async () => {
  const { createPatch2AdminAccessFixture } = await import("@/tests/fixtures/patch2-admin-access");
  return createPatch2AdminAccessFixture(authMock);
});
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: createClientMock }));
vi.mock("@/lib/account-legal-mutation-guard", () => ({ requireCurrentAccountLegalAcceptance: legalMock }));

function form(scope: AdminInboxScope = { kind: "tournament", tournamentId: TOURNAMENT }, ids = [NOTICE]) {
  const data = new FormData();
  data.set("kind", scope.kind);
  if (scope.kind === "tournament") data.set("tournamentId", scope.tournamentId);
  data.set("page", "1"); data.set("filter", "all");
  for (const id of ids) data.append("notificationId", id);
  return data;
}

function completeMutation(row = adminInboxRow()) {
  rpcMock.mockResolvedValueOnce({ data: 1, error: null });
  rpcMock.mockResolvedValueOnce({ data: adminInboxSnapshot([row]), error: null });
}

describe("scoped Admin inbox Server Actions", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.stubEnv("PATCH2_ADMIN_INBOX_ENABLED", "true");
    authMock.mockResolvedValue({ userId: "admin_a", sessionClaims: { metadata: { role: "admin" } } });
    legalMock.mockResolvedValue(undefined);
    createClientMock.mockReturnValue({ rpc: rpcMock });
  });

  it.each([markSelectedAdminNotificationsRead, dismissSelectedAdminNotifications, markAllAdminNotificationsRead])(
    "rejects an already-open scoped action when its server switch is disabled", async (action) => {
      vi.stubEnv("PATCH2_ADMIN_INBOX_ENABLED", "false");
      expect(await action(form())).toEqual({ ok: false, message: "The scoped Admin inbox is currently disabled. Please try again later." });
      expect(createClientMock).not.toHaveBeenCalled();
      expect(legalMock).not.toHaveBeenCalled();
    }
  );

  it.each([markSelectedAdminNotificationsRead, dismissSelectedAdminNotifications, markAllAdminNotificationsRead])(
    "authenticates before any scope processing, legal guard, or service-role access", async (action) => {
      authMock.mockResolvedValue({ userId: "player", sessionClaims: { metadata: { role: "player" } } });
      const result = await action(form());
      expect(result).toEqual({ ok: false, message: "Administrator access is required." });
      expect(createClientMock).not.toHaveBeenCalled();
      expect(legalMock).not.toHaveBeenCalled();
    }
  );

  it.each([
    [markSelectedAdminNotificationsRead, "read"],
    [dismissSelectedAdminNotifications, "dismiss"],
  ] as const)("applies a selected action then returns a fresh scoped snapshot", async (action, operation) => {
    completeMutation();
    const data = form();
    data.set("selected", NOTICE);
    // The list snapshot is authoritative even if this row was already read elsewhere.
    rpcMock.mockReset().mockResolvedValueOnce({ data: 0, error: null })
      .mockResolvedValueOnce({ data: adminInboxSnapshot([adminInboxRow()], { selectedNotification: adminInboxRow() }), error: null });
    const result = await action(data);
    expect(result).toMatchObject({ ok: true, data: { scope: { kind: "tournament", tournamentId: TOURNAMENT }, selectedNotification: { id: NOTICE } } });
    expect(rpcMock.mock.calls[0]).toEqual(["mutate_admin_notification_inbox", {
      p_scope: "tournament", p_tournament_id: TOURNAMENT, p_action: operation, p_ids: [NOTICE],
    }]);
    expect(rpcMock.mock.calls[1]).toEqual(["read_admin_notification_inbox", {
      p_scope: "tournament", p_tournament_id: TOURNAMENT, p_page: 1, p_unread_only: false, p_selected_id: NOTICE,
    }]);
    expect(legalMock).toHaveBeenCalledOnce();
    expect(authMock).toHaveBeenCalledTimes(2);
  });

  it("marks all in the selected tournament, without limiting the operation to the visible page", async () => {
    completeMutation();
    const result = await markAllAdminNotificationsRead(form(undefined, []));
    expect(result.ok).toBe(true);
    expect(rpcMock.mock.calls[0]).toEqual(["mutate_admin_notification_inbox", {
      p_scope: "tournament", p_tournament_id: TOURNAMENT, p_action: "read_all", p_ids: [],
    }]);
  });

  it.each(["platform", "unassigned"] as const)("allows selected actions in the explicit %s team inbox", async (kind) => {
    completeMutation(adminInboxRow({ tournament_id: null, metadata: kind === "platform" ? { adminInboxScope: "platform" } : {} }));
    const result = await dismissSelectedAdminNotifications(form({ kind }));
    expect(result).toMatchObject({ ok: true, data: { scope: { kind } } });
    expect(rpcMock.mock.calls[0][1]).toEqual({ p_scope: kind, p_tournament_id: null, p_action: "dismiss", p_ids: [NOTICE] });
  });

  it("deduplicates valid UUIDs case-insensitively after validating every target", async () => {
    completeMutation();
    await markSelectedAdminNotificationsRead(form(undefined, [NOTICE, NOTICE.toUpperCase(), NOTICE]));
    expect(rpcMock.mock.calls[0][1].p_ids).toEqual([NOTICE]);
  });

  it("rejects an invalid target anywhere in the supplied list instead of silently omitting it", async () => {
    const result = await markSelectedAdminNotificationsRead(form(undefined, [NOTICE, "invalid"]));
    expect(result.ok).toBe(false);
    expect(createClientMock).not.toHaveBeenCalled();
    expect(legalMock).not.toHaveBeenCalled();
  });

  it.each([0, 101])("rejects %s distinct selections without truncating or broadening the operation", async (length) => {
    const ids = Array.from({ length }, (_, index) => `12345678-1234-4234-8234-${String(index).padStart(12, "0")}`);
    const result = await dismissSelectedAdminNotifications(form(undefined, ids));
    expect(result).toEqual({ ok: false, message: "Select between 1 and 100 notifications." });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("passes all 100 valid selected IDs to the atomic server operation", async () => {
    completeMutation();
    const ids = Array.from({ length: 100 }, (_, index) => `12345678-1234-4234-8234-${String(index).padStart(12, "0")}`);
    const result = await markSelectedAdminNotificationsRead(form(undefined, ids));
    expect(result.ok).toBe(true);
    expect(rpcMock.mock.calls[0][1].p_ids).toEqual(ids);
  });

  it.each(["kind", "tournamentId", "page", "filter", "selected"])("rejects repeated scope/view field %s", async (key) => {
    const data = form();
    if (key === "selected") data.set(key, NOTICE);
    data.append(key, key === "selected" ? NOTICE : "duplicate");
    const result = await markSelectedAdminNotificationsRead(data);
    expect(result.ok).toBe(false);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it.each(["platform", "unassigned"] as const)("rejects mark-all in %s scope", async (kind) => {
    const result = await markAllAdminNotificationsRead(form({ kind }, []));
    expect(result).toEqual({ ok: false, message: "Mark all as read is available only for the selected tournament." });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("rejects mark-all combined with selected targets", async () => {
    const result = await markAllAdminNotificationsRead(form());
    expect(result.ok).toBe(false);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it.each([
    ["tournamentId", "invalid"], ["selected", "invalid"], ["filter", "invalid"], ["page", "0"],
  ])("validates %s before creating the service-role client", async (key, value) => {
    const data = form(); data.set(key, value);
    expect((await markSelectedAdminNotificationsRead(data)).ok).toBe(false);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("rejects a tournament association injected into a platform action", async () => {
    const data = form({ kind: "platform" }); data.set("tournamentId", TOURNAMENT);
    expect((await dismissSelectedAdminNotifications(data)).ok).toBe(false);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("retains the authenticated account legal boundary before mutation", async () => {
    legalMock.mockRejectedValue(new Error("PRIVATE_LEGAL_DETAILS"));
    const result = await dismissSelectedAdminNotifications(form());
    expect(result).toEqual({ ok: false, message: "Review and accept the current account terms before changing the inbox." });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("returns a safe rejection for a cross-scope server failure without loading or inventing state", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "42501", message: "PRIVATE_TARGET_DETAILS" } });
    const result = await dismissSelectedAdminNotifications(form());
    expect(result).toEqual({ ok: false, message: "The inbox change could not be completed. Refresh this inbox and try again." });
    expect(rpcMock).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain("PRIVATE_TARGET_DETAILS");
  });

  it("reports a saved mutation separately when the canonical reload fails", async () => {
    rpcMock.mockResolvedValueOnce({ data: 1, error: null }).mockRejectedValueOnce(new Error("PRIVATE_READ_DETAILS"));
    const result = await markSelectedAdminNotificationsRead(form());
    expect(result).toEqual({ ok: false, message: "The inbox change was saved, but its latest state could not be loaded. Refresh this inbox." });
  });

  it("preserves shared team state when another administrator opens the same inbox", async () => {
    const row = adminInboxRow({ read_at: "2026-11-02T00:01:00.000Z" });
    rpcMock.mockResolvedValueOnce({ data: 1, error: null }).mockResolvedValueOnce({ data: adminInboxSnapshot([row]), error: null });
    authMock.mockResolvedValueOnce({ userId: "admin_a", sessionClaims: { metadata: { role: "admin" } } })
      .mockResolvedValueOnce({ userId: "admin_b", sessionClaims: { metadata: { role: "admin" } } });
    const result = await markSelectedAdminNotificationsRead(form());
    expect(result).toMatchObject({ ok: true, data: { unreadCount: 0, notifications: [{ readAt: row.read_at }] } });
    expect(JSON.stringify(rpcMock.mock.calls)).not.toMatch(/admin_a|admin_b|clerk_user_id/);
  });
});
