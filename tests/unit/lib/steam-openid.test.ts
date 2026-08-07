import { describe, expect, it, vi } from "vitest";
import {
  buildSteamOpenIdAuthenticationUrl,
  buildSteamOpenIdCallbackUrl,
  createSteamOpenIdFlow,
  fetchSteamDisplayName,
  generateSteamOpenIdState,
  getSteamOpenIdCallbackState,
  normalizeSteamOpenIdOrigin,
  parseSteamId64FromClaimedId,
  STEAM_OPENID_ENDPOINT,
  STEAM_OPENID_FLOW_COOKIE_NAME,
  STEAM_OPENID_FLOW_TTL_SECONDS,
  STEAM_OPENID_IDENTIFIER_SELECT,
  STEAM_OPENID_NAMESPACE,
  STEAM_PLAYER_SUMMARIES_ENDPOINT,
  SteamOpenIdError,
  validateSteamOpenIdCallback,
  validateSteamOpenIdFlowCookie,
  verifySteamOpenIdAssertion,
  type SteamOpenIdPositiveAssertion,
} from "@/lib/steam-openid";

const ORIGIN = "https://ironclad.example";
const STATE = "A".repeat(43);
const SESSION_ID = "sess_test_current";
const NOW_MS = Date.parse("2026-07-30T10:00:00Z");
const CLAIMED_ID =
  "https://steamcommunity.com/openid/id/18446744073709551615";
const STEAM_ID64 = "18446744073709551614";
const STEAM_WEB_API_KEY = "test-steam-web-api-key";
const EXPECTED_RETURN_TO = buildSteamOpenIdCallbackUrl(ORIGIN, STATE);
const REQUIRED_SIGNED_FIELDS =
  "op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle";

function createPositiveCallback(
  overrides: Record<string, string | null> = {}
): URLSearchParams {
  const values: Record<string, string> = {
    state: STATE,
    "openid.ns": STEAM_OPENID_NAMESPACE,
    "openid.mode": "id_res",
    "openid.op_endpoint": STEAM_OPENID_ENDPOINT,
    "openid.claimed_id": CLAIMED_ID,
    "openid.identity": CLAIMED_ID,
    "openid.return_to": EXPECTED_RETURN_TO,
    "openid.response_nonce": "2026-07-30T10:00:00Zunique",
    "openid.assoc_handle": "handle",
    "openid.signed": REQUIRED_SIGNED_FIELDS,
    "openid.sig": "signature",
  };

  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) {
      delete values[key];
    } else {
      values[key] = value;
    }
  }

  return new URLSearchParams(values);
}

function createPositiveAssertion(): SteamOpenIdPositiveAssertion {
  const callback = validateSteamOpenIdCallback(
    createPositiveCallback(),
    EXPECTED_RETURN_TO,
    NOW_MS
  );

  if (callback.status !== "positive") {
    throw new Error("Expected a positive callback fixture.");
  }

  return callback.assertion;
}

function expectSteamErrorCode(
  operation: () => unknown,
  code: SteamOpenIdError["code"]
): void {
  try {
    operation();
    throw new Error("Expected SteamOpenIdError.");
  } catch (error) {
    expect(error).toBeInstanceOf(SteamOpenIdError);
    expect((error as SteamOpenIdError).code).toBe(code);
  }
}

describe("normalizeSteamOpenIdOrigin", () => {
  it.each([
    ["https://ironclad.example", "https://ironclad.example"],
    ["https://ironclad.example/", "https://ironclad.example"],
    [" https://IRONCLAD.example:443/ ", "https://ironclad.example"],
    [
      "https://preview.ironclad.example:8443",
      "https://preview.ironclad.example:8443",
    ],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeSteamOpenIdOrigin(input)).toBe(expected);
  });

  it.each([
    "",
    "http://ironclad.example",
    "https://*.ironclad.example",
    "https://user@ironclad.example",
    "https://ironclad.example/path",
    "https://ironclad.example?next=/profile",
    "https://ironclad.example/#fragment",
    "not-a-url",
  ])("rejects an untrusted origin %s", (input) => {
    expectSteamErrorCode(
      () => normalizeSteamOpenIdOrigin(input),
      "invalid_configuration"
    );
  });
});

