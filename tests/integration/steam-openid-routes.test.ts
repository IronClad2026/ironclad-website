import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const buildSteamOpenIdAuthenticationUrlMock = vi.hoisted(() => vi.fn());
const buildSteamOpenIdCallbackUrlMock = vi.hoisted(() => vi.fn());
const createSteamOpenIdFlowMock = vi.hoisted(() => vi.fn());
const fetchSteamDisplayNameMock = vi.hoisted(() => vi.fn());
const getSteamOpenIdCallbackStateMock = vi.hoisted(() => vi.fn());
const normalizeSteamOpenIdOriginMock = vi.hoisted(() => vi.fn());
const validateSteamOpenIdCallbackMock = vi.hoisted(() => vi.fn());
const validateSteamOpenIdFlowCookieMock = vi.hoisted(() => vi.fn());
const verifySteamOpenIdAssertionMock = vi.hoisted(() => vi.fn());
const evaluateProfileBadgesAfterCommitMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

vi.mock("@/lib/steam-openid", () => ({
  STEAM_OPENID_FLOW_COOKIE_NAME: "__Host-ironclad-steam-link",
  buildSteamOpenIdAuthenticationUrl: buildSteamOpenIdAuthenticationUrlMock,
  buildSteamOpenIdCallbackUrl: buildSteamOpenIdCallbackUrlMock,
  createSteamOpenIdFlow: createSteamOpenIdFlowMock,
  fetchSteamDisplayName: fetchSteamDisplayNameMock,
  getSteamOpenIdCallbackState: getSteamOpenIdCallbackStateMock,
  normalizeSteamOpenIdOrigin: normalizeSteamOpenIdOriginMock,
  validateSteamOpenIdCallback: validateSteamOpenIdCallbackMock,
  validateSteamOpenIdFlowCookie: validateSteamOpenIdFlowCookieMock,
  verifySteamOpenIdAssertion: verifySteamOpenIdAssertionMock,
}));

vi.mock("@/lib/badges/integration", () => ({
  evaluateProfileBadgesAfterCommit: evaluateProfileBadgesAfterCommitMock,
}));

import { GET as callbackGET } from "@/app/api/steam/callback/route";
import { POST as connectPOST } from "@/app/api/steam/connect/route";
import zhAccountDashboard from "@/lib/i18n/dictionaries/zh-CN/account-dashboard";

const ORIGIN = "https://ironclad.example";
const CALLBACK_URL = `${ORIGIN}/api/steam/callback?state=opaque-state`;
const STEAM_AUTH_URL =
  "https://steamcommunity.com/openid/login?openid.mode=checkid_setup";
const STEAM_ID = "18446744073709551614";
const DIFFERENT_STEAM_ID = "18446744073709551613";
const LEGACY_STEAM_DISPLAY_NAME = "Legacy manual Steam name";
const STEAM_DISPLAY_NAME = "鉄の狼 ⚔️";
const UPDATED_STEAM_DISPLAY_NAME = "Iron Wolf ™";
const USER_ID = "user_test_player";
const SESSION_ID = "session_test_player";
const FLOW_COOKIE_NAME = "__Host-ironclad-steam-link";

function authenticatedIdentity(sessionId = SESSION_ID) {
  return {
    sessionId,
    userId: USER_ID,
  };
}

function createStartClient({
  data = { id: "player-1", steam_id64: null },
  error = null,
}: {
  data?: { id: string; steam_id64: string | null } | null;
  error?: { code?: string; message: string } | null;
} = {}) {
  const maybeSingle = vi.fn(async () => ({ data, error }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));

  return {
    client: { from },
    eq,
    from,
    maybeSingle,
    select,
  };
}

type PlayerRow = {
  avatar_url: string | null;
  country: string | null;
  discord_username: string | null;
  display_name: string;
  id: string;
  in_game_name: string;
  profile_completed: boolean;
  region: string | null;
  steam_id64: string | null;
  steam_username: string | null;
  timezone: string | null;
};

