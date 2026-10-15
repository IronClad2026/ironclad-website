import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminIdentity, anonymousIdentity, playerIdentity } from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const adminClientMock = vi.hoisted(() => vi.fn());
vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: adminClientMock }));

import { getRecentLeaderboardRecalculationRuns } from "@/lib/leaderboard/admin";

const epoch = Date.parse("2026-10-15T00:00:00.000Z");
const queryDelay = 20;
const runRows = [
  { id: "run-one", scope: "tournament", status: "completed", started_at: "2026-10-14T10:00:00Z", finished_at: "2026-10-14T10:00:01Z", notes: null, tournament_id: "tournament-one", season_id: null },
  { id: "run-two", scope: "season", status: "failed", started_at: "2026-10-14T09:00:00Z", finished_at: null, notes: "Synthetic diagnostic", tournament_id: "tournament-one", season_id: "season-one" },
  { id: "run-three", scope: "all_time", status: "pending", started_at: "2026-10-14T08:00:00Z", finished_at: null, notes: null, tournament_id: null, season_id: null },
  { id: "run-four", scope: "season", status: "completed", started_at: "2026-10-14T07:00:00Z", finished_at: "2026-10-14T07:00:01Z", notes: null, tournament_id: "missing-tournament", season_id: "missing-season" },
];
const expectedRuns = runRows.map((row) => ({
  id: row.id, scope: row.scope, status: row.status, startedAt: row.started_at,
  finishedAt: row.finished_at, notes: row.notes, tournamentId: row.tournament_id,
  tournamentTitle: row.tournament_id === "tournament-one" ? "Synthetic Cup" : null,
  seasonId: row.season_id, seasonName: row.season_id === "season-one" ? "2026 Pro Season 1" : null,
}));

type Reply = { data: unknown; error: unknown };
type Call = { table: string; columns: string; filters: Record<string, unknown>; startedAt: number };
type Query = PromiseLike<Reply> & Record<"select" | "order" | "limit" | "in", (...args: unknown[]) => Query>;
type FixtureOptions = { failures?: string[]; rows?: typeof runRows | null };
const contract = (calls: Call[]) => calls.map(({ table, columns, filters }) => ({ table, columns, filters }));

function createFixture({ failures = [], rows = runRows }: FixtureOptions = {}) {
  const calls: Call[] = [];
  const client = { from(table: string) {
    let columns = "";
    const filters: Record<string, unknown> = {};
    const query = {} as Query;
    query.select = (value) => { columns = String(value); return query; };
    query.order = (key, value) => { filters.order = [key, value]; return query; };
    query.limit = (value) => { filters.limit = value; return query; };
    query.in = (key, value) => { filters[String(key)] = value; return query; };
    query.then = (resolve, reject) => {
      calls.push({ table, columns, filters, startedAt: Date.now() - epoch });
      return new Promise<Reply>((finish) => setTimeout(() => {
        if (failures.includes(table)) {
          finish({ data: null, error: { code: "SYNTHETIC_FAILURE" } });
        } else if (table === "leaderboard_recalculation_runs") {
          finish({ data: rows?.slice(0, Number(filters.limit)) ?? null, error: null });
        } else if (table === "tournaments") {
          finish({ data: [{ id: "tournament-one", title: "Synthetic Cup" }], error: null });
        } else if (table === "leaderboard_seasons") {
          finish({ data: [{ id: "season-one", name: "2026 Pro Season 1" }], error: null });
        } else throw new Error("Unexpected synthetic query");
      }, queryDelay)).then(resolve, reject);
    };
    return query;
  } };
  return { client, calls };
}

async function sample(options?: FixtureOptions, limit = 8) {
  vi.setSystemTime(epoch);
  const fixture = createFixture(options);
  adminClientMock.mockReturnValue(fixture.client);
  const pending = getRecentLeaderboardRecalculationRuns(limit);
  await vi.runAllTimersAsync();
  return { result: await pending, calls: fixture.calls, duration: Date.now() - epoch };
}