describe("Steam authentication request", () => {
  it("generates 32 bytes of opaque base64url state", () => {
    const first = generateSteamOpenIdState();
    const second = generateSteamOpenIdState();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(first, "base64url")).toHaveLength(32);
    expect(second).not.toBe(first);
  });

  it("builds the exact fixed-provider authentication request", () => {
    const authenticationUrl = new URL(
      buildSteamOpenIdAuthenticationUrl(ORIGIN, STATE)
    );

    expect(authenticationUrl.origin + authenticationUrl.pathname).toBe(
      STEAM_OPENID_ENDPOINT
    );
    expect(Object.fromEntries(authenticationUrl.searchParams)).toEqual({
      "openid.ns": STEAM_OPENID_NAMESPACE,
      "openid.mode": "checkid_setup",
      "openid.claimed_id": STEAM_OPENID_IDENTIFIER_SELECT,
      "openid.identity": STEAM_OPENID_IDENTIFIER_SELECT,
      "openid.return_to": EXPECTED_RETURN_TO,
      "openid.realm": `${ORIGIN}/`,
    });
    expect(
      new URL(authenticationUrl.searchParams.get("openid.return_to")!)
        .searchParams
    ).toEqual(new URLSearchParams({ state: STATE }));
  });

  it("rejects a state that was not generated in the expected format", () => {
    expectSteamErrorCode(
      () => buildSteamOpenIdAuthenticationUrl(ORIGIN, "predictable"),
      "invalid_state"
    );
  });
});

describe("Steam flow cookie", () => {
  it("creates a short-lived host-only secure cookie payload", () => {
    const flow = createSteamOpenIdFlow(SESSION_ID, NOW_MS);
    const decodedCookie = Buffer.from(
      flow.cookieValue,
      "base64url"
    ).toString("utf8");

    expect(STEAM_OPENID_FLOW_COOKIE_NAME).toMatch(/^__Host-/);
    expect(flow.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(flow.expiresAt.getTime()).toBe(
      NOW_MS + STEAM_OPENID_FLOW_TTL_SECONDS * 1_000
    );
    expect(flow.cookieOptions).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: STEAM_OPENID_FLOW_TTL_SECONDS,
      expires: flow.expiresAt,
    });
    expect(flow.cookieOptions).not.toHaveProperty("domain");
    expect(decodedCookie).not.toContain(SESSION_ID);
  });

  it("accepts the matching state and Clerk session", () => {
    const flow = createSteamOpenIdFlow(SESSION_ID, NOW_MS);

    expect(
      validateSteamOpenIdFlowCookie({
        cookieValue: flow.cookieValue,
        returnedState: flow.state,
        sessionId: SESSION_ID,
        nowMs: NOW_MS + 1_000,
      })
    ).toEqual({ ok: true });
  });

  it("rejects a different state", () => {
    const flow = createSteamOpenIdFlow(SESSION_ID, NOW_MS);

    expect(
      validateSteamOpenIdFlowCookie({
        cookieValue: flow.cookieValue,
        returnedState: "B".repeat(43),
        sessionId: SESSION_ID,
        nowMs: NOW_MS + 1_000,
      })
    ).toEqual({ ok: false, reason: "state_mismatch" });
  });

  it("rejects a different Clerk session", () => {
    const flow = createSteamOpenIdFlow(SESSION_ID, NOW_MS);

    expect(
      validateSteamOpenIdFlowCookie({
        cookieValue: flow.cookieValue,
        returnedState: flow.state,
        sessionId: "sess_test_different",
        nowMs: NOW_MS + 1_000,
      })
    ).toEqual({ ok: false, reason: "session_mismatch" });
  });

  it("rejects an expired flow", () => {
    const flow = createSteamOpenIdFlow(SESSION_ID, NOW_MS);

    expect(
      validateSteamOpenIdFlowCookie({
        cookieValue: flow.cookieValue,
        returnedState: flow.state,
        sessionId: SESSION_ID,
        nowMs: flow.expiresAt.getTime(),
      })
    ).toEqual({ ok: false, reason: "expired" });
  });

  it.each([undefined, null, "", "not-base64url!"])(
    "rejects a missing or malformed cookie %s",
    (cookieValue) => {
      expect(
        validateSteamOpenIdFlowCookie({
          cookieValue,
          returnedState: STATE,
          sessionId: SESSION_ID,
          nowMs: NOW_MS,
        })
      ).toMatchObject({ ok: false });
    }
  );
});

