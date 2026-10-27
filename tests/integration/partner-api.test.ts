import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as list } from "@/app/api/partners/v1/tournaments/route";
import { GET as detail } from "@/app/api/partners/v1/tournaments/[slug]/route";
import { GET as history } from "@/app/api/partners/v1/players/[relicProfileId]/tournaments/route";
import { projectPublicPlayerCompetitionLookup } from "@/lib/competition-read-models/players";

const mocks = vi.hoisted(() => ({
  client: vi.fn(() => ({ from: vi.fn() })),
  list: vi.fn(),
  detail: vi.fn(),
  player: vi.fn(),
}));
vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: mocks.client,
}));
vi.mock("@/lib/competition-read-models/tournament-list", () => ({
  loadTournamentCompetitionList: mocks.list,
}));
vi.mock("@/lib/competition-read-models/tournaments", () => ({
  loadTournamentCompetitionView: mocks.detail,
}));
vi.mock("@/lib/competition-read-models/players", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/competition-read-models/players")
  >()),
  loadPlayerCompetitionHistory: mocks.player,
}));

const TOKEN = "test-only-partner-token-not-a-real-secret-123";
const VERSION = "ironclad.competition.v1";
function request(path: string, token: string | null = TOKEN) {
  return new Request(`https://staging.invalid/api/partners/v1/${path}`, {
    headers: token === null ? {} : { "X-Api-Token": token },
  });
}
function player(entries: object[] = []) {
  return {
    outcome: "FOUND_VISIBLE" as const,
    player: {
      schemaVersion: VERSION,
      relicProfileId: "123456",
      currentIdentity: {
        alias: "Competitor",
        profileUrl: "https://www.ironcladtournaments.com/players/public-id",
      },
      entries,
      aggregate: {
        scope: "returned_entries",
        tournamentsEntered: entries.length,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        titles: 0,
      },
      coverage: {
        scope: "returned_entries",
        offset: 0,
        limit: 10,
        scannedCandidates: 0,
        returnedEntries: entries.length,
        hasMore: false,
        nextOffset: null as number | null,
      },
    },
  };
}

beforeEach(() => {
  vi.stubEnv("COH3STATS_API_TOKEN", TOKEN);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  mocks.list.mockResolvedValue({
    data: [],
    pagination: { limit: 5, offset: 0, hasMore: false, nextOffset: null },
  });
  mocks.detail.mockResolvedValue({
    schemaVersion: VERSION,
    slug: "hold-the-line",
    status: "registration_open",
    divisions: [],
  });
  mocks.player.mockResolvedValue(player());
});

