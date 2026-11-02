import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadLegacyAssistanceQueue, parseLegacyAssistanceScope } from "@/lib/admin-legacy-assistance";
import { setLegacyAssistanceStatus } from "@/app/admin/notifications/legacy-assistance/actions";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), legal: vi.fn(), client: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: mocks.client }));
vi.mock("@/lib/account-legal-mutation-guard", () => ({ requireCurrentAccountLegalAcceptance: mocks.legal }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error("redirect:" + path); } }));
const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const request = () => ({ id: ID, tournament_id: T, status: "open", version: 1 });
const page = (row = request()) => ({ requests: [row], totalCount: 1, page: 1, pageCount: 1 });
const form = () => {
  const data = new FormData();
  data.set("kind", "tournament"); data.set("tournamentId", T); data.set("requestId", ID);
  data.set("version", "1"); data.set("status", "resolved");
  return data;
};

beforeEach(() => {
  mocks.auth.mockResolvedValue({ userId: "trusted-admin", sessionClaims: { metadata: { role: "admin" } } });
  mocks.client.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: page(), error: null });
});

describe("durable legacy assistance boundary", () => {
  it("requires explicit tournament or unassigned context and normalizes historical UUIDs", () => {
    expect(parseLegacyAssistanceScope("tournament", T.toUpperCase())).toBe(T);
    expect(parseLegacyAssistanceScope("unassigned", null)).toBeNull();
    expect(() => parseLegacyAssistanceScope(null, null)).toThrow("selected tournament");
    expect(() => parseLegacyAssistanceScope("unassigned", T)).toThrow();
    expect(() => parseLegacyAssistanceScope("platform", null)).toThrow();
  });
  it("authorizes before service-role access", async () => {
    mocks.auth.mockResolvedValue({ userId: "player", sessionClaims: { metadata: { role: "player" } } });
    await expect(loadLegacyAssistanceQueue(T)).rejects.toThrow("Unauthorized");
    await expect(setLegacyAssistanceStatus(form())).rejects.toThrow("Unauthorized");
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("reads only the selected scope with exact queue counts", async () => {
    expect((await loadLegacyAssistanceQueue(T)).totalCount).toBe(1);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("read_legacy_assistance_queue", {
      p_tournament_id: T, p_page: 1, p_include_resolved: false,
    });
  });
  it.each([
    { ...page(), requests: [{ ...request(), tournament_id: OTHER }] },
    { ...page(), requests: [{ ...request(), status: "resolved" }] },
    { ...page(), totalCount: 2 },
    { ...page(), pageCount: 2 },
    { ...page(), requests: [{ ...request(), version: 0 }] },
  ])("rejects foreign, stale or incomplete queue results", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    await expect(loadLegacyAssistanceQueue(T)).rejects.toThrow("could not be loaded");
  });
  it("updates explicit status using trusted admin identity and expected version, never inbox mutation", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const data = form(); data.set("adminClerkId", "forged");
    await expect(setLegacyAssistanceStatus(data)).rejects.toThrow("notice=updated");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("set_legacy_assistance_status", {
      p_id: ID, p_tournament_id: T, p_status: "resolved", p_expected_version: 1, p_admin_clerk_id: "trusted-admin",
    });
  });
  it("reports simultaneous version conflicts without retrying or resolving anything else", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    await expect(setLegacyAssistanceStatus(form())).rejects.toThrow("notice=stale");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects contextless or ambiguous old forms before accessing the database", async () => {
    const data = form(); data.delete("kind");
    await expect(setLegacyAssistanceStatus(data)).rejects.toThrow("assistance-context-required");
    const repeated = form(); repeated.append("tournamentId", OTHER);
    await expect(setLegacyAssistanceStatus(repeated)).rejects.toThrow("assistance-context-required");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