describe("parseSteamId64FromClaimedId", () => {
  it.each([
    [
      "https://steamcommunity.com/openid/id/18446744073709551614",
      "18446744073709551614",
    ],
    [
      "http://steamcommunity.com/openid/id/18446744073709551614",
      "18446744073709551614",
    ],
    ["https://steamcommunity.com/openid/id/0", "0"],
    [
      "https://steamcommunity.com/openid/id/18446744073709551615",
      "18446744073709551615",
    ],
  ])("accepts the exact claimed identifier %s", (claimedId, expected) => {
    expect(parseSteamId64FromClaimedId(claimedId)).toBe(expected);
  });

  it.each([
    "ftp://steamcommunity.com/openid/id/18446744073709551614",
    "https://evil.example/openid/id/18446744073709551614",
    "https://steamcommunity.com.evil.example/openid/id/18446744073709551614",
    "https://steamcommunity.com:444/openid/id/18446744073709551614",
    "https://user@steamcommunity.com/openid/id/18446744073709551614",
    "https://steamcommunity.com/openid/id/18446744073709551614/extra",
    "https://steamcommunity.com/openid/id/18446744073709551614?query=1",
    "https://steamcommunity.com/openid/id/18446744073709551614#fragment",
    "https://steamcommunity.com/openid/id/001",
    "https://steamcommunity.com/openid/id/-1",
    "https://steamcommunity.com/openid/id/1.5",
    "https://steamcommunity.com/openid/id/abc",
    "https://steamcommunity.com/openid/id/18446744073709551616",
    "https://steamcommunity.com/openid/id/1\n",
  ])("rejects an invalid claimed identifier %s", (claimedId) => {
    expectSteamErrorCode(
      () => parseSteamId64FromClaimedId(claimedId),
      "invalid_callback"
    );
  });
});

