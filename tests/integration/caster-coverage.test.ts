import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  casterCoverageTournamentHref,
  parseCasterCoverageAssignment,
  parseCasterCoverageBroadcastUrl,
  parseCasterCoverageRecordingUrl,
} from "@/lib/caster/coverage";
import { loadCasterAssignments, loadPublicCasterHistory, loadPublicCasterSchedules } from "@/lib/caster/coverage-server";

const { auth, rpc, enabled } = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), enabled: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth }));
vi.mock("@/lib/caster/server", () => ({ casterRpc: rpc }));
vi.mock("@/lib/caster/environment", () => ({ isCasterProgramEnabled: enabled }));

const ids = {
  assignment: "10000000-0000-4000-8000-000000000001",
  tournament: "10000000-0000-4000-8000-000000000002",
  division: "10000000-0000-4000-8000-000000000003",
  match: "10000000-0000-4000-8000-000000000004",
  avatar: "10000000-0000-4000-8000-000000000005",
  revision: "10000000-0000-4000-8000-000000000006",
  application: "10000000-0000-4000-8000-000000000007",
  media: "10000000-0000-4000-8000-000000000008",
  unrelated: "10000000-0000-4000-8000-000000000009",
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: ids.assignment,
    version: 1,
    scope: "match",
    status: "scheduled",
    tournament_id: ids.tournament,
    tournament_title: "Synthetic Cup",
    tournament_slug: "synthetic-cup",
    game: "Company of Heroes 3",
    division_id: ids.division,
    division_name: "Division",
    match_id: ids.match,
    match_label: "Round 1, Match 1",
    scheduled_at: "2026-11-27T15:00:00+00:00",
    covered_at: null,
    verified_at: null,
    broadcast_url: "https://www.twitch.tv/ironclad",
    recording_url: null,
    media_id: ids.media,
    media_url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
    media_title: "Public replay",
    target_available: true,
    application_id: ids.application,
    conflict: "own_match",
    reason: "Private operational exception",
    caster: { slug: "caster-fixture", publication_id: ids.revision, display_name: "Caster", avatar: ids.avatar, email: "private" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  enabled.mockReturnValue(true);
});

describe("caster coverage links", () => {
  it.each([
    ["https://m.twitch.tv/IronClad/?tracking=1", "https://www.twitch.tv/ironclad"],
    ["https://www.youtube.com/@IronClad/live/?foo=bar", "https://www.youtube.com/@IronClad/live"],
    ["https://youtu.be/aqz-KE-bpKQ?t=2", "https://www.youtube.com/watch?v=aqz-KE-bpKQ"],
    ["https://www.twitch.tv/videos/123", "https://www.twitch.tv/videos/123"],
    ["https://clips.twitch.tv/SafeSample", "https://clips.twitch.tv/SafeSample"],
  ])("canonicalises %s", (input, canonical) => {
    expect(parseCasterCoverageBroadcastUrl(input)).toBe(canonical);
  });

  it.each([
    "/api/match-room/replay",
    "http://twitch.tv/ironclad",
    "https://twitch.tv.example/ironclad",
    "https://other.example/tournament/stream",
    "https://someone@www.twitch.tv/ironclad",
    "https://www.twitch.tv:8443/ironclad",
    "https://www.twitch.tv/directory",
    "https://www.youtube.com/redirect?q=abc",
    "https://www.youtube.com/watch?v=short",
  ])("rejects unsupported media input %s", (input) => {
    expect(parseCasterCoverageBroadcastUrl(input)).toBeNull();
    expect(parseCasterCoverageRecordingUrl(input)).toBeNull();
  });

  it("does not label a channel as a recording", () => {
    expect(parseCasterCoverageRecordingUrl("https://www.twitch.tv/ironclad")).toBeNull();
    expect(parseCasterCoverageRecordingUrl("https://www.youtube.com/@ironclad/live")).toBeNull();
  });

  it("points historical matches at the tournament when the match was replaced", () => {
    const current = parseCasterCoverageAssignment(row())!;
    const historical = parseCasterCoverageAssignment(row({ target_available: false }))!;
    expect(casterCoverageTournamentHref(current)).toBe(`/tournaments?tournament=synthetic-cup&tab=brackets&match=${ids.match}`);
    expect(casterCoverageTournamentHref(historical)).toBe("/tournaments?tournament=synthetic-cup&tab=brackets");
  });
});

