import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkAssignmentConflicts, saveCastingAssignment, searchAssignmentCasters } from "@/app/admin/casters/coverage/actions";
import { parseCoverageAssignmentMutation, parseCoverageCasterIds, parseCoverageTarget } from "@/app/admin/casters/coverage/inputs";

const { rpc, requireStaff, requireLegal, enabled, revalidate } = vi.hoisted(() => ({
  rpc: vi.fn(),
  requireStaff: vi.fn(),
  requireLegal: vi.fn(),
  enabled: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock("@/lib/caster/server", () => ({ casterRpc: rpc }));
vi.mock("@/lib/patch2-admin-access", () => ({ requireCurrentPatch2Admin: requireStaff }));
vi.mock("@/lib/account-legal-mutation-guard", () => ({ requireCurrentAccountLegalAcceptance: requireLegal }));
vi.mock("@/lib/caster/environment", () => ({ isCasterProgramEnabled: enabled }));
vi.mock("next/cache", () => ({ revalidatePath: revalidate }));

const tournament = "aaaa0000-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const division = "bbbb0000-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const match = "cccc0000-cccc-4ccc-8ccc-cccccccccccc";
const first = "dddd0000-dddd-4ddd-8ddd-dddddddddddd";
const second = "eeee0000-eeee-4eee-8eee-eeeeeeeeeeee";
const actor = "user_coverage_fixture_staff";

function form(values: Record<string, string>) {
  const request = new FormData();
  Object.entries(values).forEach(([key, value]) => request.append(key, value));
  return request;
}

function ownMatchForm() {
  return form({ tournament, division, match, caster: first, action: "create", scope: "match", confirm: "yes" });
}

describe("casting management input validation", () => {
  it("requires the full scope and rejects additional or duplicate identifiers", () => {
    expect(parseCoverageTarget(form({ tournament, scope: "tournament" }))).toEqual({ tournament, division: null, match: null });
    expect(parseCoverageTarget(form({ tournament, division, scope: "division" }))).toEqual({ tournament, division, match: null });
    expect(parseCoverageTarget(form({ tournament, match, scope: "match" }))).toBeNull();
    expect(parseCoverageTarget(form({ tournament, division, match, scope: "division" }))).toBeNull();
    expect(parseCoverageTarget(ownMatchForm())).toEqual({ tournament, division, match });
    const duplicates = ownMatchForm();
    duplicates.append("caster", first.toUpperCase());
    duplicates.append("scope", "match");
    expect(parseCoverageCasterIds(duplicates)).toBeNull();
    expect(parseCoverageTarget(duplicates)).toBeNull();
  });

  it("requires a date for verified coverage and a reason for corrections and exceptions", () => {
    const completion = form({ assignment: first, action: "complete", confirm: "yes", version: "1" });
    expect(parseCoverageAssignmentMutation(completion)).toBeNull();
    completion.set("covered", "2026-02-31T11:45:00.000Z");
    expect(parseCoverageAssignmentMutation(completion)).toBeNull();
    completion.set("covered", "2026-02-21T11:45:00.000Z");
    expect(parseCoverageAssignmentMutation(completion)).toMatchObject({ covered: "2026-02-21T11:45:00.000Z" });
    completion.set("action", "correct");
    expect(parseCoverageAssignmentMutation(completion)).toBeNull();
    completion.set("reason", "Corrected confirmation time");
    expect(parseCoverageAssignmentMutation(completion)).toMatchObject({ action: "correct" });
    const exception = ownMatchForm();
    exception.set("acknowledge", "yes");
    expect(parseCoverageAssignmentMutation(exception)).toBeNull();
    exception.set("reason", "Operations approved separate spectator feed");
    expect(parseCoverageAssignmentMutation(exception)).toMatchObject({ acknowledged: true, action: "create" });
  });
});

describe("casting management server authority", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    enabled.mockReturnValue(true);
    requireStaff.mockResolvedValue(actor);
    requireLegal.mockResolvedValue(undefined);
  });

  it("fails closed when the feature, staff authority, or legal evidence is unavailable", async () => {
    enabled.mockReturnValueOnce(false);
    expect(await saveCastingAssignment({ kind: "idle" }, ownMatchForm())).toMatchObject({ kind: "error" });
    expect(requireStaff).not.toHaveBeenCalled();
    requireStaff.mockRejectedValueOnce(new Error("denied"));
    expect(await checkAssignmentConflicts({ kind: "idle" }, ownMatchForm())).toMatchObject({ kind: "error" });
    requireLegal.mockRejectedValueOnce(new Error("unavailable"));
    expect(await searchAssignmentCasters({ kind: "idle" }, form({ query: "caster" }))).toMatchObject({ kind: "error" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("canonicalizes approved URLs and schedules the entire caster selection in one service RPC", async () => {
    const request = ownMatchForm();
    request.append("caster", second);
    request.set("acknowledge", "yes");
    request.set("reason", "Approved conflict exception");
    request.set("broadcast", "https://m.twitch.tv/Ironclad_Tournaments");
    request.set("recording", "https://youtu.be/dQw4w9WgXcQ");
    request.set("actor", "user_forged_staff");
    rpc.mockResolvedValueOnce({ status: "ok" });

    expect(await saveCastingAssignment({ kind: "idle" }, request)).toMatchObject({ kind: "ok" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("caster_phase4_admin_assign", expect.objectContaining({
      p_actor: actor, p_application_ids: [first, second], p_tournament_id: tournament, p_division_id: division,
      p_match_id: match, p_broadcast_url: "https://www.twitch.tv/ironclad_tournaments",
      p_recording_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      p_acknowledged: true, p_reason: "Approved conflict exception",
    }));
    expect(revalidate).toHaveBeenCalledWith("/caster-studio");
  });

  it("preserves the expected revision on mutations and handles competition state changes", async () => {
    const request = form({ assignment: first, action: "cancel", reason: "Broadcast cancelled", version: "2", confirm: "yes" });
    rpc.mockResolvedValueOnce({ status: "conflict" });
    expect(await saveCastingAssignment({ kind: "idle" }, request)).toMatchObject({ kind: "error" });
    expect(rpc).toHaveBeenCalledWith("caster_phase4_admin_save", expect.objectContaining({
      p_actor: actor, p_assignment_id: first, p_expected_version: 2, p_application_id: null, p_action: "cancel", p_tournament_id: null,
    }));
    expect(revalidate).not.toHaveBeenCalled();

    rpc.mockResolvedValueOnce({ status: "ok", conflict: "own_match" });
    expect(await checkAssignmentConflicts({ kind: "idle" }, ownMatchForm())).toMatchObject({
      kind: "ok", conflicts: [{ caster: first, level: "own_match" }],
    });
    expect(rpc).toHaveBeenLastCalledWith("caster_phase4_admin_conflict", {
      p_actor: actor, p_application_id: first, p_tournament_id: tournament, p_division_id: division, p_match_id: match,
    });
  });
});
