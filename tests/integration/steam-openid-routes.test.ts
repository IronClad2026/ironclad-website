import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const buildSteamOpenIdAuthenticationUrlMock = vi.hoisted(() => vi.fn());
const buildSteamOpenIdCallbackUrlMock = vi.hoisted(() => vi.fn());
const createSteamOpenIdFlowMock = vi.hoisted(() => vi.fn());
const getSteamOpenIdCallbackStateMock = vi.hoisted(() => vi.fn());
const normalizeSteamOpenIdOriginMock = vi.hoisted(() => vi.fn());
const validateSteamOpenIdCallbackMock = vi.hoisted(() => vi.fn());
const validateSteamOpenIdFlowCookieMock = vi.hoisted(() => vi.fn());
const verifySteamOpenIdAssertionMock = vi.hoisted(() => vi.fn());

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
  getSteamOpenIdCallbackState: getSteamOpenIdCallbackStateMock,
  normalizeSteamOpenIdOrigin: normalizeSteamOpenIdOriginMock,
  validateSteamOpenIdCallback: validateSteamOpenIdCallbackMock,
  validateSteamOpenIdFlowCookie: validateSteamOpenIdFlowCookieMock,
  verifySteamOpenIdAssertion: verifySteamOpenIdAssertionMock,
}));

import { GET as callbackGET } from "@/app/api/steam/callback/route";
import { POST as connectPOST } from "@/app/api/steam/connect/route";

const ORIGIN = "https://ironclad.example";
const CALLBACK_URL = `${ORIGIN}/api/steam/callback?state=opaque-state`;
const STEAM_AUTH_URL =
  "https://steamcommunity.com/openid/login?openid.mode=checkid_setup";
const STEAM_ID = "18446744073709551614";
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

type QueryResult = {
  data: { id?: string; steam_id64?: string | null } | null;
  error: { code?: string; message: string } | null;
};

function createCallbackClient({
  linkResult = {
    data: { steam_id64: STEAM_ID },
    error: null,
  },
  readResults = [
    {
      data: { id: "player-1", steam_id64: null },
      error: null,
    },
  ],
}: {
  linkResult?: QueryResult;
  readResults?: QueryResult[];
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

  const linkMaybeSingle = vi.fn(async () => linkResult);
  const linkSelect = vi.fn(() => ({ maybeSingle: linkMaybeSingle }));
  const linkIs = vi.fn(() => ({ select: linkSelect }));
  const linkEq = vi.fn(() => ({ is: linkIs }));
  const update = vi.fn(() => ({ eq: linkEq }));

  const from = vi.fn(() => ({
    select: readSelect,
    update,
  }));

  return {
    client: { from },
    from,
    linkEq,
    linkIs,
    linkMaybeSingle,
    linkSelect,
    readEq,
    readMaybeSingle,
    readSelect,
    update,
  };
}

function createConnectRequest(origin = ORIGIN) {
  return new Request(`${ORIGIN}/api/steam/connect`, {
    headers: {
      origin,
    },
    method: "POST",
  });
}

function createCallbackRequest({
  cookieValue = "flow-cookie",
  mode = "id_res",
  state = "opaque-state",
}: {
  cookieValue?: string | null;
  mode?: string;
  state?: string | null;
} = {}) {
  const url = new URL("/api/steam/callback", ORIGIN);

  if (state !== null) {
    url.searchParams.set("state", state);
  }

  url.searchParams.set("openid.mode", mode);

  return new NextRequest(url, {
    headers: cookieValue
      ? {
          cookie: `${FLOW_COOKIE_NAME}=${cookieValue}`,
        }
      : undefined,
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
      state: "opaque-state",
    });
  });

  it("rejects an unauthenticated start", async () => {
    authMock.mockResolvedValue({ sessionId: null, userId: null });

    const response = await connectPOST(createConnectRequest());

    expect(response.status).toBe(401);
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
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

  it("does not start a replacement flow for an already-connected player", async () => {
    const fixture = createStartClient({
      data: { id: "player-1", steam_id64: STEAM_ID },
    });
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);

    const response = await connectPOST(createConnectRequest());

    expectProfileRedirect(response, "already-connected");
    expect(createSteamOpenIdFlowMock).not.toHaveBeenCalled();
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
    expect(buildSteamOpenIdAuthenticationUrlMock).toHaveBeenCalledWith(
      ORIGIN,
      "opaque-state"
    );
  });
});

describe("Steam connection callback route", () => {
  beforeEach(() => {
    authMock.mockResolvedValue(authenticatedIdentity());
    normalizeSteamOpenIdOriginMock.mockReturnValue(ORIGIN);
    getSteamOpenIdCallbackStateMock.mockImplementation(
      (params: URLSearchParams) => params.get("state")
    );
    validateSteamOpenIdFlowCookieMock.mockReturnValue({
      ok: true,
      expiresAt: Date.now() + 600_000,
    });
    buildSteamOpenIdCallbackUrlMock.mockReturnValue(CALLBACK_URL);
    validateSteamOpenIdCallbackMock.mockReturnValue({
      assertion: { fields: new URLSearchParams() },
      status: "positive",
    });
    verifySteamOpenIdAssertionMock.mockResolvedValue(STEAM_ID);
  });

  it("rejects an unauthenticated callback and consumes the cookie", async () => {
    authMock.mockResolvedValue({ sessionId: null, userId: null });

    const response = await callbackGET(createCallbackRequest());

    expect(response.status).toBe(401);
    expectFlowCookieConsumed(response);
    expect(verifySteamOpenIdAssertionMock).not.toHaveBeenCalled();
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

  it("stores the first verified Steam identity conditionally", async () => {
    const fixture = createCallbackClient();
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);

    const response = await callbackGET(createCallbackRequest());

    expectProfileRedirect(response, "connected");
    expectFlowCookieConsumed(response);
    expect(fixture.update).toHaveBeenCalledWith({ steam_id64: STEAM_ID });
    expect(fixture.linkEq).toHaveBeenCalledWith("clerk_user_id", USER_ID);
    expect(fixture.linkIs).toHaveBeenCalledWith("steam_id64", null);
  });

  it("treats the same linked identity as idempotent success", async () => {
    const fixture = createCallbackClient({
      readResults: [
        {
          data: { id: "player-1", steam_id64: STEAM_ID },
          error: null,
        },
      ],
    });
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);

    const response = await callbackGET(createCallbackRequest());

    expectProfileRedirect(response, "connected");
    expect(fixture.update).not.toHaveBeenCalled();
  });

  it("does not replace a different linked identity", async () => {
    const fixture = createCallbackClient({
      readResults: [
        {
          data: { id: "player-1", steam_id64: "18446744073709551613" },
          error: null,
        },
      ],
    });
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);

    const response = await callbackGET(createCallbackRequest());

    expectProfileRedirect(response, "already-connected");
    expect(fixture.update).not.toHaveBeenCalled();
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
          data: { id: "player-1", steam_id64: null },
          error: null,
        },
        {
          data: {
            id: "player-1",
            steam_id64: "18446744073709551613",
          },
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
