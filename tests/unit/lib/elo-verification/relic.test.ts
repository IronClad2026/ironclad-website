import { afterEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { getIronCladDivision } from "@/lib/elo-verification/divisions";
import {
  getRelic1v1Elo,
  RELIC_ELO_CALCULATION_VERSION,
  selectRelic1v1Elo,
} from "@/lib/elo-verification/relic";
import { mockServer } from "@/tests/mocks/server";

const RELIC_ENDPOINT =
  "https://coh3-api.reliclink.com/community/leaderboard/getpersonalstat";
const STEAM_ID64 = "18446744073709551615";
const PROFILE_NAME = `/steam/${STEAM_ID64}`;
const OTHER_STEAM_ID64 = "76561198000000000";
const GROUP_ID = 7_001;
const OTHER_GROUP_ID = 7_002;
const PRIVATE_ALIAS = "alias-must-not-leak";
const RAW_RESPONSE_MARKER = "raw-response-must-not-leak";

type JsonRecord = Record<string, unknown>;

function createMember(overrides: JsonRecord = {}): JsonRecord {
  return {
    profile_id: 42,
    name: PROFILE_NAME,
    alias: PRIVATE_ALIAS,
    personal_statgroup_id: GROUP_ID,
    ...overrides,
  };
}

function createGroup(overrides: JsonRecord = {}): JsonRecord {
  return {
    id: GROUP_ID,
    members: [createMember()],
    ...overrides,
  };
}

function createRow(overrides: JsonRecord = {}): JsonRecord {
  return {
    statgroup_id: GROUP_ID,
    leaderboard_id: 2_130_255,
    rating: 1_200,
    highestrating: 9_999,
    wins: 1,
    losses: 0,
    lastmatchdate: 1_700_000_000,
    rank: -1,
    ...overrides,
  };
}

function createPayload(overrides: JsonRecord = {}): JsonRecord {
  return {
    result: { code: 0, message: "SUCCESS" },
    statGroups: [createGroup()],
    leaderboardStats: [createRow()],
    ...overrides,
  };
}

function mockRelicJson(payload: JsonRecord = createPayload(), status = 200) {
  const requestSpy = vi.fn();

  mockServer.use(
    http.get(RELIC_ENDPOINT, ({ request }) => {
      requestSpy(request);
      return HttpResponse.json(payload, { status });
    })
  );

  return requestSpy;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getIronCladDivision", () => {
  it.each([
    [0, "Academy"],
    [1_099, "Academy"],
    [1_100, "Challenge"],
    [1_399, "Challenge"],
    [1_400, "Main / Pro"],
  ] as const)("maps %i ELO to %s", (elo, division) => {
    expect(getIronCladDivision(elo)).toEqual({ ok: true, division });
  });

  it.each([
    -1,
    1_200.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects invalid ELO %s", (elo) => {
    expect(getIronCladDivision(elo)).toEqual({
      ok: false,
      reason: "invalid_elo",
    });
  });
});

