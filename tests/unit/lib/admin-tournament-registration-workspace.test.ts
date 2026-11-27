import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSafeAdminTournamentRegistrationFilter,
  loadAdminTournamentRegistrationSummary,
  loadAdminTournamentRegistrationWorkspace,
} from "@/lib/admin-tournament-registration-workspace";
import type { AdminRegistrationStatus } from "@/lib/admin-registration-review";
import type { AdminTournamentWorkspaceRow } from "@/lib/admin-tournament-workspace";
import type { TournamentDivisionStateResolution } from "@/lib/tournament-division-state";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), createClient: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/patch2-admin-access", async () => {
  const { createPatch2AdminAccessFixture } = await import("@/tests/fixtures/patch2-admin-access");
  return createPatch2AdminAccessFixture(mocks.auth);
});
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: mocks.createClient }));
vi.mock("@/lib/tournaments", () => ({
  getTournamentBracketDisplayName: (name: string) => name,
}));

const TOURNAMENT_A = "11111111-1111-4111-8111-111111111111";
const TOURNAMENT_B = "22222222-2222-4222-8222-222222222222";
const BRACKET = "33333333-3333-4333-8333-333333333333";
const STATUSES: AdminRegistrationStatus[] = [
  "pending", "manual_review", "approved", "rejected", "waitlisted", "withdrawn",
];