describe("validateSteamOpenIdCallback", () => {
  it("returns a validated positive assertion", () => {
    const callback = validateSteamOpenIdCallback(
      createPositiveCallback(),
      EXPECTED_RETURN_TO,
      NOW_MS
    );

    expect(callback.status).toBe("positive");

    if (callback.status !== "positive") {
      throw new Error("Expected a positive callback fixture.");
    }

    expect(callback.assertion.claimedId).toBe(CLAIMED_ID);
    expect(
      Object.fromEntries(callback.assertion.openIdParameters)
    ).toMatchObject({
      "openid.mode": "id_res",
      "openid.return_to": EXPECTED_RETURN_TO,
    });
  });

  it("recognizes Steam cancellation", () => {
    expect(
      validateSteamOpenIdCallback(
        new URLSearchParams({
          state: STATE,
          "openid.mode": "cancel",
        }),
        EXPECTED_RETURN_TO,
        NOW_MS
      )
    ).toEqual({ status: "cancelled" });
  });

  it("accepts a fresh response nonce with only the required timestamp", () => {
    expect(
      validateSteamOpenIdCallback(
        createPositiveCallback({
          "openid.response_nonce": "2026-07-30T10:00:00Z",
        }),
        EXPECTED_RETURN_TO,
        NOW_MS
      )
    ).toMatchObject({ status: "positive" });
  });

  it("extracts one opaque state and rejects duplicate state", () => {
    expect(
      getSteamOpenIdCallbackState(
        new URLSearchParams({ state: STATE })
      )
    ).toBe(STATE);

    const duplicated = new URLSearchParams({ state: STATE });
    duplicated.append("state", STATE);

    expect(getSteamOpenIdCallbackState(duplicated)).toBeNull();
  });

  it.each([
    ["openid.mode", "checkid_setup"],
    ["openid.ns", "http://specs.openid.net/auth/1.1"],
    ["openid.op_endpoint", "https://evil.example/openid/login"],
    ["openid.return_to", `${EXPECTED_RETURN_TO}&extra=1`],
    ["openid.identity", "http://steamcommunity.com/openid/id/1"],
    ["openid.claimed_id", "https://evil.example/openid/id/1"],
    ["openid.response_nonce", "2026-07-30T09:49:59Zold"],
    ["openid.response_nonce", "2026-07-30T10:01:01Zfuture"],
    ["openid.response_nonce", "2026-07-30T10:00:00Z invalid"],
    ["openid.response_nonce", "not-a-nonce"],
  ])("rejects invalid callback parameter %s", (name, value) => {
    expectSteamErrorCode(
      () =>
        validateSteamOpenIdCallback(
          createPositiveCallback({ [name]: value }),
          EXPECTED_RETURN_TO,
          NOW_MS
        ),
      "invalid_callback"
    );
  });

  it.each([
    "op_endpoint",
    "claimed_id",
    "identity",
    "return_to",
    "response_nonce",
    "assoc_handle",
  ])("requires %s to be covered by the signature", (field) => {
    const signed = REQUIRED_SIGNED_FIELDS.split(",")
      .filter((candidate) => candidate !== field)
      .join(",");

    expectSteamErrorCode(
      () =>
        validateSteamOpenIdCallback(
          createPositiveCallback({ "openid.signed": signed }),
          EXPECTED_RETURN_TO,
          NOW_MS
        ),
      "invalid_callback"
    );
  });

  it.each([
    "openid.assoc_handle",
    "openid.sig",
    "openid.signed",
    "openid.claimed_id",
  ])("rejects a missing required parameter %s", (name) => {
    expectSteamErrorCode(
      () =>
        validateSteamOpenIdCallback(
          createPositiveCallback({ [name]: null }),
          EXPECTED_RETURN_TO,
          NOW_MS
        ),
      "invalid_callback"
    );
  });

  it("rejects duplicate OpenID fields", () => {
    const parameters = createPositiveCallback();
    parameters.append("openid.mode", "id_res");

    expectSteamErrorCode(
      () =>
        validateSteamOpenIdCallback(
          parameters,
          EXPECTED_RETURN_TO,
          NOW_MS
        ),
      "invalid_callback"
    );
  });
});

describe("verifySteamOpenIdAssertion", () => {
  it("posts every OpenID field to the fixed endpoint with only mode changed", async () => {
    const assertion = createPositiveAssertion();
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        `ns:${STEAM_OPENID_NAMESPACE}\nis_valid:true\n`,
        { status: 200 }
      )
    );

    await expect(
      verifySteamOpenIdAssertion(assertion, {
        fetchImpl: fetchImpl as typeof fetch,
      })
    ).resolves.toBe("18446744073709551615");

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [endpoint, init] = fetchImpl.mock.calls[0] as [
      string,
      RequestInit,
    ];
    const body = new URLSearchParams(init.body as string);

    expect(endpoint).toBe(STEAM_OPENID_ENDPOINT);
    expect(init).toMatchObject({
      method: "POST",
      cache: "no-store",
      redirect: "error",
    });
    expect(body.get("openid.mode")).toBe("check_authentication");
    expect(body.get("openid.claimed_id")).toBe(CLAIMED_ID);
    expect(body.get("openid.sig")).toBe("signature");
    expect(body.has("state")).toBe(false);
  });

  it("rejects Steam is_valid:false", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(
          `ns:${STEAM_OPENID_NAMESPACE}\nis_valid:false\n`,
          { status: 200 }
        )
      );

    await expect(
      verifySteamOpenIdAssertion(createPositiveAssertion(), {
        fetchImpl: fetchImpl as typeof fetch,
      })
    ).rejects.toMatchObject({
      code: "verification_failed",
    });
  });

  it("rejects a verification response without the OpenID namespace", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("is_valid:true\n", { status: 200 }));

    await expect(
      verifySteamOpenIdAssertion(createPositiveAssertion(), {
        fetchImpl: fetchImpl as typeof fetch,
      })
    ).rejects.toMatchObject({
      code: "verification_failed",
    });
  });

  it("fails closed on a non-success provider response", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 503 }));

    await expect(
      verifySteamOpenIdAssertion(createPositiveAssertion(), {
        fetchImpl: fetchImpl as typeof fetch,
      })
    ).rejects.toMatchObject({
      code: "provider_unavailable",
    });
  });

  it("aborts a verification request at the bounded timeout", async () => {
    const fetchImpl = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () =>
              reject(
                new DOMException("The request was aborted.", "AbortError")
              ),
            { once: true }
          );
        })
    );

    await expect(
      verifySteamOpenIdAssertion(createPositiveAssertion(), {
        fetchImpl: fetchImpl as typeof fetch,
        timeoutMs: 5,
      })
    ).rejects.toMatchObject({
      code: "verification_timeout",
    });
  });
});

