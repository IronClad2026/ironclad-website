import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: createSupabaseAdminClientMock }));

import { loadPlayerCareerDashboard } from "@/lib/player-dashboard";
import { loadDictionary } from "@/lib/i18n/loaders";

const viewer = "user_synthetic_scheduling_viewer";
const epoch = Date.parse("2026-10-15T00:00:00.000Z");
const queryDelay = 20;
type Reply = { data: unknown; error: unknown };
type Call = { label: string; table: string; columns: string; filters: Record<string, unknown>; startedAt: number };
type Query = PromiseLike<Reply> & Record<"select" | "eq" | "in" | "order", (...args: unknown[]) => Query>;
const queryContract = (calls: Call[]) => calls.map(({ label, table, columns, filters }) => ({ label, table, columns, filters }));

function clientFixture(failure?: string, empty?: "registrations" | "matches") {
  const calls: Call[] = [];
  const own = { id: "registration-viewer", clerk_user_id: viewer, tournament_id: "tournament-one", tournament_bracket_id: "bracket-one", tournament_title: "Synthetic Scheduling Cup", bracket_name: "Main", player_name: "Viewer", registration_status: "approved" };
  const opponent = { ...own, id: "registration-opponent", clerk_user_id: "user_synthetic_scheduling_opponent", player_name: "Opponent" };
  const match = { id: "match-one", generated_bracket_id: "generated-one", round_id: "round-one", match_number: 1, series_best_of: 3, player_one_registration_id: own.id, player_two_registration_id: opponent.id, player_one_score: 2, player_two_score: 0, winner_registration_id: own.id, official_result_submission_id: "submission-one", outcome_type: null, status: "completed", updated_at: "2026-09-01T00:00:00.000Z" };
  const rows: Record<string, unknown[]> = {
    match_result_submissions: [{ id: "submission-one", submission_number: 1, game_number: 1, match_id: match.id, submitted_by_clerk_user_id: viewer, submitted_by_registration_id: own.id, claimed_winner_registration_id: own.id, player_one_score: 2, player_two_score: 0, status: "approved", review_notes: null, reviewed_at: match.updated_at, created_at: match.updated_at, replay_storage_path: "synthetic-private/replay.rec", screenshot_storage_path: null, report_group_id: null }],
    match_result_report_groups: [{ id: "group-one", match_id: match.id, tournament_id: own.tournament_id, result_type: "normal", submitted_by_registration_id: own.id, opponent_registration_id: opponent.id, winner_registration_id: own.id, player_one_score: 2, player_two_score: 0, status: "approved", confirmation_deadline_at: match.updated_at, confirmed_at: null, disputed_at: null, dispute_notes: null, reviewed_at: match.updated_at, review_notes: null, no_show_registration_id: null, no_show_status: null, finalized_at: match.updated_at, finalized_source: "admin_approval", created_at: match.updated_at }],
    generated_brackets: [{ id: match.generated_bracket_id, tournament_bracket_id: own.tournament_bracket_id, format: "round_robin", slot_count: 2 }],
    bracket_rounds: [{ id: match.round_id, round_number: 1, name: "Round 1" }],
    tournament_standings: [{ generated_bracket_id: match.generated_bracket_id, registration_id: own.id, rank: 1, updated_at: match.updated_at }],
    tournament_brackets: [{ id: own.tournament_bracket_id, tournament_id: own.tournament_id, name: "Main", launched_at: "2026-08-30T00:00:00.000Z" }],
    tournaments: [{ id: own.tournament_id, title: own.tournament_title, banner_image_url: null, division_model_version: "legacy_three_v1" }],
    player_notification_dismissals: [],
    player_report_group_notification_dismissals: [],
  };
  return { calls, client: { from(table: string) {
    const filters: Record<string, unknown> = {};
    let columns = "";
    const query = {} as Query;
    query.select = (value) => { columns = String(value); return query; };
    query.eq = (key, value) => { filters[String(key)] = value; return query; };
    query.in = (key, value) => { filters[String(key)] = value; return query; };
    query.order = () => query;
    query.then = (resolve, reject) => {
      const label = table === "registrations"
        ? ("clerk_user_id" in filters ? "ownedRegistrations" : "participants")
        : table === "tournament_matches"
          ? ("generated_bracket_id" in filters ? "roundRobinStatus" : "player_one_registration_id" in filters ? "playerOneMatches" : "playerTwoMatches")
          : table;
      calls.push({ label, table, columns, filters, startedAt: Date.now() - epoch });
      return new Promise<Reply>((finish) => setTimeout(() => {
        if (label === failure) { finish({ data: null, error: { code: "SYNTHETIC_ERROR", message: "private diagnostic must not escape" } }); return; }
        if (table === "registrations") {
          finish({ data: "clerk_user_id" in filters ? (empty === "registrations" ? [] : [own]) : [own, opponent], error: null });
        } else if (table === "tournament_matches") {
          finish({ data: empty === "matches" ? [] : label === "roundRobinStatus" ? [{ generated_bracket_id: match.generated_bracket_id, status: "completed" }] : label === "playerOneMatches" ? [match] : [], error: null });
        } else {
          if (!(table in rows)) throw new Error("Unexpected synthetic table: " + table);
          finish({ data: rows[table], error: null });
        }
      }, queryDelay)).then(resolve, reject);
    };
    return query;
  } } };
}

