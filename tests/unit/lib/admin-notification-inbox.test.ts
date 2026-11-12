import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadAdminNotificationInbox, type AdminInboxScope } from "@/lib/admin-notification-inbox";
import {
  ADMIN_INBOX_NOTIFICATION_ID as NOTICE, ADMIN_INBOX_TOURNAMENT_ID as TOURNAMENT,
  OTHER_ADMIN_INBOX_TOURNAMENT_ID as OTHER, adminInboxRow, adminInboxSnapshot,
} from "@/tests/fixtures/admin-inbox";

const authMock = vi.hoisted(() => vi.fn());
const rpcMock = vi.hoisted(() => vi.fn());
const createClientMock = vi.hoisted(() => vi.fn());
vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/patch2-admin-access", async () => {
  const { createPatch2AdminAccessFixture } = await import("@/tests/fixtures/patch2-admin-access");
  return createPatch2AdminAccessFixture(authMock);
});
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: createClientMock }));

describe("scoped Admin notification inbox snapshots", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.stubEnv("PATCH2_ADMIN_INBOX_ENABLED", "true");
    authMock.mockResolvedValue({ userId: "admin_a", sessionClaims: { metadata: { role: "admin" } } });
    createClientMock.mockReturnValue({ rpc: rpcMock });
    rpcMock.mockResolvedValue({ data: adminInboxSnapshot(), error: null });
  });

  it.each([undefined, "false", "TRUE", "1"])("fails closed without the exact enabled server switch: %s", async (value) => {
    vi.stubEnv("PATCH2_ADMIN_INBOX_ENABLED", value);
    await expect(loadAdminNotificationInbox({ kind: "tournament", tournamentId: TOURNAMENT }))
      .rejects.toThrow("currently disabled");
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it.each([
    { userId: null, sessionClaims: null },
    { userId: "player", sessionClaims: { metadata: { role: "player" } } },
    { userId: "player", sessionClaims: null },
  ])("requires current admin authorization before service-role access: %j", async (identity) => {
    authMock.mockResolvedValue(identity);
    await expect(loadAdminNotificationInbox({ kind: "tournament", tournamentId: TOURNAMENT }))
      .rejects.toThrow("Administrator access is required.");
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("sanitizes an identity-provider failure before any service-role access", async () => {
    authMock.mockRejectedValue(new Error("PRIVATE_IDENTITY_PROVIDER_DETAILS"));
    await expect(loadAdminNotificationInbox({ kind: "tournament", tournamentId: TOURNAMENT }))
      .rejects.toThrow("Administrator access is required.");
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("loads one scoped snapshot and maps only safe notification DTO fields", async () => {
    const row = adminInboxRow({ recipient_clerk_user_id: "PRIVATE_RECIPIENT", actor_clerk_user_id: "PRIVATE_ACTOR" });
    rpcMock.mockResolvedValue({ data: adminInboxSnapshot([row], { selectedNotification: row }), error: null });
    const data = await loadAdminNotificationInbox({ kind: "tournament", tournamentId: TOURNAMENT }, { selected: NOTICE.toUpperCase() });
    expect(rpcMock).toHaveBeenCalledExactlyOnceWith("read_admin_notification_inbox", {
      p_scope: "tournament", p_tournament_id: TOURNAMENT, p_page: 1,
      p_unread_only: false, p_selected_id: NOTICE,
    });
    expect(data.scope).toEqual({ kind: "tournament", tournamentId: TOURNAMENT });
    expect(data.notifications[0].href).toContain(`/admin/tournaments/${TOURNAMENT}?section=registrations`);
    expect(data.selectedNotification?.id).toBe(NOTICE);
    expect(JSON.stringify(data)).not.toMatch(/PRIVATE_RECIPIENT|PRIVATE_ACTOR|metadata|in_app_hidden_at/);
    expect(authMock.mock.invocationCallOrder[0]).toBeLessThan(createClientMock.mock.invocationCallOrder[0]);
  });

  it("normalizes tournament UUID case and passes filtered page state to the server", async () => {
    const tournamentId = "abcdef12-abcd-4abc-8abc-abcdef654321";
    rpcMock.mockResolvedValue({ data: adminInboxSnapshot([adminInboxRow({ tournament_id: tournamentId })], {
      totalCount: 27, unreadCount: 26, filteredCount: 26, page: 2, pageCount: 2,
    }), error: null });
    const data = await loadAdminNotificationInbox({ kind: "tournament", tournamentId: tournamentId.toUpperCase() }, { page: "2", filter: "unread" });
    expect(data).toMatchObject({ scope: { kind: "tournament", tournamentId }, page: 2, pageCount: 2, filter: "unread" });
    expect(rpcMock).toHaveBeenCalledWith("read_admin_notification_inbox", expect.objectContaining({ p_page: 2, p_unread_only: true, p_tournament_id: tournamentId }));
  });

  it.each([
    { kind: "platform" as const, metadata: { adminInboxScope: "platform" } },
    { kind: "unassigned" as const, metadata: {} },
    { kind: "unassigned" as const, metadata: { adminInboxScope: "unknown" } },
  ])("keeps explicit platform notifications separate from unassigned legacy records: %j", async ({ kind, metadata }) => {
    rpcMock.mockResolvedValue({ data: adminInboxSnapshot([adminInboxRow({ tournament_id: null, metadata })]), error: null });
    const data = await loadAdminNotificationInbox({ kind });
    expect(data.scope).toEqual({ kind });
    expect(rpcMock).toHaveBeenCalledWith("read_admin_notification_inbox", expect.objectContaining({ p_scope: kind, p_tournament_id: null }));
  });

  it.each([
    { kind: "tournament", tournamentId: "unknown" },
    { kind: "platform", tournamentId: TOURNAMENT },
    { kind: "unassigned", ignoredScope: TOURNAMENT },
    { kind: "all" }, null,
  ])("rejects invalid/ambiguous scope without any RPC: %j", async (scope) => {
    await expect(loadAdminNotificationInbox(scope as AdminInboxScope)).rejects.toThrow();
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it.each([
    { selected: "bad-id" }, { selected: "" }, { page: 0 }, { page: "2oops" },
    { page: 2_147_483_648 }, { filter: "read" },
  ])("rejects malformed view state without any RPC: %j", async (options) => {
    await expect(loadAdminNotificationInbox({ kind: "tournament", tournamentId: TOURNAMENT }, options)).rejects.toThrow();
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("preserves selected detail outside the current unread page", async () => {
    const selected = adminInboxRow({ read_at: "2026-11-02T00:01:00.000Z" });
    rpcMock.mockResolvedValue({ data: adminInboxSnapshot([], {
      totalCount: 1, unreadCount: 0, filteredCount: 0, selectedNotification: selected,
    }), error: null });
    const data = await loadAdminNotificationInbox({ kind: "tournament", tournamentId: TOURNAMENT }, { filter: "unread", selected: NOTICE });
    expect(data.notifications).toEqual([]);
    expect(data.selectedNotification?.readAt).toBe(selected.read_at);
  });

  it.each([
    adminInboxSnapshot([adminInboxRow({ tournament_id: OTHER })]),
    adminInboxSnapshot([adminInboxRow({ recipient_role: "player" })]),
    adminInboxSnapshot([adminInboxRow({ in_app_hidden_at: "2026-11-02T00:01:00.000Z" })]),
    adminInboxSnapshot([], { selectedNotification: adminInboxRow({ tournament_id: OTHER }) }),
    adminInboxSnapshot([], { totalCount: 100, unreadCount: 100, filteredCount: 100 }),
    adminInboxSnapshot([], { unreadCount: -1 }),
    adminInboxSnapshot([], { selectedNotification: undefined }),
  ])("fails closed on cross-scope or incomplete server snapshots", async (payload) => {
    rpcMock.mockResolvedValue({ data: payload, error: null });
    await expect(loadAdminNotificationInbox({ kind: "tournament", tournamentId: TOURNAMENT }, { selected: NOTICE }))
      .rejects.toThrow("The Admin inbox could not be loaded.");
  });

  it.each([
    ["platform", {}], ["unassigned", { adminInboxScope: "platform" }],
  ])("rejects incorrectly classified %s rows", async (kind, metadata) => {
    rpcMock.mockResolvedValue({ data: adminInboxSnapshot([adminInboxRow({ tournament_id: null, metadata })]), error: null });
    await expect(loadAdminNotificationInbox({ kind } as AdminInboxScope)).rejects.toThrow("The Admin inbox could not be loaded.");
  });

  it("never returns private provider error details or invents zero counts", async () => {
    rpcMock.mockRejectedValue(new Error("PRIVATE_DATABASE_DETAILS"));
    await expect(loadAdminNotificationInbox({ kind: "tournament", tournamentId: TOURNAMENT }))
      .rejects.toThrow("The Admin inbox could not be loaded. Please try again.");
  });
});