type QueryResult = {
  data: Partial<PlayerRow> | null;
  error: { code?: string; message: string } | null;
};

function createPlayerRow(
  overrides: Partial<PlayerRow> = {}
): PlayerRow {
  return {
    avatar_url: "/api/players/player-1/avatar",
    country: "Australia",
    discord_username: "iron-wolf",
    display_name: "Iron Wolf",
    id: "player-1",
    in_game_name: "IronWolf",
    profile_completed: false,
    region: "Oceania",
    steam_id64: null,
    steam_username: null,
    timezone: "Australia/Sydney",
    ...overrides,
  };
}

function createCallbackClient({
  linkResult = {
    data: { steam_id64: STEAM_ID },
    error: null,
  },
  readResults = [
    {
      data: createPlayerRow(),
      error: null,
    },
  ],
  syncResult = {
    data: {
      profile_completed: true,
      steam_id64: STEAM_ID,
      steam_username: STEAM_DISPLAY_NAME,
    },
    error: null,
  },
}: {
  linkResult?: QueryResult;
  readResults?: QueryResult[];
  syncResult?: QueryResult;
} = {}) {
  const pendingReads = [...readResults];
  const readMaybeSingle = vi.fn(async () => {
    const result = pendingReads.shift();

    if (!result) {
      throw new Error("Unexpected extra Steam identity lookup.");
    }

    return result;
  });
  const readEq = vi.fn(() => ({ maybeSingle: readMaybeSingle }));
  const readSelect = vi.fn(() => ({ eq: readEq }));

  type UpdateFilter =
    | { column: string; operator: "eq"; value: unknown }
    | { column: string; operator: "is"; value: unknown };
  type UpdateBuilder = {
    eq: ReturnType<typeof vi.fn>;
    is: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
  };

  function createUpdateBuilder(result: QueryResult) {
    const filters: UpdateFilter[] = [];
    const builder = {} as UpdateBuilder;
    const maybeSingle = vi.fn(async () => result);

    builder.eq = vi.fn((column: string, value: unknown) => {
      filters.push({ column, operator: "eq", value });
      return builder;
    });
    builder.is = vi.fn((column: string, value: unknown) => {
      filters.push({ column, operator: "is", value });
      return builder;
    });
    builder.maybeSingle = maybeSingle;
    builder.select = vi.fn(() => builder);

    return { builder, filters, maybeSingle };
  }

  const linkUpdate = createUpdateBuilder(linkResult);
  const syncUpdate = createUpdateBuilder(syncResult);
  const update = vi.fn((payload: Record<string, unknown>) =>
    Object.hasOwn(payload, "steam_id64")
      ? linkUpdate.builder
      : syncUpdate.builder
  );

  const from = vi.fn(() => ({
    select: readSelect,
    update,
  }));

  return {
    client: { from },
    from,
    linkEq: linkUpdate.builder.eq,
    linkFilters: linkUpdate.filters,
    linkIs: linkUpdate.builder.is,
    linkMaybeSingle: linkUpdate.maybeSingle,
    linkSelect: linkUpdate.builder.select,
    readEq,
    readMaybeSingle,
    readSelect,
    syncFilters: syncUpdate.filters,
    syncMaybeSingle: syncUpdate.maybeSingle,
    update,
  };
}

function createConnectRequest(origin = ORIGIN, locale?: string) {
  return new Request(`${ORIGIN}/api/steam/connect`, {
    headers: {
      origin,
      ...(locale ? { cookie: `ironclad_locale=${locale}` } : {}),
    },
    method: "POST",
  });
}