async function runSample(failure?: string, empty?: "registrations" | "matches") {
  vi.setSystemTime(epoch);
  const fixture = clientFixture(failure, empty);
  createSupabaseAdminClientMock.mockReturnValue(fixture.client);
  const pending = loadPlayerCareerDashboard(viewer);
  await vi.runAllTimersAsync();
  const dashboard = await pending;
  return { dashboard, calls: fixture.calls, duration: Date.now() - epoch };
}

describe("career query scheduling", () => {
  beforeEach(async () => {
    await loadDictionary("en", "account-dashboard");
    createSupabaseAdminClientMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("measures 30 deterministic delayed career samples without changing the query or result contract", async () => {
    const samples = [];
    for (let index = 0; index < 30; index++) samples.push(await runSample());
    const first = samples[0];
    expect(first.dashboard.error).toBeNull();
    expect(first.dashboard.statistics).toEqual({ matchesPlayed: 1, matchesWon: 1, matchesLost: 0, winRate: 100, tournamentsParticipated: 1, tournamentsWon: 1 });
    expect(first.dashboard.notifications).toHaveLength(2);
    expect(first.dashboard.champions).toHaveLength(1);
    expect(first.dashboard.matchHistory).toHaveLength(1);
    expect(JSON.stringify(first.dashboard)).not.toContain("synthetic-private");
    for (const sample of samples) {
      expect(sample.dashboard).toEqual(first.dashboard);
      expect(sample.calls).toHaveLength(14);
      expect(queryContract(sample.calls)).toEqual(queryContract(first.calls));
      expect(sample.duration).toBe(100);
      expect(new Set(sample.calls.map((call) => call.startedAt)).size).toBe(5);
      expect(sample.calls[0]).toMatchObject({ label: "ownedRegistrations", filters: { clerk_user_id: viewer } });
      expect(sample.calls.find((call) => call.label === "player_notification_dismissals")?.filters).toEqual({ clerk_user_id: viewer, submission_id: ["submission-one"] });
      expect(sample.calls.find((call) => call.label === "player_report_group_notification_dismissals")?.filters).toEqual({ clerk_user_id: viewer, report_group_id: ["group-one"] });
    }
    const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
    console.info("CAREER_DELAYED_BENCHMARK", JSON.stringify({ samples: samples.length, artificialQueryLatencyMs: queryDelay, virtualP50Ms: samples[15].duration, virtualP95Ms: samples[28].duration, queryCount: first.calls.length, networkWaves: new Set(first.calls.map((call) => call.startedAt)).size, queryContractSha256: digest(queryContract(first.calls)), outputSha256: digest(first.dashboard) }));
  });

  it.each([
    ["ownedRegistrations", "load-failed"],
    ["playerOneMatches", "load-failed"],
    ["match_result_submissions", "load-failed"],
    ["roundRobinStatus", "partial-details"],
    ["tournament_brackets", "load-failed"],
    ["tournaments", "partial-details"],
    ["player_notification_dismissals", "partial-details"],
    ["player_report_group_notification_dismissals", "partial-details"],
  ])("preserves the error outcome for %s", async (failure, expected) => {
    const sample = await runSample(failure);
    expect(sample.dashboard.error).toBe(expected);
    expect(JSON.stringify({ result: sample.dashboard, logs: vi.mocked(console.error).mock.calls })).not.toContain("private diagnostic");
    if (failure === "tournament_brackets") {
      expect(sample.calls.some((call) => call.label === "tournaments")).toBe(false);
      expect(sample.calls.some((call) => call.label.includes("dismissals"))).toBe(false);
    }
  });

  it.each(["registrations", "matches"] as const)("preserves a genuine empty %s response", async (empty) => {
    const sample = await runSample(undefined, empty);
    expect(sample.dashboard.error).toBeNull();
    expect(sample.dashboard.matchHistory).toEqual([]);
    expect(sample.dashboard.notifications).toEqual([]);
    expect(sample.calls).toHaveLength(empty === "registrations" ? 1 : 3);
  });
});