describe("fetchSteamDisplayName", () => {
  it("returns the exact Unicode display name for the verified SteamID64", async () => {
    const displayName = "鉄の狼 ⚔️ ™ <Rifle & Co>";
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        response: {
          players: [
            {
              personaname: displayName,
              steamid: STEAM_ID64,
            },
          ],
        },
      })
    );

    await expect(
      fetchSteamDisplayName(STEAM_ID64, {
        apiKey: STEAM_WEB_API_KEY,
        fetchImpl: fetchImpl as typeof fetch,
      })
    ).resolves.toBe(displayName);

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [input, init] = fetchImpl.mock.calls[0] as [
      RequestInfo | URL,
      RequestInit,
    ];
    const requestUrl = new URL(String(input));

    expect(`${requestUrl.origin}${requestUrl.pathname}`).toBe(
      STEAM_PLAYER_SUMMARIES_ENDPOINT
    );
    expect(Object.fromEntries(requestUrl.searchParams)).toEqual({
      key: STEAM_WEB_API_KEY,
      steamids: STEAM_ID64,
    });
    expect(init).toMatchObject({
      cache: "no-store",
      method: "GET",
      redirect: "error",
    });
  });

  it("does not call Steam when the server API key is missing", async () => {
    const fetchImpl = vi.fn();

    await expect(
      fetchSteamDisplayName(STEAM_ID64, {
        apiKey: "   ",
        fetchImpl: fetchImpl as typeof fetch,
      })
    ).resolves.toBeNull();

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a persona returned for a different SteamID64", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        response: {
          players: [
            {
              personaname: "Untrusted Name",
              steamid: "18446744073709551613",
            },
          ],
        },
      })
    );

    await expect(
      fetchSteamDisplayName(STEAM_ID64, {
        apiKey: STEAM_WEB_API_KEY,
        fetchImpl: fetchImpl as typeof fetch,
      })
    ).resolves.toBeNull();
  });

  it.each([
    ["non-success response", new Response("", { status: 503 })],
    ["malformed JSON", new Response("{", { status: 200 })],
    [
      "malformed player summary",
      Response.json({
        response: {
          players: [{ personaname: 123, steamid: STEAM_ID64 }],
        },
      }),
    ],
  ])("returns null for a %s", async (_scenario, response) => {
    const fetchImpl = vi.fn().mockResolvedValue(response);

    await expect(
      fetchSteamDisplayName(STEAM_ID64, {
        apiKey: STEAM_WEB_API_KEY,
        fetchImpl: fetchImpl as typeof fetch,
      })
    ).resolves.toBeNull();
  });

  it("aborts a player-summary request at the bounded timeout", async () => {
    const fetchImpl = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () =>
              reject(
                new DOMException("The request was aborted.", "AbortError")
              ),
            { once: true }
          );
        })
    );

    await expect(
      fetchSteamDisplayName(STEAM_ID64, {
        apiKey: STEAM_WEB_API_KEY,
        fetchImpl: fetchImpl as typeof fetch,
        timeoutMs: 5,
      })
    ).resolves.toBeNull();

    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
