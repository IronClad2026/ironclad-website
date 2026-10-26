import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadTournamentCompetitionList,
  PUBLIC_TOURNAMENT_LIST_STATUSES,
} from "@/lib/competition-read-models/tournament-list";
import type { CompetitionReadClient } from "@/lib/competition-read-models/shared";
import type { TournamentCompetitionView } from "@/lib/competition-read-models/tournaments";

const { loadViews } = vi.hoisted(() => ({ loadViews: vi.fn() }));
vi.mock("@/lib/competition-read-models/tournaments", () => ({
  loadTournamentCompetitionViews: loadViews,
}));

const id = (number: number) =>
  `00000000-0000-4000-8000-${number.toString().padStart(12, "0")}`;
function view(
  number: number,
  status: TournamentCompetitionView["status"] = "registration_open",
): TournamentCompetitionView {
  return {
    schemaVersion: "ironclad.competition.v1",
    id: id(number),
    slug: `event-${number}`,
    name: `Event ${number}`,
    divisionModelVersion: "four_division_v1",
    status,
    format: "1v1",
    game: "Company of Heroes 3",
    publicUrl: `https://www.ironcladtournaments.com/tournaments?tournament=event-${number}`,
    registration: {
      open: true,
      enabled: true,
      opensAt: null,
      closesAt: null,
      availability: "open",
    },
    startDate: null,
    endDate: null,
    firstCompletedAt: null,
    approvedPlayers: 0,
    divisions: [],
  };
}
function database(
  options: {
    ids?: unknown[];
    count?: number | null;
    error?: unknown;
    reject?: boolean;
    raw?: unknown;
  } = {},
) {
  const values = options.ids ?? [id(1)];
  const call = {
    select: [] as unknown[],
    memberships: [] as unknown[],
    orders: [] as unknown[],
    range: [] as number[],
    limit: 0,
  };
  const query = {
    select(columns: string, args: unknown) {
      call.select = [columns, args];
      return query;
    },
    in(key: string, value: unknown) {
      call.memberships.push([key, value]);
      return query;
    },
    order(key: string, value: unknown) {
      call.orders.push([key, value]);
      return query;
    },
    range(from: number, to: number) {
      call.range = [from, to];
      return query;
    },
    limit(value: number) {
      call.limit = value;
      return query;
    },
    then(
      resolve: (result: unknown) => unknown,
      reject: (error: unknown) => unknown,
    ) {
      if (options.reject)
        return Promise.reject(new Error("private-network-detail")).then(
          resolve,
          reject,
        );
      if ("raw" in options)
        return Promise.resolve(options.raw).then(resolve, reject);
      return Promise.resolve({
        data: values.map((value) => ({ id: value })),
        error: options.error ?? null,
        count: "count" in options ? options.count : values.length,
      }).then(resolve, reject);
    },
  };
  const from = vi.fn(() => query);
  return { client: { from } as unknown as CompetitionReadClient, call, from };
}

