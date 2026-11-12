import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LegacyAssistancePage from "@/app/admin/notifications/legacy-assistance/page";
import { setLegacyAssistanceStatus } from "@/app/admin/notifications/legacy-assistance/actions";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), client: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/patch2-admin-access", async () => {
  const { createPatch2AdminAccessFixture } = await import("@/tests/fixtures/patch2-admin-access");
  return createPatch2AdminAccessFixture(mocks.auth);
});
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: mocks.client }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("durable assistance fallback while scoped inbox rollout is disabled", () => {
  beforeEach(() => {
    vi.stubEnv("PATCH2_ADMIN_INBOX_ENABLED", "false");
    mocks.auth.mockResolvedValue({ userId: "trusted-admin", sessionClaims: { metadata: { role: "admin" } } });
    mocks.client.mockReturnValue({ rpc: mocks.rpc });
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([T, null])("keeps %s legacy history and explicit status actions available with the inbox switched off", async (tournamentId) => {
    mocks.rpc.mockResolvedValueOnce({ error: null, data: {
      requests: [{ id: ID, tournament_id: tournamentId, source_notification_id: null,
        status: "open", version: 2, legacy_resolution_unknown: true,
        created_at: "2026-11-01T00:00:00.000Z", updated_at: "2026-11-01T00:00:00.000Z",
        title: "Retained unanswered legacy request", message: "Original issue remains available",
        actor_display_name: null, match_id: null }],
      totalCount: 1, page: 1, pageCount: 1,
    } });
    const kind = tournamentId ? "tournament" : "unassigned";
    const html = renderToStaticMarkup(await LegacyAssistancePage({ searchParams: Promise.resolve({ kind, ...(tournamentId ? { tournamentId } : {}) }) }));
    expect(html).toContain("Retained unanswered legacy request");
    expect(html).toContain("Prior resolution unknown");
    expect(html).toContain("Save request status");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("read_legacy_assistance_queue", {
      p_tournament_id: tournamentId, p_page: 1, p_include_resolved: false,
    });

    const form = new FormData(); form.set("kind", kind);
    if (tournamentId) form.set("tournamentId", tournamentId);
    form.set("requestId", ID); form.set("version", "2"); form.set("status", "in_progress");
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
    await expect(setLegacyAssistanceStatus(form)).rejects.toThrow("notice=updated");
    expect(mocks.rpc).toHaveBeenLastCalledWith("set_legacy_assistance_status", {
      p_id: ID, p_tournament_id: tournamentId, p_status: "in_progress",
      p_expected_version: 2, p_admin_clerk_id: "trusted-admin",
    });
    expect(mocks.rpc.mock.calls.every(([name]) => name === "read_legacy_assistance_queue" || name === "set_legacy_assistance_status")).toBe(true);
  });

  it("still authorizes a fallback page before any data access when the rollout switch is off", async () => {
    mocks.auth.mockResolvedValue({ userId: "player", sessionClaims: { metadata: { role: "player" } } });
    await expect(LegacyAssistancePage({ searchParams: Promise.resolve({ kind: "unassigned" }) })).rejects.toThrow("Unauthorized");
    expect(mocks.client).not.toHaveBeenCalled();
  });
});