describe("selectRelic1v1Elo", () => {
  it("returns the one valid faction with the exact rated contract", () => {
    expect(selectRelic1v1Elo(createPayload(), STEAM_ID64)).toEqual({
      status: "rated",
      elo: 1_200,
      faction: "US Forces",
      division: "Challenge",
      calculationVersion: RELIC_ELO_CALCULATION_VERSION,
    });
  });

  it.each([
    [2_130_255, "US Forces"],
    [2_130_257, "British Forces"],
    [2_130_259, "Deutsches Afrikakorps"],
    [2_130_261, "Wehrmacht"],
  ] as const)("maps leaderboard %i to %s", (leaderboardId, faction) => {
    const payload = createPayload({
      leaderboardStats: [createRow({ leaderboard_id: leaderboardId })],
    });

    expect(selectRelic1v1Elo(payload, STEAM_ID64)).toEqual({
      status: "rated",
      elo: 1_200,
      faction,
      division: "Challenge",
      calculationVersion: RELIC_ELO_CALCULATION_VERSION,
    });
  });

  it("selects the highest current rating across multiple valid factions", () => {
    const payload = createPayload({
      leaderboardStats: [
        createRow({ leaderboard_id: 2_130_255, rating: 1_250 }),
        createRow({ leaderboard_id: 2_130_257, rating: 1_420 }),
        createRow({ leaderboard_id: 2_130_261, rating: 1_350 }),
      ],
    });

    expect(selectRelic1v1Elo(payload, STEAM_ID64)).toEqual({
      status: "rated",
      elo: 1_420,
      faction: "British Forces",
      division: "Main / Pro",
      calculationVersion: RELIC_ELO_CALCULATION_VERSION,
    });
  });

  it("uses current rating and never highestrating", () => {
    const payload = createPayload({
      leaderboardStats: [
        createRow({
          leaderboard_id: 2_130_255,
          rating: 1_200,
          highestrating: 9_999,
        }),
        createRow({
          leaderboard_id: 2_130_261,
          rating: 1_300,
          highestrating: 1_300,
        }),
      ],
    });

    expect(selectRelic1v1Elo(payload, STEAM_ID64)).toMatchObject({
      status: "rated",
      elo: 1_300,
      faction: "Wehrmacht",
    });
  });

  it("prefers the newest valid lastmatchdate when ratings tie", () => {
    const payload = createPayload({
      leaderboardStats: [
        createRow({
          leaderboard_id: 2_130_255,
          rating: 1_300,
          lastmatchdate: 100,
        }),
        createRow({
          leaderboard_id: 2_130_257,
          rating: 1_300,
          lastmatchdate: 200,
        }),
      ],
    });

    expect(selectRelic1v1Elo(payload, STEAM_ID64)).toMatchObject({
      status: "rated",
      faction: "British Forces",
    });
  });

  it("prefers the lowest leaderboard ID when rating and match date tie", () => {
    const payload = createPayload({
      leaderboardStats: [
        createRow({
          leaderboard_id: 2_130_261,
          rating: 1_300,
          lastmatchdate: 200,
        }),
        createRow({
          leaderboard_id: 2_130_255,
          rating: 1_300,
          lastmatchdate: 200,
        }),
      ],
    });

    expect(selectRelic1v1Elo(payload, STEAM_ID64)).toMatchObject({
      status: "rated",
      faction: "US Forces",
    });
  });

  it("treats a valid epoch-zero match date as newer than an invalid date", () => {
    const payload = createPayload({
      leaderboardStats: [
        createRow({
          leaderboard_id: 2_130_255,
          rating: 1_300,
          lastmatchdate: "invalid",
        }),
        createRow({
          leaderboard_id: 2_130_257,
          rating: 1_300,
          lastmatchdate: 0,
        }),
      ],
    });

    expect(selectRelic1v1Elo(payload, STEAM_ID64)).toMatchObject({
      status: "rated",
      faction: "British Forces",
    });
  });

  it("ignores team-game leaderboard rows", () => {
    const payload = createPayload({
      leaderboardStats: [
        createRow({ leaderboard_id: 2_130_300, rating: 3_000 }),
        createRow({ leaderboard_id: 2_130_255, rating: 1_100 }),
      ],
    });

    expect(selectRelic1v1Elo(payload, STEAM_ID64)).toMatchObject({
      status: "rated",
      elo: 1_100,
      faction: "US Forces",
    });
  });

  it("ignores arbitrary unapproved leaderboard rows", () => {
    const payload = createPayload({
      leaderboardStats: [
        createRow({ leaderboard_id: 9_999_999, rating: 4_000 }),
        createRow({ leaderboard_id: 2_130_259, rating: 1_050 }),
      ],
    });

    expect(selectRelic1v1Elo(payload, STEAM_ID64)).toMatchObject({
      status: "rated",
      elo: 1_050,
      faction: "Deutsches Afrikakorps",
    });
  });

  it("ignores approved rows joined to a different stat group", () => {
    const payload = createPayload({
      statGroups: [
        createGroup({
          id: OTHER_GROUP_ID,
          members: [
            createMember({
              name: `/steam/${OTHER_STEAM_ID64}`,
              personal_statgroup_id: OTHER_GROUP_ID,
            }),
          ],
        }),
        createGroup(),
      ],
      leaderboardStats: [
        createRow({ statgroup_id: OTHER_GROUP_ID, rating: 3_000 }),
        createRow({ rating: 1_200 }),
      ],
    });

    expect(selectRelic1v1Elo(payload, STEAM_ID64)).toMatchObject({
      status: "rated",
      elo: 1_200,
    });
  });

  it("rejects duplicate rows for an approved leaderboard", () => {
    const payload = createPayload({
      leaderboardStats: [
        createRow({ leaderboard_id: 2_130_255 }),
        createRow({ leaderboard_id: 2_130_255, rating: 1_300 }),
      ],
    });

    expect(selectRelic1v1Elo(payload, STEAM_ID64)).toEqual({
      status: "invalid_relic_response",
    });
  });

  it("discards a malformed approved row when a valid played row remains", () => {
    const payload = createPayload({
      leaderboardStats: [
        createRow({ leaderboard_id: 2_130_255, rating: undefined }),
        createRow({ leaderboard_id: 2_130_257, rating: 1_250 }),
      ],
    });

    expect(selectRelic1v1Elo(payload, STEAM_ID64)).toMatchObject({
      status: "rated",
      elo: 1_250,
      faction: "British Forces",
    });
  });

  it("accepts a zero rating when the player has played a game", () => {
    const payload = createPayload({
      leaderboardStats: [createRow({ rating: 0, wins: 0, losses: 1 })],
    });

    expect(selectRelic1v1Elo(payload, STEAM_ID64)).toEqual({
      status: "rated",
      elo: 0,
      faction: "US Forces",
      division: "Academy",
      calculationVersion: RELIC_ELO_CALCULATION_VERSION,
    });
  });

  it("treats approved rows with zero played games as unranked", () => {
    const payload = createPayload({
      leaderboardStats: [createRow({ wins: 0, losses: 0 })],
    });

    expect(selectRelic1v1Elo(payload, STEAM_ID64)).toEqual({
      status: "unranked",
    });
  });

  it("does not call a malformed approved row unranked", () => {
    const payload = createPayload({
      leaderboardStats: [
        createRow({ leaderboard_id: 2_130_255, rating: undefined }),
        createRow({ leaderboard_id: 2_130_257, wins: 0, losses: 0 }),
      ],
    });

    expect(selectRelic1v1Elo(payload, STEAM_ID64)).toEqual({
      status: "invalid_relic_response",
    });
  });

  it("returns unranked when no approved 1v1 row exists", () => {
    const payload = createPayload({
      leaderboardStats: [createRow({ leaderboard_id: 2_130_300 })],
    });

    expect(selectRelic1v1Elo(payload, STEAM_ID64)).toEqual({
      status: "unranked",
    });
  });

  it("returns Steam identity mismatch for a different exact member", () => {
    const payload = createPayload({
      statGroups: [
        createGroup({
          members: [
            createMember({
              name: `/steam/${OTHER_STEAM_ID64}`,
              alias: PROFILE_NAME,
            }),
          ],
        }),
      ],
    });

    expect(selectRelic1v1Elo(payload, STEAM_ID64)).toEqual({
      status: "steam_identity_mismatch",
    });
  });

  it("returns profile not found only for Relic result code 3", () => {
    const payload = createPayload({
      result: { code: 3, message: "UNREGISTERED_PROFILE_NAME" },
      statGroups: [],
      leaderboardStats: [],
    });

    expect(selectRelic1v1Elo(payload, STEAM_ID64)).toEqual({
      status: "profile_not_found",
    });
  });

  it("returns integration error for another nonzero Relic result code", () => {
    const payload = createPayload({
      result: { code: 6, message: "UNKNOWN_PROFILE_IDS" },
      statGroups: [],
      leaderboardStats: [],
    });

    expect(selectRelic1v1Elo(payload, STEAM_ID64)).toEqual({
      status: "relic_integration_error",
    });
  });

  it("rejects a nonzero result envelope without the required arrays", () => {
    expect(
      selectRelic1v1Elo(
        { result: { code: 3, message: "UNREGISTERED_PROFILE_NAME" } },
        STEAM_ID64
      )
    ).toEqual({ status: "invalid_relic_response" });
  });

  it("rejects nonzero result envelopes that contain unexpected statistics", () => {
    const payload = createPayload({
      result: { code: 3, message: "UNREGISTERED_PROFILE_NAME" },
      statGroups: [createGroup()],
      leaderboardStats: [{ leaderboard_id: 2_130_255 }],
    });

    expect(selectRelic1v1Elo(payload, STEAM_ID64)).toEqual({
      status: "invalid_relic_response",
    });
  });

  it("rejects malformed top-level responses", () => {
    expect(selectRelic1v1Elo(null, STEAM_ID64)).toEqual({
      status: "invalid_relic_response",
    });
    expect(
      selectRelic1v1Elo(createPayload({ leaderboardStats: null }), STEAM_ID64)
    ).toEqual({ status: "invalid_relic_response" });
  });

  it("rejects a malformed stat group", () => {
    const payload = createPayload({
      statGroups: [{ members: [createMember()] }],
    });

    expect(selectRelic1v1Elo(payload, STEAM_ID64)).toEqual({
      status: "invalid_relic_response",
    });
  });

  it("rejects a malformed member", () => {
    const payload = createPayload({
      statGroups: [
        createGroup({ members: [{ name: PROFILE_NAME }] }),
      ],
    });

    expect(selectRelic1v1Elo(payload, STEAM_ID64)).toEqual({
      status: "invalid_relic_response",
    });
  });

  it("rejects an ambiguous or incorrectly joined member", () => {
    const duplicateMemberPayload = createPayload({
      statGroups: [
        createGroup({ members: [createMember(), createMember()] }),
      ],
    });
    const wrongJoinPayload = createPayload({
      statGroups: [
        createGroup({
          members: [
            createMember({ personal_statgroup_id: OTHER_GROUP_ID }),
          ],
        }),
      ],
    });

    expect(selectRelic1v1Elo(duplicateMemberPayload, STEAM_ID64)).toEqual({
      status: "invalid_relic_response",
    });
    expect(selectRelic1v1Elo(wrongJoinPayload, STEAM_ID64)).toEqual({
      status: "invalid_relic_response",
    });
  });

  it("rejects a malformed leaderboard row", () => {
    const payload = createPayload({
      leaderboardStats: [{ leaderboard_id: 2_130_255 }],
    });

    expect(selectRelic1v1Elo(payload, STEAM_ID64)).toEqual({
      status: "invalid_relic_response",
    });
  });

  it("rejects a missing rating", () => {
    const payload = createPayload({
      leaderboardStats: [createRow({ rating: undefined })],
    });

    expect(selectRelic1v1Elo(payload, STEAM_ID64)).toEqual({
      status: "invalid_relic_response",
    });
  });

  it.each([-1, 1_200.5])("rejects invalid rating %s", (rating) => {
    const payload = createPayload({
      leaderboardStats: [createRow({ rating })],
    });

    expect(selectRelic1v1Elo(payload, STEAM_ID64)).toEqual({
      status: "invalid_relic_response",
    });
  });

  it.each([
    ["wins", -1],
    ["wins", 1.5],
    ["losses", -1],
    ["losses", 1.5],
  ] as const)("rejects invalid %s value %s", (field, value) => {
    const payload = createPayload({
      leaderboardStats: [createRow({ [field]: value })],
    });

    expect(selectRelic1v1Elo(payload, STEAM_ID64)).toEqual({
      status: "invalid_relic_response",
    });
  });

  it.each([
    "",
    " 18446744073709551615",
    "018446744073709551615",
    "18446744073709551616",
    "not-a-steam-id",
  ])("rejects invalid raw Steam input %j", (steamId64) => {
    expect(selectRelic1v1Elo(createPayload(), steamId64)).toEqual({
      status: "invalid_steam_input",
    });
  });
});