describe("bounded public tournament listing", () => {
  beforeEach(() => {
    loadViews.mockReset();
    loadViews.mockResolvedValue([view(1)]);
  });
  it("uses default five-entry discovery with native public status policy and one existing-selector batch", async () => {
    const db = database();
    const result = await loadTournamentCompetitionList(db.client, { now: 123 });
    expect(db.from).toHaveBeenCalledExactlyOnceWith("tournaments");
    expect(db.call).toEqual({
      select: ["id", { count: "exact" }],
      memberships: [["status", [...PUBLIC_TOURNAMENT_LIST_STATUSES]]],
      orders: [
        ["created_at", { ascending: false }],
        ["id", { ascending: false }],
      ],
      range: [0, 5],
      limit: 6,
    });
    expect(loadViews).toHaveBeenCalledExactlyOnceWith(db.client, [id(1)], {
      now: 123,
    });
    expect(result).toEqual({
      schemaVersion: "ironclad.competition.v1",
      data: [view(1)],
      pagination: {
        offset: 0,
        limit: 5,
        hasMore: false,
        nextOffset: null,
        truncated: false,
      },
    });
    expect(result).not.toHaveProperty("count");
  });
  it.each(PUBLIC_TOURNAMENT_LIST_STATUSES)(
    "accepts the supported %s filter",
    async (status) => {
      loadViews.mockResolvedValue([view(1, status)]);
      const db = database();
      const result = await loadTournamentCompetitionList(db.client, { status });
      expect(db.call.memberships).toEqual([["status", [status]]]);
      expect(result.data[0].status).toBe(status);
    },
  );
  it("loads at most ten views and uses the extra candidate only for pagination", async () => {
    loadViews.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => view(i + 1)),
    );
    const db = database({
      ids: Array.from({ length: 11 }, (_, i) => id(i + 1)),
      count: 20,
    });
    const result = await loadTournamentCompetitionList(db.client, {
      limit: 10,
    });
    expect(result.data).toHaveLength(10);
    expect(loadViews.mock.calls[0][1]).toHaveLength(10);
    expect(result.pagination).toEqual({
      offset: 0,
      limit: 10,
      hasMore: true,
      nextOffset: 10,
      truncated: false,
    });
  });
  it("preserves candidate order even if the batch selector returns another order", async () => {
    loadViews.mockResolvedValue([view(2), view(1)]);
    const result = await loadTournamentCompetitionList(
      database({ ids: [id(1), id(2)] }).client,
    );
    expect(result.data.map((value) => value.id)).toEqual([id(1), id(2)]);
  });
  it("reports a retrieval cap honestly without returning an unusable next offset", async () => {
    loadViews.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => view(i + 1)),
    );
    const ids = Array.from({ length: 11 }, (_, i) => id(i + 1));
    const capped = await loadTournamentCompetitionList(
      database({ ids, count: 10011 }).client,
      { offset: 10000, limit: 10 },
    );
    expect(capped.pagination).toEqual({
      offset: 10000,
      limit: 10,
      hasMore: true,
      nextOffset: null,
      truncated: true,
    });
    const lastSupported = await loadTournamentCompetitionList(
      database({ ids, count: 10001 }).client,
      { offset: 9990, limit: 10 },
    );
    expect(lastSupported.pagination).toEqual({
      offset: 9990,
      limit: 10,
      hasMore: true,
      nextOffset: 10000,
      truncated: false,
    });
  });
  it("advances offset by scanned candidates when current status no longer matches", async () => {
    loadViews.mockResolvedValue([view(2, "cancelled")]);
    const db = database({ ids: [id(2), id(3)], count: 4 });
    const result = await loadTournamentCompetitionList(db.client, {
      offset: 1,
      limit: 1,
    });
    expect(db.call.range).toEqual([1, 2]);
    expect(result.data).toEqual([]);
    expect(result.pagination).toEqual({
      offset: 1,
      limit: 1,
      hasMore: true,
      nextOffset: 2,
      truncated: false,
    });
  });
  it("does not return a different allowed status after a filtered candidate changes", async () => {
    loadViews.mockResolvedValue([view(1, "completed")]);
    expect(
      (
        await loadTournamentCompetitionList(database().client, {
          status: "registration_open",
        })
      ).data,
    ).toEqual([]);
  });
  it("returns an empty page without querying detail authority", async () => {
    const result = await loadTournamentCompetitionList(
      database({ ids: [], count: 0 }).client,
    );
    expect(result.data).toEqual([]);
    expect(result.pagination.hasMore).toBe(false);
    expect(loadViews).not.toHaveBeenCalled();
  });
  it.each([
    { limit: 0 },
    { limit: 11 },
    { limit: 1.5 },
    { offset: -1 },
    { offset: 10001 },
    { offset: NaN },
    { status: "draft" },
    { status: "cancelled" },
    { status: "voided" },
    { status: "unknown" },
    { now: NaN },
  ])("rejects unsafe input %o before a query", async (options) => {
    const db = database();
    await expect(
      loadTournamentCompetitionList(db.client, options as never),
    ).rejects.toMatchObject({ code: "INVALID_DATA" });
    expect(db.from).not.toHaveBeenCalled();
  });
  it.each([null, -1, 1.5])("requires a valid exact count %s", async (count) => {
    await expect(
      loadTournamentCompetitionList(database({ count }).client),
    ).rejects.toMatchObject({ code: "INVALID_DATA" });
  });
  it("fails on a lower server cap rather than silently reporting complete pagination", async () => {
    await expect(
      loadTournamentCompetitionList(database({ count: 6 }).client),
    ).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
  });
  it("fails on a row sentinel overflow, duplicate ID or malformed identity", async () => {
    await expect(
      loadTournamentCompetitionList(
        database({ ids: Array.from({ length: 7 }, (_, i) => id(i + 1)) })
          .client,
      ),
    ).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
    await expect(
      loadTournamentCompetitionList(database({ ids: [id(1), id(1)] }).client),
    ).rejects.toMatchObject({ code: "INVALID_DATA" });
    await expect(
      loadTournamentCompetitionList(database({ ids: ["bad-id"] }).client),
    ).rejects.toMatchObject({ code: "INVALID_DATA" });
  });
  it.each([{ reject: true }, { error: { message: "private-provider-error" } }])(
    "sanitizes query failures",
    async (options) => {
      await expect(
        loadTournamentCompetitionList(database(options).client),
      ).rejects.toMatchObject({
        code: "QUERY_FAILED",
        message: "Competition data is unavailable.",
      });
    },
  );
  it.each([null, { data: null, error: null, count: 0 }])(
    "fails closed on malformed query responses",
    async (raw) => {
      await expect(
        loadTournamentCompetitionList(database({ raw }).client),
      ).rejects.toMatchObject({ code: "INVALID_DATA" });
    },
  );
  it("refuses missing or extraneous detail authorities", async () => {
    loadViews.mockResolvedValue([]);
    await expect(
      loadTournamentCompetitionList(database().client),
    ).rejects.toMatchObject({ code: "INVALID_DATA" });
    loadViews.mockResolvedValue([view(2)]);
    await expect(
      loadTournamentCompetitionList(database().client),
    ).rejects.toMatchObject({ code: "INVALID_DATA" });
  });
});
