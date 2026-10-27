import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { readCompetitionPage } from "@/lib/competition-read-models/read-page";
import { loadTournamentCompetitionList } from "@/lib/competition-read-models/tournament-list";
import { loadPlayerCompetitionHistory } from "@/lib/competition-read-models/players";

const rangeError = {
  data: null,
  error: {
    code: "PGRST103",
    message: "opaque provider wording; do not parse",
    details: "also opaque",
  },
  count: null,
  status: 416,
};
const head = (count: number | null = 2) => ({
  data: null,
  error: null,
  count,
  status: 200,
});

describe("strict empty counted-page confirmation", () => {
  it("leaves a successful page unchanged without another query", async () => {
    const result = {
      data: [{ id: "row" }],
      error: null,
      count: 2,
      status: 206,
    };
    const confirm = vi.fn();
    expect(await readCompetitionPage(Promise.resolve(result), 1, confirm)).toBe(
      result,
    );
    expect(confirm).not.toHaveBeenCalled();
  });
  it.each([0, 2, 10000])(
    "accepts a fresh exact count %s only at or beyond the end",
    async (count) => {
      expect(
        await readCompetitionPage(Promise.resolve(rangeError), 10000, () =>
          Promise.resolve(head(count)),
        ),
      ).toEqual({ data: [], error: null, count, status: 200 });
    },
  );
  it.each([
    { ...rangeError, status: 400 },
    { ...rangeError, status: 500 },
    { ...rangeError, error: { code: "PGRST100" } },
    { ...rangeError, error: { code: "42501" } },
    { ...rangeError, error: { code: "PGRST000" } },
    { ...rangeError, error: { message: "PGRST103" } },
    { ...rangeError, data: [{ id: "unexpected" }] },
  ])("never normalizes another failure shape", async (response) => {
    const confirm = vi.fn();
    await expect(
      readCompetitionPage(Promise.resolve(response), 10000, confirm),
    ).rejects.toMatchObject({
      code: "QUERY_FAILED",
      message: "Competition data is unavailable.",
    });
    expect(confirm).not.toHaveBeenCalled();
  });
  it("does not normalize an offset-zero range error", async () => {
    const confirm = vi.fn();
    await expect(
      readCompetitionPage(Promise.resolve(rangeError), 0, confirm),
    ).rejects.toMatchObject({ code: "QUERY_FAILED" });
    expect(confirm).not.toHaveBeenCalled();
  });
  it.each([
    head(null),
    head(-1),
    head(1.5),
    head(10001),
    { ...head(), status: 416 },
    { ...head(), status: undefined },
    { ...head(), status: NaN },
    { ...head(), data: [] },
    { ...head(), error: { code: "PGRST000" } },
  ])(
    "fails closed when the count cannot confirm an empty page",
    async (response) => {
      await expect(
        readCompetitionPage(Promise.resolve(rangeError), 10000, () =>
          Promise.resolve(response),
        ),
      ).rejects.toMatchObject({ code: "QUERY_FAILED" });
    },
  );
  it("redacts a failed confirmation promise", async () => {
    await expect(
      readCompetitionPage(Promise.resolve(rangeError), 10000, () =>
        Promise.reject(new Error("private-provider-secret")),
      ),
    ).rejects.toMatchObject({
      code: "QUERY_FAILED",
      message: "Competition data is unavailable.",
    });
  });
});

