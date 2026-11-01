import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockServer } from "@/tests/mocks/server";

const authMock = vi.hoisted(() => vi.fn());
const revalidateMock = vi.hoisted(() => vi.fn());
const notifyMock = vi.hoisted(() => vi.fn());
vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidateMock }));
vi.mock("next/navigation", () => ({ redirect: (href: string) => { throw new Error(`REDIRECT:${href}`); } }));
vi.mock("@/lib/notifications", () => ({ createInAppNotification: notifyMock }));
import { updateRegistrationStatus, approveSelectedRegistrations, deleteSelectedRegistrations } from "@/app/admin/registration-actions";

const A = "10000000-0000-4000-8000-000000000001";
const B = "10000000-0000-4000-8000-000000000002";
const ONE = "30000000-0000-4000-8000-000000000001";
const TWO = "30000000-0000-4000-8000-000000000002";
const OTHER = "30000000-0000-4000-8000-000000000003";
const MISSING = "30000000-0000-4000-8000-000000000009";
const endpoint = "http://127.0.0.1:54321/rest/v1";
type Row = { id: string; tournament_id: string; registration_status: string; clerk_user_id: string; player_name: string; tournament_title: string; bracket_name: string; tournament_bracket_id: string };
let rows: Row[];
let reads: URL[];
const rpcMock = vi.fn();
function form(ids = [ONE], tournament: string | null = A) {
  const data = new FormData();
  for (const id of ids) data.append("registrationId", id);
  data.set("nextStatus", "approved");
  data.set("activeFilter", "pending");
  if (tournament !== null) {
    data.set("workspaceTournamentId", tournament);
    data.set("workspaceSection", "registrations");
    data.set("workspacePage", "2");
  }
  return data;
}
function filter(rows: Row[], params: URLSearchParams) {
  return rows.filter((row) => [...params].every(([key, value]) => {
    if (key === "tournament_id") return value === `eq.${row.tournament_id}`;
    if (key === "id") return value.startsWith("eq.") ? value === `eq.${row.id}` : value.slice(4, -1).split(",").includes(row.id);
    return true;
  }));
}
beforeEach(() => {
  authMock.mockResolvedValue({ userId: "user_admin", sessionClaims: { metadata: { role: "admin" } } });
  reads = [];
  rows = [[ONE, A], [TWO, A], [OTHER, B]].map(([id, tournament_id]) => ({
    id, tournament_id, registration_status: "pending", clerk_user_id: "user_same_player",
    player_name: "Same player", tournament_title: "Cup", bracket_name: "Academy",
    tournament_bracket_id: "20000000-0000-4000-8000-000000000001",
  }));
  rpcMock.mockImplementation((name: string, body: Record<string, unknown>) => {
    const ids = (body.p_registration_ids ?? [body.p_registration_id]) as string[];
    if (ids.some((id) => !rows.some((row) => row.id === id && row.tournament_id === body.p_tournament_id))) {
      return HttpResponse.json({ message: "scope mismatch", code: "22023" }, { status: 400 });
    }
    for (const row of rows) if (ids.includes(row.id)) row.registration_status = String(body.p_registration_status ?? "approved");
    return HttpResponse.json(name === "approve_tournament_registrations_scoped"
      ? ids.map((registration_id) => ({ registration_id, error_message: null })) : []);
  });
  mockServer.use(
    http.get(`${endpoint}/registrations`, ({ request }) => {
      const url = new URL(request.url); reads.push(url);
      return HttpResponse.json(filter(rows, url.searchParams));
    }),
    http.get(`${endpoint}/notifications`, () => HttpResponse.json([])),
    http.post(`${endpoint}/rpc/:name`, async ({ params, request }) => rpcMock(String(params.name), await request.json())),
  );
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("tournament-scoped registration Server Actions", () => {
  it.each([null, "player"])("rejects non-admin callers (%s) before reads", async (role) => {
    authMock.mockResolvedValue({ userId: role ? "user_player" : null, sessionClaims: { metadata: { role } } });
    await expect(updateRegistrationStatus(form())).rejects.toThrow("Unauthorized");
    await expect(approveSelectedRegistrations(form())).rejects.toThrow("Unauthorized");
    await expect(deleteSelectedRegistrations(form())).rejects.toThrow("Unauthorized");
    expect(reads).toHaveLength(0); expect(rpcMock).not.toHaveBeenCalled();
  });
  it.each([updateRegistrationStatus, approveSelectedRegistrations, deleteSelectedRegistrations])("old forms without context fail safely", async (action) => {
    await expect(action(form([ONE], null))).rejects.toThrow("registration-scope-required");
    expect(reads).toHaveLength(0); expect(rpcMock).not.toHaveBeenCalled();
  });
  it("rejects a forged individual target from the other tournament", async () => {
    await expect(updateRegistrationStatus(form([OTHER]))).rejects.toThrow("registration-scope-mismatch");
    expect(reads[0].searchParams.get("tournament_id")).toBe(`eq.${A}`);
    expect(rpcMock).not.toHaveBeenCalled(); expect(notifyMock).not.toHaveBeenCalled();
    expect(rows[2].registration_status).toBe("pending");
  });
  it.each([[ONE, OTHER], [ONE, MISSING]])("validates the entire bulk selection before any mutation: %j", async (...ids) => {
    await expect(approveSelectedRegistrations(form(ids))).rejects.toThrow("registration-scope-mismatch");
    expect(rpcMock).not.toHaveBeenCalled(); expect(rows.every((row) => row.registration_status === "pending")).toBe(true);
  });
  it.each([{ ids: [ONE, "bad-id"] }, { ids: [] }, { ids: Array(101).fill(ONE) as string[] }])("rejects malformed, empty or oversized batches without dropping targets", async ({ ids }) => {
    await expect(approveSelectedRegistrations(form(ids))).rejects.toThrow("registration-bulk-failed");
    expect(reads).toHaveLength(0); expect(rpcMock).not.toHaveBeenCalled();
  });
  it("uses the scoped authority for a valid individual decision", async () => {
    await expect(updateRegistrationStatus(form())).rejects.toThrow("notice=saved");
    expect(rpcMock).toHaveBeenCalledWith("review_tournament_registration_scoped", {
      p_tournament_id: A, p_registration_id: ONE, p_registration_status: "approved", p_admin_notes: null,
    });
    expect(rows[2].registration_status).toBe("pending");
    expect(notifyMock).not.toHaveBeenCalled(); // canonical approval trigger remains authoritative
  });
  it("sends the complete same-tournament batch once and preserves pagination", async () => {
    await expect(approveSelectedRegistrations(form([ONE, TWO]))).rejects.toThrow(`REDIRECT:/admin/tournaments/${A}?section=registrations&page=2`);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("approve_tournament_registrations_scoped", { p_tournament_id: A, p_registration_ids: [ONE, TWO] });
    expect(rows[2].registration_status).toBe("pending");
  });
  it("reports domain-rule failures separately after complete scope validation", async () => {
    rpcMock.mockReturnValue(HttpResponse.json([{ registration_id: ONE, error_message: null }, { registration_id: TWO, error_message: "bracket is full" }]));
    await expect(approveSelectedRegistrations(form([ONE, TWO]))).rejects.toThrow("registration-bulk-partial");
  });
  it("does not fall back to an unscoped RPC when the new migration is unavailable", async () => {
    rpcMock.mockReturnValue(HttpResponse.json({ message: "function missing" }, { status: 404 }));
    await expect(updateRegistrationStatus(form())).rejects.toThrow("save-failed");
    expect(rpcMock).toHaveBeenCalledTimes(1); expect(notifyMock).not.toHaveBeenCalled();
  });
  it("retains required review notes and keeps them out of player notifications", async () => {
    const data = form(); data.set("nextStatus", "manual_review");
    await expect(updateRegistrationStatus(data)).rejects.toThrow("note-required");
    expect(rpcMock).not.toHaveBeenCalled();
    data.set("adminNotes", "private evidence");
    await expect(updateRegistrationStatus(data)).rejects.toThrow("notice=saved");
    expect(notifyMock).toHaveBeenCalledOnce();
    expect(JSON.stringify(notifyMock.mock.calls)).not.toContain("private evidence");
  });
  it("allows the authority to enforce withdrawn finality and same-state private notes", async () => {
    rows[0].registration_status = "withdrawn";
    const data = form(); data.set("nextStatus", "withdrawn"); data.set("adminNotes", "history note");
    await expect(updateRegistrationStatus(data)).rejects.toThrow("notice=saved");
    expect(rpcMock).toHaveBeenCalledWith("review_tournament_registration_scoped", expect.objectContaining({p_registration_status: "withdrawn"}));
  });
  it("retains old deletion action as a non-destructive failure", async () => {
    await expect(deleteSelectedRegistrations(form([ONE, OTHER]))).rejects.toThrow("registration-delete-blocked");
    expect(reads).toHaveLength(0); expect(rpcMock).not.toHaveBeenCalled();
  });
});