describe("authenticated partner route boundary", () => {
  it.each([null, "wrong-token", "Bearer " + TOKEN, TOKEN + ",other"])(
    "rejects bad authentication before selectors: %s",
    async (token) => {
      const response = await list(request("tournaments", token));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        schemaVersion: VERSION,
        error: "unauthorized",
      });
      expect(mocks.client).not.toHaveBeenCalled();
      expect(mocks.list).not.toHaveBeenCalled();
    },
  );
  it("does not accept query-string authentication", async () => {
    expect(
      (await list(request(`tournaments?token=${TOKEN}`, null))).status,
    ).toBe(401);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("rejects unavailable configuration", async () => {
    vi.stubEnv("COH3STATS_API_TOKEN", "");
    expect((await list(request("tournaments"))).status).toBe(401);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("validates pagination and preserves bounded filter options", async () => {
    const response = await list(
      request("tournaments?status=completed&limit=10&offset=10"),
    );
    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(expect.anything(), {
      status: "completed",
      limit: 10,
      offset: 10,
    });
    expect(await response.json()).toMatchObject({
      schemaVersion: VERSION,
      data: [],
    });
  });
  it.each([
    "limit=0",
    "limit=11",
    "limit=100000",
    "offset=-1",
    "offset=10001",
    "limit=01",
    "limit=1.5",
    "status=draft",
    "status=cancelled",
    "limit=2&limit=3",
    "token=secret",
    "alias=name",
  ])("rejects malformed list parameters: %s", async (query) => {
    expect((await list(request(`tournaments?${query}`))).status).toBe(400);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("uses only the allow-listed selector result", async () => {
    const response = await detail(request("tournaments/hold-the-line"), {
      params: Promise.resolve({ slug: "hold-the-line" }),
    });
    expect(response.status).toBe(200);
    expect(mocks.detail).toHaveBeenCalledWith(
      expect.anything(),
      "hold-the-line",
    );
    const json = await response.json();
    expect(json.data.slug).toBe("hold-the-line");
    expect(JSON.stringify(json)).not.toMatch(
      /clerk|email|discord|replay|service_role/,
    );
  });
  it.each(["123456", null])(
    "includes the additive canonical participant Relic identity %s and a public player URL",
    async (relicProfileId) => {
      const participant = {
        registrationId: "00000000-0000-4000-8000-000000000001",
        eventAlias: "Competitor",
        eventElo: 1500,
        registrationStatus: "approved",
        profileUrl: "https://www.ironcladtournaments.com/players/00000000-0000-4000-8000-000000000002",
        relicProfileId,
      };
      mocks.detail.mockResolvedValue({
        schemaVersion: VERSION,
        divisions: [{ participants: [participant] }],
      });
      const response = await detail(request("tournaments/hold-the-line"), {
        params: Promise.resolve({ slug: "hold-the-line" }),
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.divisions[0].participants[0]).toEqual(participant);
      expect(JSON.stringify(body)).not.toMatch(
        /clerk|email|discord|steam|legal_receipt|ip_address|admin_notes|moderation|notification|payload|storage_path|signed_url|service_role|audit/,
      );
    },
  );
  it("withholds unavailable tournaments", async () => {
    mocks.detail.mockResolvedValue(null);
    const response = await detail(request("tournaments/unknown"), {
      params: Promise.resolve({ slug: "unknown" }),
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      schemaVersion: VERSION,
      error: "tournament_not_available",
    });
  });
  it.each(["cancelled", "voided"])(
    "retains %s event direct-reference history",
    async (status) => {
      mocks.detail.mockResolvedValue({ status });
      const response = await detail(request("tournaments/historical"), {
        params: Promise.resolve({ slug: "historical" }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ data: { status } });
    },
  );
  it.each(["../private", "not_valid", "UPPER", "a".repeat(101)])(
    "validates slug before database access",
    async (slug) => {
      expect(
        (
          await detail(request("tournaments/invalid"), {
            params: Promise.resolve({ slug }),
          })
        ).status,
      ).toBe(400);
      expect(mocks.client).not.toHaveBeenCalled();
    },
  );
  it("returns visible empty history as 200 and omits private coverage", async () => {
    const response = await history(request("players/123456/tournaments"), {
      params: Promise.resolve({ relicProfileId: "123456" }),
    });
    expect(response.status).toBe(200);
    expect(mocks.player).toHaveBeenCalledWith(expect.anything(), "123456", {
      limit: 10,
      offset: 0,
    });
    const json = await response.json();
    expect(json.data.entries).toEqual([]);
    expect(json.data.coverage).toBeUndefined();
    expect(json.pagination).toEqual({ limit: 10, offset: 0 });
    expect(projectPublicPlayerCompetitionLookup).toBeTypeOf("function");
  });
  it("does not disclose unpublished candidate pagination", async () => {
    const value = player();
    value.player.coverage = {
      ...value.player.coverage,
      scannedCandidates: 10,
      hasMore: true,
      nextOffset: 10,
    };
    mocks.player.mockResolvedValue(value);
    const response = await history(request("players/123456/tournaments"), {
      params: Promise.resolve({ relicProfileId: "123456" }),
    });
    const json = await response.json();
    expect(json.data.entries).toEqual([]);
    expect(json.pagination).toEqual({ limit: 10, offset: 0 });
    expect(JSON.stringify(json)).not.toMatch(
      /hasMore|nextOffset|scannedCandidates|coverage/,
    );
  });
  it("makes hidden and unknown response bodies/status identical", async () => {
    const replies = [];
    for (const outcome of ["HIDDEN", "NOT_FOUND"]) {
      mocks.player.mockResolvedValue({ outcome });
      const response = await history(request("players/123456/tournaments"), {
        params: Promise.resolve({ relicProfileId: "123456" }),
      });
      replies.push({ status: response.status, body: await response.json() });
    }
    expect(replies[0]).toEqual(replies[1]);
    expect(replies[0]).toEqual({
      status: 404,
      body: { schemaVersion: VERSION, error: "player_not_available" },
    });
  });
  it.each(["0", "-1", "01", "1.0", "1e3", "name", "1".repeat(21)])(
    "rejects invalid canonical ID: %s",
    async (id) => {
      expect(
        (
          await history(request("players/invalid/tournaments"), {
            params: Promise.resolve({ relicProfileId: id }),
          })
        ).status,
      ).toBe(400);
      expect(mocks.client).not.toHaveBeenCalled();
    },
  );
  it.each(["list", "detail", "player"] as const)(
    "redacts unexpected %s errors",
    async (target) => {
      mocks[target].mockRejectedValue(
        new Error("private-database-secret-and-stack"),
      );
      const response =
        target === "list"
          ? await list(request("tournaments"))
          : target === "detail"
            ? await detail(request("tournaments/event"), {
                params: Promise.resolve({ slug: "event" }),
              })
            : await history(request("players/123/tournaments"), {
                params: Promise.resolve({ relicProfileId: "123" }),
              });
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        schemaVersion: VERSION,
        error: "internal_error",
      });
      expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toMatch(
        /private-database-secret-and-stack/,
      );
    },
  );
  it("disables caching and logs only safe telemetry", async () => {
    const response = await list(request("tournaments"));
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("server-timing")).toMatch(
      /auth;dur=.*selector;dur=.*total;dur=/,
    );
    expect(console.info).toHaveBeenCalledWith(
      "partner_api_request",
      expect.objectContaining({
        partner: "coh3stats",
        endpoint: "tournaments.list",
        status: 200,
      }),
    );
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain(
      TOKEN,
    );
  });
});