function createCallbackRequest({
  cookieValue = "flow-cookie",
  locale,
  mode = "id_res",
  state = "opaque-state",
}: {
  cookieValue?: string | null;
  locale?: string;
  mode?: string;
  state?: string | null;
} = {}) {
  const url = new URL("/api/steam/callback", ORIGIN);

  if (state !== null) {
    url.searchParams.set("state", state);
  }

  url.searchParams.set("openid.mode", mode);

  const cookie = [
    cookieValue ? `${FLOW_COOKIE_NAME}=${cookieValue}` : null,
    locale ? `ironclad_locale=${locale}` : null,
  ]
    .filter(Boolean)
    .join("; ");

  return new NextRequest(url, {
    headers: cookie ? { cookie } : undefined,
  });
}

function expectProfileRedirect(response: Response, result: string) {
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(
    `${ORIGIN}/profile?steam=${result}`
  );
}

function expectFlowCookieConsumed(response: Response) {
  const cookie = response.headers.get("set-cookie");
  expect(cookie).toContain(`${FLOW_COOKIE_NAME}=`);
  expect(cookie).toContain("Max-Age=0");
  expect(cookie).toContain("Path=/");
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("Secure");
  expect(cookie).toContain("SameSite=lax");
  expect(response.headers.get("cache-control")).toBe(
    "private, no-store, max-age=0"
  );
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
}

describe("Steam connection start route", () => {
  beforeEach(() => {
    evaluateProfileBadgesAfterCommitMock.mockReset();
    evaluateProfileBadgesAfterCommitMock.mockResolvedValue(undefined);
    authMock.mockResolvedValue(authenticatedIdentity());
    normalizeSteamOpenIdOriginMock.mockReturnValue(ORIGIN);
    buildSteamOpenIdAuthenticationUrlMock.mockReturnValue(
      new URL(STEAM_AUTH_URL)
    );
    createSteamOpenIdFlowMock.mockReturnValue({
      cookieOptions: {
        httpOnly: true,
        maxAge: 600,
        path: "/",
        sameSite: "lax",
        secure: true,
      },
      cookieValue: "flow-cookie",
      expiresAt: Date.now() + 600_000,
      intent: "connect",
      state: "opaque-state",
    });
  });

  it("rejects an unauthenticated start", async () => {
    authMock.mockResolvedValue({ sessionId: null, userId: null });

    const response = await connectPOST(createConnectRequest());

    expect(response.status).toBe(401);
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("localizes a direct unauthenticated start response from the allowlisted cookie", async () => {
    authMock.mockResolvedValue({ sessionId: null, userId: null });

    const response = await connectPOST(createConnectRequest(ORIGIN, "zh-CN"));

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe(
      zhAccountDashboard.steam.authenticationRequired
    );
  });

  it("rejects a request whose Origin is not the configured origin", async () => {
    const response = await connectPOST(
      createConnectRequest("https://attacker.example")
    );

    expect(response.status).toBe(403);
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("requires an existing player row", async () => {
    const fixture = createStartClient({ data: null });
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);

    const response = await connectPOST(createConnectRequest());

    expectProfileRedirect(response, "failed");
    expect(createSteamOpenIdFlowMock).not.toHaveBeenCalled();
  });

  it("fails safely when the player lookup throws", async () => {
    const fixture = createStartClient();
    fixture.maybeSingle.mockRejectedValueOnce(new Error("network failure"));
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);

    const response = await connectPOST(createConnectRequest());

    expectProfileRedirect(response, "failed");
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0"
    );
    expect(createSteamOpenIdFlowMock).not.toHaveBeenCalled();
  });

  it("allows an already-connected player to reauthenticate for a display-name refresh", async () => {
    const fixture = createStartClient({
      data: { id: "player-1", steam_id64: STEAM_ID },
    });
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);

    const response = await connectPOST(createConnectRequest());

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(STEAM_AUTH_URL);
    expect(createSteamOpenIdFlowMock).toHaveBeenCalledWith(
      SESSION_ID,
      "refresh"
    );
    expect(response.headers.get("set-cookie")).toContain(
      `${FLOW_COOKIE_NAME}=flow-cookie`
    );
  });

  it("sets the protected flow cookie and redirects to Steam", async () => {
    const fixture = createStartClient();
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);

    const response = await connectPOST(createConnectRequest());

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(STEAM_AUTH_URL);
    expect(response.headers.get("set-cookie")).toContain(
      `${FLOW_COOKIE_NAME}=flow-cookie`
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0"
    );
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(createSteamOpenIdFlowMock).toHaveBeenCalledWith(
      SESSION_ID,
      "connect"
    );
    expect(buildSteamOpenIdAuthenticationUrlMock).toHaveBeenCalledWith(
      ORIGIN,
      "opaque-state"
    );
  });
});