describe("caster coverage projection", () => {
  it("keeps only verified public history inside the requested competitions and excludes administrative information", async () => {
    const verified = { status: "completed", covered_at: "2026-11-26T23:30:00.000Z", verified_at: "2026-11-27T00:00:00.000Z" };
    rpc.mockResolvedValue([
      row(verified),
      row({ ...verified, tournament_id: ids.unrelated }),
      row({ status: "cancelled" }),
      row(),
      row({ ...verified, target_available: false }),
      row({ ...verified, caster: null }),
    ]);
    const result = await loadPublicCasterSchedules([ids.tournament, "invalid", ids.tournament]);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("caster_privacy_public_verified_tournaments", { p_tournament_ids: [ids.tournament] });
    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty("application_id");
    expect(result[0]).not.toHaveProperty("conflict");
    expect(result[0]).not.toHaveProperty("reason");
    expect(result[0].caster).not.toHaveProperty("email");
  });

  it("projects a verified former credit without personal metadata, outbound links or timestamps", async () => {
    const former = row({ former_caster: true, status: "completed",
      covered_at: "2026-11-27T12:42:01.000Z", verified_at: "2026-11-28T03:41:00.000Z" });
    rpc.mockResolvedValue([former, { ...former, status: "scheduled" }, { ...former, verified_at: null }]);
    const result = await loadPublicCasterSchedules([ids.tournament]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ former_caster: true, covered_at: "2026-11-27", verified_at: "2026-11-28",
      scheduled_at: null, broadcast_url: null, recording_url: null, media_id: null, media_url: null, media_title: null });
    expect(result[0]).not.toHaveProperty("caster");
    expect(result[0]).not.toHaveProperty("application_id");
    expect(result[0]).not.toHaveProperty("conflict");
    await expect(loadPublicCasterHistory("caster-fixture")).resolves.toEqual([]);
  });

  it("retains the existing verified-only fallback before the retention migration", async () => {
    rpc.mockResolvedValueOnce(null).mockResolvedValueOnce([]);
    await expect(loadPublicCasterSchedules([ids.tournament])).resolves.toEqual([]);
    expect(rpc).toHaveBeenLastCalledWith("caster_media_public_verified_tournaments", { p_tournament_ids: [ids.tournament] });
  });

  it("projects verified historical results and removes non-provider media URLs", async () => {
    rpc.mockResolvedValue([
      row({ status: "completed", covered_at: "2026-11-26T23:30:00.000Z", verified_at: "2026-11-27T00:00:00.000Z",
        target_available: false, media_url: "https://ironclad.example/api/private/replay" }),
      row({ status: "completed", covered_at: "2026-11-26T23:30:00.000Z" }),
      row(),
    ]);
    const result = await loadPublicCasterHistory("caster-fixture");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ status: "completed", target_available: false, media_url: null, media_title: null });
    expect(result[0]).not.toHaveProperty("caster");
    expect(result[0]).not.toHaveProperty("application_id");
  });

  it("does not query services with a disabled programme, unsafe slug, or unauthenticated owner", async () => {
    enabled.mockReturnValueOnce(false);
    await expect(loadPublicCasterSchedules([ids.tournament])).resolves.toEqual([]);
    await expect(loadPublicCasterHistory("invalid/path")).resolves.toEqual([]);
    auth.mockResolvedValue({ userId: "user_Different", sessionId: "sess_fixture" });
    await expect(loadCasterAssignments("user_Claimant")).resolves.toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("uses only the authenticated owner's ID and distinguishes unavailable from empty", async () => {
    auth.mockResolvedValue({ userId: "user_Claimant", sessionId: "sess_fixture" });
    rpc.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce({ status: "ok", assignments: [row()] });
    await expect(loadCasterAssignments("user_Claimant")).resolves.toBeNull();
    await expect(loadCasterAssignments("user_Claimant")).resolves.toEqual([]);
    expect(rpc).toHaveBeenLastCalledWith("caster_media_owner_verified_history", { p_actor: "user_Claimant" });
  });
});