const playerId = "00000000-0000-4000-8000-000000000001";
function transport(
  options: { count?: number; closedOnRecheck?: boolean } = {},
) {
  const calls: Array<{ url: URL; method: string; prefer: string | null }> = [];
  let playerReads = 0;
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method =
      init?.method ?? (input instanceof Request ? input.method : "GET");
    calls.push({
      url,
      method,
      prefer: new Headers(init?.headers).get("prefer"),
    });
    if (url.pathname === "/rest/v1/players" && method === "GET") {
      playerReads++;
      const row = {
        id: playerId,
        coh3_profile_id: "123456",
        in_game_name: "Public alias",
        display_name: "Public alias",
        public_profile_enabled: false,
        account_closed_at:
          options.closedOnRecheck && playerReads > 1
            ? "2026-10-27T00:00:00.000Z"
            : null,
      };
      return new Response(JSON.stringify([row]), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "content-range": "0-0/1",
        },
      });
    }
    if (
      (url.pathname === "/rest/v1/registrations" ||
        url.pathname === "/rest/v1/tournaments") &&
      method === "GET"
    ) {
      return new Response(JSON.stringify(rangeError.error), {
        status: 416,
        headers: { "content-type": "application/json", "content-range": "*/2" },
      });
    }
    if (
      (url.pathname === "/rest/v1/registrations" ||
        url.pathname === "/rest/v1/tournaments") &&
      method === "HEAD"
    ) {
      return new Response(null, {
        status: 200,
        headers: { "content-range": `*/${options.count ?? 2}` },
      });
    }
    throw new Error("Unexpected synthetic transport request");
  });
  const client = createClient(
    "https://synthetic.supabase.invalid",
    "test-only-publishable-key",
    {
      global: { fetch },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );
  return { client, calls };
}

describe("bundled Supabase transport regression", () => {
  it("demonstrates the SDK drops an error response's Content-Range count", async () => {
    const db = transport();
    const result = await db.client
      .from("tournaments")
      .select("id", { count: "exact" })
      .range(10000, 10010);
    expect(result).toMatchObject({
      status: 416,
      error: { code: "PGRST103" },
      count: null,
      data: null,
    });
  });
  it("returns an empty tournament page after a fresh same-filter HEAD count", async () => {
    const db = transport();
    const result = await loadTournamentCompetitionList(db.client, {
      offset: 10000,
      limit: 10,
      status: "completed",
    });
    expect(result.data).toEqual([]);
    expect(result.pagination).toEqual({
      offset: 10000,
      limit: 10,
      hasMore: false,
      nextOffset: null,
      truncated: false,
    });
    expect(db.calls.map((call) => call.method)).toEqual(["GET", "HEAD"]);
    expect(db.calls[1].url.searchParams.get("status")).toBe(
      db.calls[0].url.searchParams.get("status"),
    );
    expect(db.calls[1].url.searchParams.get("select")).toBe("id");
    expect(db.calls[1].url.searchParams.has("offset")).toBe(false);
    expect(db.calls[1].url.searchParams.has("limit")).toBe(false);
    expect(db.calls[1].prefer).toContain("count=exact");
  });
  it("returns visible empty player history while retaining final privacy and canonical-binding checks", async () => {
    const db = transport();
    const result = await loadPlayerCompetitionHistory(db.client, "123456", {
      offset: 10000,
      limit: 10,
    });
    expect(result.outcome).toBe("FOUND_VISIBLE");
    if (result.outcome !== "FOUND_VISIBLE")
      throw new Error("Expected public player");
    expect(result.player.entries).toEqual([]);
    expect(result.player.aggregate.matchesPlayed).toBe(0);
    expect(result.player.coverage.hasMore).toBe(false);
    expect(db.calls.map((call) => call.method)).toEqual([
      "GET",
      "GET",
      "HEAD",
      "GET",
    ]);
    const page = db.calls[1].url.searchParams;
    const confirmation = db.calls[2].url.searchParams;
    expect(confirmation.get("profile_id")).toBe(page.get("profile_id"));
    expect(confirmation.get("registration_status")).toBe(
      page.get("registration_status"),
    );
    expect(confirmation.has("offset")).toBe(false);
    expect(db.calls.at(-1)?.url.searchParams.get("id")).toBe(`eq.${playerId}`);
  });
  it("does not disclose player history when visibility changes during the empty-page confirmation", async () => {
    const db = transport({ closedOnRecheck: true });
    await expect(
      loadPlayerCompetitionHistory(db.client, "123456", { offset: 10000 }),
    ).resolves.toEqual({ outcome: "HIDDEN" });
  });
  it("does not swallow a range error when a fresh count shows the offset should contain data", async () => {
    const db = transport({ count: 10001 });
    await expect(
      loadTournamentCompetitionList(db.client, { offset: 10000 }),
    ).rejects.toMatchObject({ code: "QUERY_FAILED" });
  });
});