describe("getRelic1v1Elo", () => {
  it("makes one exact mocked GET request and no unhandled request", async () => {
    const requestSpy = mockRelicJson();
    const unhandledRequest = vi.fn();
    mockServer.events.on("request:unhandled", unhandledRequest);

    try {
      await expect(getRelic1v1Elo(STEAM_ID64)).resolves.toEqual({
        status: "rated",
        elo: 1_200,
        faction: "US Forces",
        division: "Challenge",
        calculationVersion: RELIC_ELO_CALCULATION_VERSION,
      });

      expect(requestSpy).toHaveBeenCalledOnce();
      expect(unhandledRequest).not.toHaveBeenCalled();

      const request = requestSpy.mock.calls[0][0] as Request;
      const requestUrl = new URL(request.url);

      expect(request.method).toBe("GET");
      expect(requestUrl.origin + requestUrl.pathname).toBe(RELIC_ENDPOINT);
      expect([...requestUrl.searchParams.keys()].sort()).toEqual([
        "profile_names",
        "title",
      ]);
      expect(requestUrl.searchParams.get("title")).toBe("coh3");
      expect(JSON.parse(requestUrl.searchParams.get("profile_names")!)).toEqual([
        PROFILE_NAME,
      ]);
      expect(request.headers.get("accept")).toBe("application/json");
      expect(request.headers.get("content-type")).toBeNull();
      expect(await request.clone().text()).toBe("");
    } finally {
      mockServer.events.removeListener("request:unhandled", unhandledRequest);
    }
  });

  it("does not request Relic for invalid Steam input", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(getRelic1v1Elo("invalid")).resolves.toEqual({
      status: "invalid_steam_input",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses a bounded 10-second timeout and fails unavailable", async () => {
    mockRelicJson();
    const timeoutSpy = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(
        AbortSignal.abort(new DOMException("Timed out", "TimeoutError"))
      );

    await expect(getRelic1v1Elo(STEAM_ID64)).resolves.toEqual({
      status: "external_relic_unavailable",
    });
    expect(timeoutSpy).toHaveBeenCalledExactlyOnceWith(10_000);
  });

  it.each([
    [400, "relic_integration_error"],
    [404, "relic_integration_error"],
    [429, "external_relic_unavailable"],
    [500, "external_relic_unavailable"],
    [503, "external_relic_unavailable"],
  ] as const)("maps HTTP %i to %s", async (status, expectedStatus) => {
    mockServer.use(
      http.get(
        RELIC_ENDPOINT,
        () =>
          new HttpResponse(`${STEAM_ID64}:${RAW_RESPONSE_MARKER}`, {
            status,
          })
      )
    );

    const result = await getRelic1v1Elo(STEAM_ID64);

    expect(result).toEqual({ status: expectedStatus });
    expect(JSON.stringify(result)).not.toContain(STEAM_ID64);
    expect(JSON.stringify(result)).not.toContain(RAW_RESPONSE_MARKER);
  });

  it("fails unavailable on a network error", async () => {
    mockServer.use(http.get(RELIC_ENDPOINT, () => HttpResponse.error()));

    await expect(getRelic1v1Elo(STEAM_ID64)).resolves.toEqual({
      status: "external_relic_unavailable",
    });
  });

  it("rejects invalid JSON without exposing the response body", async () => {
    mockServer.use(
      http.get(
        RELIC_ENDPOINT,
        () =>
          new HttpResponse(
            `{broken-json:${STEAM_ID64}:${RAW_RESPONSE_MARKER}`,
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }
          )
      )
    );

    const result = await getRelic1v1Elo(STEAM_ID64);

    expect(result).toEqual({ status: "invalid_relic_response" });
    expect(JSON.stringify(result)).not.toContain(STEAM_ID64);
    expect(JSON.stringify(result)).not.toContain(RAW_RESPONSE_MARKER);
  });

  it("keeps every non-success result privacy-safe", () => {
    const rawPayload = createPayload({
      result: null,
      raw: RAW_RESPONSE_MARKER,
      alias: PRIVATE_ALIAS,
      steam: STEAM_ID64,
    });
    const results = [
      selectRelic1v1Elo(rawPayload, STEAM_ID64),
      selectRelic1v1Elo(createPayload(), "invalid"),
      selectRelic1v1Elo(
        createPayload({
          result: { code: 3, message: "UNREGISTERED_PROFILE_NAME" },
          statGroups: [],
          leaderboardStats: [],
        }),
        STEAM_ID64
      ),
      selectRelic1v1Elo(
        createPayload({
          statGroups: [
            createGroup({
              members: [
                createMember({ name: `/steam/${OTHER_STEAM_ID64}` }),
              ],
            }),
          ],
        }),
        STEAM_ID64
      ),
    ];

    for (const result of results) {
      expect(Object.keys(result)).toEqual(["status"]);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(STEAM_ID64);
      expect(serialized).not.toContain(PROFILE_NAME);
      expect(serialized).not.toContain(PRIVATE_ALIAS);
      expect(serialized).not.toContain(RAW_RESPONSE_MARKER);
      expect(serialized).not.toContain(RELIC_ENDPOINT);
    }
  });
});