describe("Admin System recalculation history read scheduling", () => {
  beforeEach(() => {
    authMock.mockReset();
    adminClientMock.mockReset();
    authMock.mockResolvedValue(adminIdentity);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("measures 30 delayed samples with the exact scoped queries and full DTO", async () => {
    const samples = [];
    for (let index = 0; index < 30; index++) samples.push(await sample());
    const first = samples[0];
    const expectedContract = [
      { table: "leaderboard_recalculation_runs", columns: "id, scope, status, started_at, finished_at, notes, tournament_id, season_id", filters: { order: ["started_at", { ascending: false }], limit: 8 } },
      { table: "tournaments", columns: "id, title", filters: { id: ["tournament-one", "missing-tournament"] } },
      { table: "leaderboard_seasons", columns: "id, name", filters: { id: ["season-one", "missing-season"] } },
    ];
    for (const measured of samples) {
      expect(measured.result).toEqual(expectedRuns);
      expect(contract(measured.calls)).toEqual(expectedContract);
      expect(measured.calls).toHaveLength(3);
      expect(measured.duration).toBe(40);
      expect(new Set(measured.calls.map((call) => call.startedAt)).size).toBe(2);
      expect(measured.calls.slice(1).every((call) => call.startedAt >= queryDelay)).toBe(true);
    }
    const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
    console.info("ADMIN_RUN_HISTORY_BENCHMARK", JSON.stringify({ samples: samples.length, artificialQueryLatencyMs: queryDelay, virtualP50Ms: samples[15].duration, virtualP95Ms: samples[28].duration, queryCount: first.calls.length, networkWaves: new Set(first.calls.map((call) => call.startedAt)).size, queryContractSha256: digest(contract(first.calls)), outputSha256: digest(first.result) }));
  });

  it.each([
    [["tournaments"], true, false],
    [["leaderboard_seasons"], false, true],
    [["tournaments", "leaderboard_seasons"], true, true],
  ] as const)("keeps independent partial metadata failures %j", async (failures, titleFailed, seasonFailed) => {
    const measured = await sample({ failures: [...failures] });
    expect(measured.result).toEqual(expectedRuns.map((run) => ({ ...run,
      tournamentTitle: titleFailed ? null : run.tournamentTitle,
      seasonName: seasonFailed ? null : run.seasonName,
    })));
    expect(measured.calls).toHaveLength(3);
    expect(vi.mocked(console.error).mock.calls.map(([message]) => message).sort()).toEqual([
      ...(titleFailed ? ["Leaderboard run tournament title load failed:"] : []),
      ...(seasonFailed ? ["Leaderboard run season name load failed:"] : []),
    ].sort());
  });

  it("returns no runs and skips metadata queries when the initial query fails", async () => {
    const measured = await sample({ failures: ["leaderboard_recalculation_runs"] });
    expect(measured.result).toEqual([]);
    expect(measured.calls).toHaveLength(1);
    expect(console.error).toHaveBeenCalledWith("Leaderboard recalculation runs load failed:", { code: "SYNTHETIC_FAILURE" });
  });

  it.each([{ label: "empty", rows: [] }, { label: "null", rows: null }])("keeps a $label run response to one query", async ({ rows }) => {
    const measured = await sample({ rows });
    expect(measured.result).toEqual([]);
    expect(measured.calls).toHaveLength(1);
  });

  it("keeps the caller's limit and skips metadata without corresponding IDs", async () => {
    const measured = await sample({ rows: [runRows[2]] }, 1);
    expect(measured.result).toEqual([expectedRuns[2]]);
    expect(measured.calls).toEqual([expect.objectContaining({ table: "leaderboard_recalculation_runs", filters: { order: ["started_at", { ascending: false }], limit: 1 } })]);
  });

  it.each([["anonymous", anonymousIdentity], ["player", playerIdentity]] as const)("rejects %s before any service client or data read", async (_name, identity) => {
    authMock.mockResolvedValue(identity);
    await expect(getRecentLeaderboardRecalculationRuns()).resolves.toEqual([]);
    expect(adminClientMock).not.toHaveBeenCalled();
  });
});