describe("Steam connection callback route", () => {
  beforeEach(() => {
    evaluateProfileBadgesAfterCommitMock.mockReset();
    evaluateProfileBadgesAfterCommitMock.mockResolvedValue(undefined);
    authMock.mockResolvedValue(authenticatedIdentity());
    normalizeSteamOpenIdOriginMock.mockReturnValue(ORIGIN);
    getSteamOpenIdCallbackStateMock.mockImplementation(
      (params: URLSearchParams) => params.get("state")
    );
    validateSteamOpenIdFlowCookieMock.mockReturnValue({
      ok: true,
      intent: "connect",
    });
    buildSteamOpenIdCallbackUrlMock.mockReturnValue(CALLBACK_URL);
    validateSteamOpenIdCallbackMock.mockReturnValue({
      assertion: { fields: new URLSearchParams() },
      status: "positive",
    });
    verifySteamOpenIdAssertionMock.mockResolvedValue(STEAM_ID);
    fetchSteamDisplayNameMock.mockResolvedValue(STEAM_DISPLAY_NAME);
  });

  it("rejects an unauthenticated callback and consumes the cookie", async () => {
    authMock.mockResolvedValue({ sessionId: null, userId: null });

    const response = await callbackGET(createCallbackRequest());

    expect(response.status).toBe(401);
    expectFlowCookieConsumed(response);
    expect(verifySteamOpenIdAssertionMock).not.toHaveBeenCalled();
  });

  it("localizes a direct unauthenticated callback response and still consumes the flow cookie", async () => {
    authMock.mockResolvedValue({ sessionId: null, userId: null });

    const response = await callbackGET(
      createCallbackRequest({ locale: "zh-CN" })
    );

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe(
      zhAccountDashboard.steam.authenticationRequired
    );
    expectFlowCookieConsumed(response);
  });

  it("rejects a callback received on an unexpected origin", async () => {
    const request = new NextRequest(
      "https://attacker.example/api/steam/callback?state=opaque-state",
      {
        headers: {
          cookie: `${FLOW_COOKIE_NAME}=flow-cookie`,
        },
      }
    );

    const response = await callbackGET(request);

    expectProfileRedirect(response, "failed");
    expectFlowCookieConsumed(response);
    expect(validateSteamOpenIdCallbackMock).not.toHaveBeenCalled();
  });

  it.each([
    ["missing state", { state: null }],
    ["missing cookie", { cookieValue: null }],
  ])("fails for %s and consumes the cookie", async (_label, options) => {
    validateSteamOpenIdFlowCookieMock.mockReturnValue({
      ok: false,
      reason: "invalid",
    });

    const response = await callbackGET(createCallbackRequest(options));

    expectProfileRedirect(response, "failed");
    expectFlowCookieConsumed(response);
    expect(verifySteamOpenIdAssertionMock).not.toHaveBeenCalled();
  });

  it.each(["mismatched-state", "different-session", "expired"])(
    "fails closed for %s flow validation",
    async (reason) => {
      validateSteamOpenIdFlowCookieMock.mockReturnValue({
        ok: false,
        reason,
      });

      const response = await callbackGET(createCallbackRequest());

      expectProfileRedirect(response, "failed");
      expectFlowCookieConsumed(response);
      expect(verifySteamOpenIdAssertionMock).not.toHaveBeenCalled();
    }
  );

  it("handles Steam cancellation without a database write", async () => {
    validateSteamOpenIdCallbackMock.mockReturnValue({
      status: "cancelled",
    });

    const response = await callbackGET(
      createCallbackRequest({ mode: "cancel" })
    );

    expectProfileRedirect(response, "cancelled");
    expectFlowCookieConsumed(response);
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("fails closed for a malformed callback", async () => {
    validateSteamOpenIdCallbackMock.mockImplementation(() => {
      throw new Error("invalid");
    });

    const response = await callbackGET(createCallbackRequest());

    expectProfileRedirect(response, "failed");
    expectFlowCookieConsumed(response);
    expect(verifySteamOpenIdAssertionMock).not.toHaveBeenCalled();
  });

  it("fails closed when Steam rejects or cannot verify the assertion", async () => {
    verifySteamOpenIdAssertionMock.mockRejectedValue(new Error("invalid"));

    const response = await callbackGET(createCallbackRequest());

    expectProfileRedirect(response, "failed");
    expectFlowCookieConsumed(response);
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("consumes the flow when the database lookup throws", async () => {
    const fixture = createCallbackClient();
    fixture.readMaybeSingle.mockRejectedValueOnce(new Error("network failure"));
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);

    const response = await callbackGET(createCallbackRequest());

    expectProfileRedirect(response, "failed");
    expectFlowCookieConsumed(response);
    expect(fixture.update).not.toHaveBeenCalled();
  });

  it("links the verified SteamID64 before storing its trusted display name", async () => {
    const fixture = createCallbackClient();
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);

    const response = await callbackGET(createCallbackRequest());

    expectProfileRedirect(response, "connected");
    expectFlowCookieConsumed(response);
    expect(fetchSteamDisplayNameMock).toHaveBeenCalledWith(STEAM_ID);
    expect(fixture.update).toHaveBeenNthCalledWith(1, {
      steam_id64: STEAM_ID,
    });
    expect(fixture.update).toHaveBeenNthCalledWith(2, {
      steam_username: STEAM_DISPLAY_NAME,
    });
    expect(fixture.update).toHaveBeenCalledTimes(2);
    expect(evaluateProfileBadgesAfterCommitMock).toHaveBeenCalledWith({
      playerId: "player-1",
      reason: "steam_identity",
      supabase: fixture.client,
    });
    expect(fixture.linkEq).toHaveBeenCalledWith("id", "player-1");
    expect(fixture.linkEq).toHaveBeenCalledWith("clerk_user_id", USER_ID);
    expect(fixture.linkIs).toHaveBeenCalledWith("steam_id64", null);
    expect(fixture.syncFilters).toHaveLength(3);
    expect(fixture.syncFilters).toEqual(
      expect.arrayContaining([
        { column: "id", operator: "eq", value: "player-1" },
        { column: "clerk_user_id", operator: "eq", value: USER_ID },
        { column: "steam_id64", operator: "eq", value: STEAM_ID },
      ])
    );
  });

  it("keeps a verified SteamID64 linked when display-name lookup fails", async () => {
    fetchSteamDisplayNameMock.mockResolvedValueOnce(null);
    const fixture = createCallbackClient({
      readResults: [
        {
          data: createPlayerRow({
            profile_completed: true,
            steam_username: LEGACY_STEAM_DISPLAY_NAME,
          }),
          error: null,
        },
      ],
    });
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);

    const response = await callbackGET(createCallbackRequest());

    expectProfileRedirect(response, "display-name-failed");
    expectFlowCookieConsumed(response);
    expect(fixture.update).toHaveBeenCalledOnce();
    expect(fixture.update).toHaveBeenCalledWith({ steam_id64: STEAM_ID });
    expect(fixture.syncFilters).toEqual([]);
    const [identityUpdate] = fixture.update.mock.calls[0] as [
      Record<string, unknown>,
    ];

    for (const excludedField of [
      "steam_username",
      "profile_completed",
      "current_elo",
      "relic_verified_elo",
      "relic_verified_faction",
      "relic_verified_division",
      "relic_elo_calculation_version",
      "relic_elo_verified_at",
      "relic_elo_last_attempt_at",
    ]) {
      expect(identityUpdate).not.toHaveProperty(excludedField);
    }
  });

  it("preserves a complete linked profile when display-name lookup fails", async () => {
    validateSteamOpenIdFlowCookieMock.mockReturnValueOnce({
      ok: true,
      intent: "refresh",
    });
    fetchSteamDisplayNameMock.mockResolvedValueOnce(null);
    const fixture = createCallbackClient({
      readResults: [
        {
          data: createPlayerRow({
            profile_completed: true,
            steam_id64: STEAM_ID,
            steam_username: LEGACY_STEAM_DISPLAY_NAME,
          }),
          error: null,
        },
      ],
    });
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);

    const response = await callbackGET(createCallbackRequest());

    expectProfileRedirect(response, "display-name-failed");
    expect(fetchSteamDisplayNameMock).toHaveBeenCalledWith(STEAM_ID);
    expect(fixture.update).not.toHaveBeenCalled();
  });

  it("replaces a legacy display name only through trusted same-ID refresh", async () => {
    validateSteamOpenIdFlowCookieMock.mockReturnValueOnce({
      ok: true,
      intent: "refresh",
    });
    fetchSteamDisplayNameMock.mockResolvedValueOnce(
      UPDATED_STEAM_DISPLAY_NAME
    );
    const fixture = createCallbackClient({
      readResults: [
        {
          data: createPlayerRow({
            profile_completed: true,
            steam_id64: STEAM_ID,
            steam_username: LEGACY_STEAM_DISPLAY_NAME,
          }),
          error: null,
        },
      ],
      syncResult: {
        data: {
          profile_completed: true,
          steam_id64: STEAM_ID,
          steam_username: UPDATED_STEAM_DISPLAY_NAME,
        },
        error: null,
      },
    });
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);

    const response = await callbackGET(createCallbackRequest());

    expectProfileRedirect(response, "refreshed");
    expect(fetchSteamDisplayNameMock).toHaveBeenCalledWith(STEAM_ID);
    expect(fixture.update).toHaveBeenCalledOnce();
    expect(fixture.update).toHaveBeenCalledWith({
      steam_username: UPDATED_STEAM_DISPLAY_NAME,
    });
    expect(fixture.syncFilters).toHaveLength(3);
    expect(fixture.syncFilters).toEqual(
      expect.arrayContaining([
        { column: "id", operator: "eq", value: "player-1" },
        { column: "clerk_user_id", operator: "eq", value: USER_ID },
        { column: "steam_id64", operator: "eq", value: STEAM_ID },
      ])
    );
    const [refreshUpdate] = fixture.update.mock.calls[0] as [
      Record<string, unknown>,
    ];

    for (const protectedField of [
      "steam_id64",
      "profile_completed",
      "current_elo",
      "relic_verified_elo",
      "relic_verified_faction",
      "relic_verified_division",
      "relic_elo_calculation_version",
      "relic_elo_verified_at",
      "relic_elo_last_attempt_at",
    ]) {
      expect(refreshUpdate).not.toHaveProperty(protectedField);
    }
  });

  it("keeps the linked identity and protected profile fields when display-name persistence fails", async () => {
    validateSteamOpenIdFlowCookieMock.mockReturnValueOnce({
      ok: true,
      intent: "refresh",
    });
    const fixture = createCallbackClient({
      readResults: [
        {
          data: createPlayerRow({
            profile_completed: true,
            steam_id64: STEAM_ID,
            steam_username: LEGACY_STEAM_DISPLAY_NAME,
          }),
          error: null,
        },
      ],
      syncResult: {
        data: null,
        error: { message: "storage unavailable" },
      },
    });
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);

    const response = await callbackGET(createCallbackRequest());

    expectProfileRedirect(response, "display-name-failed");
    expect(fetchSteamDisplayNameMock).toHaveBeenCalledWith(STEAM_ID);
    expect(fixture.update).toHaveBeenCalledOnce();
    expect(fixture.update).toHaveBeenCalledWith({
      steam_username: STEAM_DISPLAY_NAME,
    });
    expect(fixture.syncFilters).toEqual(
      expect.arrayContaining([
        { column: "id", operator: "eq", value: "player-1" },
        { column: "clerk_user_id", operator: "eq", value: USER_ID },
        { column: "steam_id64", operator: "eq", value: STEAM_ID },
      ])
    );
    const [refreshUpdate] = fixture.update.mock.calls[0] as [
      Record<string, unknown>,
    ];

    for (const protectedField of [
      "steam_id64",
      "profile_completed",
      "current_elo",
      "relic_verified_elo",
      "relic_verified_faction",
      "relic_verified_division",
      "relic_elo_calculation_version",
      "relic_elo_verified_at",
      "relic_elo_last_attempt_at",
    ]) {
      expect(refreshUpdate).not.toHaveProperty(protectedField);
    }
  });

  it("does not replace a different linked identity", async () => {
    validateSteamOpenIdFlowCookieMock.mockReturnValueOnce({
      ok: true,
      intent: "refresh",
    });
    const fixture = createCallbackClient({
      readResults: [
        {
          data: createPlayerRow({ steam_id64: DIFFERENT_STEAM_ID }),
          error: null,
        },
      ],
    });
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);

    const response = await callbackGET(createCallbackRequest());

    expectProfileRedirect(response, "already-connected");
    expect(fixture.update).not.toHaveBeenCalled();
    expect(fetchSteamDisplayNameMock).not.toHaveBeenCalled();
  });

  it("maps a unique-index race to the duplicate identity result", async () => {
    const fixture = createCallbackClient({
      linkResult: {
        data: null,
        error: { code: "23505", message: "unique violation" },
      },
    });
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);

    const response = await callbackGET(createCallbackRequest());

    expectProfileRedirect(response, "duplicate");
    expectFlowCookieConsumed(response);
  });

  it("consumes the flow when the conditional update throws", async () => {
    const fixture = createCallbackClient();
    fixture.linkMaybeSingle.mockRejectedValueOnce(new Error("network failure"));
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);

    const response = await callbackGET(createCallbackRequest());

    expectProfileRedirect(response, "failed");
    expectFlowCookieConsumed(response);
  });

  it("rechecks a zero-row conditional update without replacing the winner", async () => {
    const fixture = createCallbackClient({
      linkResult: { data: null, error: null },
      readResults: [
        {
          data: createPlayerRow(),
          error: null,
        },
        {
          data: createPlayerRow({ steam_id64: DIFFERENT_STEAM_ID }),
          error: null,
        },
      ],
    });
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);

    const response = await callbackGET(createCallbackRequest());

    expectProfileRedirect(response, "already-connected");
    expectFlowCookieConsumed(response);
  });

  it("does not leak the verified identifier through redirects or logs", async () => {
    const fixture = createCallbackClient({
      linkResult: {
        data: null,
        error: { message: "storage unavailable" },
      },
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);

    const response = await callbackGET(createCallbackRequest());
    const observableOutput = [
      response.headers.get("location") ?? "",
      ...consoleError.mock.calls.flat().map(String),
    ].join(" ");

    expectProfileRedirect(response, "failed");
    expect(observableOutput).not.toContain(STEAM_ID);
    expect(observableOutput).not.toContain("openid.");
    expect(observableOutput).not.toContain("opaque-state");
  });
});