function registration(index: number, status = STATUSES[(index - 1) % STATUSES.length], tournamentId: string | null = TOURNAMENT_A) {
  return {
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, "0")}`,
    player_name: "Same player",
    clerk_user_id: "same-player-in-both-tournaments",
    country: "AU",
    submitted_elo: 1200,
    elo_verified_elo: 1250,
    elo_highest_faction: "British Forces",
    elo_checked_at: null,
    elo_verification_source: "relic",
    elo_verified_division: "Challenge",
    elo_calculation_version: "relic-highest-1v1-v2",
    registration_status: status,
    admin_notes: `Private note ${index}`,
    created_at: "2026-10-01T00:00:00.000Z",
    tournament_id: tournamentId,
    tournament_bracket_id: BRACKET,
    tournament_title: tournamentId === TOURNAMENT_A ? "Tournament A" : "Tournament B",
    bracket_name: "Challenge",
    waitlist_offer_status: null,
  };
}

type Registration = ReturnType<typeof registration>;
type QueryCall = {
  columns: string;
  equals: Array<[string, unknown]>;
  includes: Array<[string, unknown[]]>;
  orders: string[];
  range: [number, number] | null;
  single: boolean;
  head: boolean;
};

// Execute the recorded predicates and ranges against isolated fixtures. A
// deliberately tiny provider cap catches pagination that stops on short pages
// or advances by the requested batch size instead of the returned row count.
function database(records: Registration[], cap = 7, failAfter?: number, beforeRead?: (call: QueryCall) => string | void) {
  const calls: QueryCall[] = [];
  const from = vi.fn(() => {
    const call: QueryCall = { columns: "", equals: [], includes: [], orders: [], range: null, single: false, head: false };
    calls.push(call);
    const query = {
      select(columns: string, options?: { head?: boolean }) { call.columns = columns; call.head = options?.head === true; return query; },
      eq(column: string, value: unknown) { call.equals.push([column, value]); return query; },
      in(column: string, values: unknown[]) { call.includes.push([column, values]); return query; },
      order(column: string) { call.orders.push(column); return query; },
      range(start: number, end: number) { call.range = [start, end]; return query; },
      maybeSingle() { call.single = true; return query; },
      then(resolve: (result: { data: Registration[] | Registration | null; count: number; error: { message: string; code?: string } | null }) => unknown) {
        const rangeError = beforeRead?.(call);
        let rows = records.filter((row) => {
          const record = row as Record<string, unknown>;
          return call.equals.every(([key, value]) => record[key] === value)
            && call.includes.every(([key, values]) => values.includes(record[key]));
        });
        rows = rows.slice().sort((left, right) => {
          for (const key of call.orders) {
            const delta = String((left as Record<string, unknown>)[key]).localeCompare(String((right as Record<string, unknown>)[key]));
            if (delta) return delta;
          }
          return 0;
        });
        const count = rows.length;
        if (call.range) rows = rows.slice(call.range[0], Math.min(call.range[1] + 1, call.range[0] + cap));
        const error = rangeError ? { message: "Range error", code: rangeError }
          : failAfter !== undefined && calls.length > failAfter ? { message: "Unavailable" } : null;
        const data = call.head ? null : call.single ? (rows[0] ? { ...rows[0] } : null) : rows.map((row) => ({ ...row }));
        return Promise.resolve(resolve({ data, count, error }));
      },
    };
    return query;
  });
  mocks.createClient.mockReturnValue({ from });
  return { calls, from };
}

function tournament(id = TOURNAMENT_A) {
  return {
    id, title: id === TOURNAMENT_A ? "Tournament A" : "Tournament B",
    status: "registration_open", division_model_version: "four_division_v1",
    tournament_brackets: [{ id: BRACKET, name: "Challenge", launched_at: null, max_players: 8 }],
  } as unknown as AdminTournamentWorkspaceRow;
}

const divisions = [{
  bracketId: BRACKET, displayName: "Challenge", approvedCount: 2,
  requiredCount: 8, launchedAt: null, isReady: false,
}] as unknown as TournamentDivisionStateResolution[];

beforeEach(() => {
  mocks.auth.mockResolvedValue({ userId: "admin-1", sessionClaims: { metadata: { role: "admin" } } });
});

describe("tournament registration workspace reads", () => {
  it.each([0, 7])("restarts the scoped read after a count-preserving status swap after %i page rows", async (afterRows) => {
    const records = Array.from({ length: 40 }, (_, index) => registration(index + 1, index < 30 ? "pending" : "approved"));
    let swapped = false;
    const db = database(records, 7, undefined, (call) => {
      if (!swapped && call.columns.includes("admin_notes") && call.range?.[0] === afterRows) {
        records[afterRows].registration_status = "approved";
        records[30].registration_status = "pending";
        swapped = true;
      }
    });
    const result = await loadAdminTournamentRegistrationWorkspace(tournament(), divisions, { section: "registrations", filter: "pending" });

    expect(result.counts.pending).toBe(30);
    expect(result.rows.map((row) => row.registrationId)).toEqual(records.filter((row) => row.registration_status === "pending").slice(0, 25).map((row) => row.id));
    expect(db.calls.filter((call) => !call.columns.includes("admin_notes") && call.range?.[0] === 0)).toHaveLength(2);
    expect(db.calls.every((call) => call.equals.some(([key, value]) => key === "tournament_id" && value === TOURNAMENT_A))).toBe(true);
  });

  it("recomputes counts and clamps a page that disappears during the read", async () => {
    const records = Array.from({ length: 26 }, (_, index) => registration(index + 1, "pending"));
    const db = database(records, 500, undefined, (call) => {
      if (call.columns.includes("admin_notes") && call.range?.[0] === 25) {
        records[25].registration_status = "approved";
        return "PGRST103";
      }
    });
    const result = await loadAdminTournamentRegistrationWorkspace(tournament(), divisions, { section: "registrations", filter: "pending", page: "2" });

    expect(result).toMatchObject({ counts: { all: 26, pending: 25, approved: 1 }, page: 1, pageCount: 1, filteredCount: 25 });
    expect(result.rows.map((row) => row.registrationId)).toEqual(records.slice(0, 25).map((row) => row.id));
    expect(db.calls.filter((call) => call.columns.includes("admin_notes")).map((call) => call.range)).toEqual([[25, 25], [0, 24]]);
  });

  it("restarts when a requested detail changes after the page was loaded", async () => {
    const records = [registration(1, "pending"), registration(2, "approved")];
    const db = database(records, 7, undefined, (call) => {
      if (call.single) records[1].registration_status = "rejected";
    });
    const result = await loadAdminTournamentRegistrationWorkspace(tournament(), divisions, { section: "registrations", filter: "pending", selectedRegistrationId: records[1].id });

    expect(result).toMatchObject({ counts: { approved: 0, pending: 1, rejected: 1 }, selectedRegistration: { status: "rejected" } });
    expect(db.calls.filter((call) => call.single)).toHaveLength(2);
  });

  it("restarts when the count-only check finds a new match for an empty filter", async () => {
    const records = [registration(1, "approved")];
    const db = database(records, 7, undefined, (call) => {
      if (call.head) records[0].registration_status = "pending";
    });
    const result = await loadAdminTournamentRegistrationWorkspace(tournament(), divisions, { section: "registrations", filter: "pending" });

    expect(result).toMatchObject({ counts: { approved: 0, pending: 1 }, filteredCount: 1 });
    expect(result.rows.map((row) => row.registrationId)).toEqual([records[0].id]);
    expect(db.calls.filter((call) => call.head)).toHaveLength(1);
  });

  it("fails closed after one retry if scoped data keeps changing", async () => {
    const records = [registration(1, "pending"), registration(2, "approved")];
    const db = database(records, 7, undefined, (call) => {
      if (call.columns.includes("admin_notes")) {
        [records[0].registration_status, records[1].registration_status] = [records[1].registration_status, records[0].registration_status];
      }
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(loadAdminTournamentRegistrationWorkspace(tournament(), divisions, { section: "registrations", filter: "pending" })).rejects.toThrow("could not be loaded");
    expect(db.calls).toHaveLength(4);
  });

  it("does not retry an unrelated provider failure", async () => {
    const db = database([registration(1, "pending")], 7, 1);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(loadAdminTournamentRegistrationWorkspace(tournament(), divisions, { section: "registrations", filter: "pending" })).rejects.toThrow("could not be loaded");
    expect(db.calls).toHaveLength(2);
  });
  it.each(STATUSES)("filters %s on the server and keeps complete six-status counts across provider caps", async (status) => {
    const records = Array.from({ length: 72 }, (_, index) => registration(index + 1));
    const db = database([...records, registration(100, "approved", TOURNAMENT_B), registration(101, "pending", null)]);
    const result = await loadAdminTournamentRegistrationWorkspace(tournament(), divisions, { section: "registrations", filter: status });

    expect(result.counts).toEqual({ all: 72, pending: 12, manual_review: 12, approved: 12, rejected: 12, waitlisted: 12, withdrawn: 12 });
    expect(result.rows).toHaveLength(12);
    expect(result.rows.every((row) => row.status === status && row.tournamentId === TOURNAMENT_A)).toBe(true);
    const pageReads = db.calls.filter((call) => call.columns.includes("admin_notes"));
    expect(pageReads.every((call) => call.equals.some(([key, value]) => key === "registration_status" && value === status))).toBe(true);
    expect(db.calls.every((call) => call.equals.some(([key, value]) => key === "tournament_id" && value === TOURNAMENT_A))).toBe(true);
  });

  it("loads only the requested rich-data page in deterministic chronology and keeps global division positions", async () => {
    const records = Array.from({ length: 72 }, (_, index) => registration(index + 1));
    const db = database(records.slice().reverse());
    const result = await loadAdminTournamentRegistrationWorkspace(tournament(), divisions, { section: "registrations", page: "2" });

    expect(result.page).toBe(2);
    expect(result.pageCount).toBe(3);
    expect(result.rows.map((row) => row.registrationId)).toEqual(records.slice(25, 50).map((row) => row.id));
    expect(result.rows.map((row) => row.registrationOrder)).toEqual(Array.from({ length: 25 }, (_, index) => index + 26));
    expect(result.rows.find((row) => row.registrationId === records[28].id)?.waitlistPosition).toBe(5);
    expect(db.calls.filter((call) => call.columns.includes("admin_notes")).map((call) => call.range)).toEqual([[25, 49], [32, 49], [39, 49], [46, 49]]);
    expect(db.calls.every((call) => call.orders.join(",") === "created_at,id")).toBe(true);
  });

  it("loads a scoped detail independently of the current filter and page", async () => {
    const records = Array.from({ length: 72 }, (_, index) => registration(index + 1));
    const db = database(records);
    const result = await loadAdminTournamentRegistrationWorkspace(tournament(), divisions, {
      section: "registrations", filter: "pending", selectedRegistrationId: records[70].id,
    });
    expect(result.selectedRegistration).toMatchObject({ registrationId: records[70].id, status: "waitlisted", privateAdminNote: "Private note 71", waitlistPosition: 12 });
    expect(db.calls.find((call) => call.single)?.equals).toEqual([["tournament_id", TOURNAMENT_A], ["id", records[70].id]]);
  });

  it("never opens the same player's record from another tournament or unassigned history", async () => {
    const foreign = registration(100, "approved", TOURNAMENT_B);
    database([registration(1), foreign, registration(101, "pending", null)]);
    const result = await loadAdminTournamentRegistrationWorkspace(tournament(), divisions, { section: "registrations", selectedRegistrationId: foreign.id });
    expect(result.selectedRegistration).toBeNull();
    expect(result.selectedRegistrationUnavailable).toBe(true);
    expect(result.counts.all).toBe(1);
  });

  it("retains the roster convenience view with a server-side approved/waitlisted predicate", async () => {
    const db = database(STATUSES.map((status, index) => registration(index + 1, status)));
    const result = await loadAdminTournamentRegistrationWorkspace(tournament(), divisions, { section: "players-waitlist" });
    expect(result.counts.all).toBe(2);
    expect(result.rows.map((row) => row.status)).toEqual(["approved", "waitlisted"]);
    expect(db.calls.find((call) => call.columns.includes("admin_notes"))?.includes).toEqual([["registration_status", ["approved", "waitlisted"]]]);
    expect(getSafeAdminTournamentRegistrationFilter("waitlisted", "registrations")).toBe("waitlisted");
    expect(getSafeAdminTournamentRegistrationFilter("pending", "players-waitlist")).toBe("all");
  });

  it.each([["999", 3], ["-1", 1], ["0", 1], ["2.5", 1], ["99999999999999999999999", 1]])("bounds page %s safely", async (requested, expected) => {
    database(Array.from({ length: 60 }, (_, index) => registration(index + 1)));
    const result = await loadAdminTournamentRegistrationWorkspace(tournament(), divisions, { section: "registrations", page: requested });
    expect(result.page).toBe(expected);
  });

  it("keeps empty tournament counts factual without reading any rich records", async () => {
    const db = database([]);
    const result = await loadAdminTournamentRegistrationWorkspace(tournament(), divisions, { section: "registrations", page: "8" });
    expect(result).toMatchObject({ rows: [], page: 1, pageCount: 1, filteredCount: 0, selectedRegistration: null });
    expect(db.calls).toHaveLength(2);
    expect(db.calls[1].head).toBe(true);
  });

  it("fails closed instead of showing a partial summary when a later capped batch fails", async () => {
    const db = database(Array.from({ length: 20 }, (_, index) => registration(index + 1)), 7, 1);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(loadAdminTournamentRegistrationSummary(TOURNAMENT_A)).rejects.toThrow("could not be loaded");
    expect(db.calls).toHaveLength(2);
  });

  it("restarts the standalone summary after a count drift between capped batches", async () => {
    const records = Array.from({ length: 8 }, (_, index) => registration(index + 1));
    let added = false;
    const db = database(records, 7, undefined, (call) => {
      if (!added && call.range?.[0] === 7) {
        records.push(registration(9));
        added = true;
      }
    });
    const result = await loadAdminTournamentRegistrationSummary(TOURNAMENT_A);
    expect(result.map((row) => row.id)).toEqual(records.map((row) => row.id));
    expect(db.calls.map((call) => call.range?.[0])).toEqual([0, 7, 0, 7]);
  });

  it("normalizes UUID casing before checking returned tournament associations", async () => {
    const tournamentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const db = database([registration(1, "pending", tournamentId)]);
    const result = await loadAdminTournamentRegistrationSummary(tournamentId.toUpperCase());
    expect(result).toHaveLength(1);
    expect(db.calls[0].equals).toContainEqual(["tournament_id", tournamentId]);
  });

  it("authorizes both exported loaders before creating a service-role client", async () => {
    mocks.auth.mockResolvedValue({ userId: "player", sessionClaims: { metadata: { role: "player" } } });
    await expect(loadAdminTournamentRegistrationSummary(TOURNAMENT_A)).rejects.toThrow("Unauthorized");
    await expect(loadAdminTournamentRegistrationWorkspace(tournament(), divisions, { section: "registrations" })).rejects.toThrow("Unauthorized");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
