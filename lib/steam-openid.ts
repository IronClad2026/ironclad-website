import "server-only";

import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const STEAM_OPENID_PROVIDER_IDENTIFIER =
  "https://steamcommunity.com/openid/";
export const STEAM_OPENID_ENDPOINT =
  "https://steamcommunity.com/openid/login";
export const STEAM_OPENID_NAMESPACE =
  "http://specs.openid.net/auth/2.0";
export const STEAM_OPENID_IDENTIFIER_SELECT =
  "http://specs.openid.net/auth/2.0/identifier_select";
export const STEAM_OPENID_CALLBACK_PATH = "/api/steam/callback";
export const STEAM_OPENID_FLOW_COOKIE_NAME =
  "__Host-ironclad-steam-link";
export const STEAM_OPENID_FLOW_TTL_SECONDS = 10 * 60;
export const STEAM_OPENID_REQUEST_TIMEOUT_MS = 5_000;

const FLOW_COOKIE_VERSION = 1;
const FLOW_STATE_BYTE_LENGTH = 32;
const FLOW_STATE_LENGTH = 43;
const FLOW_COOKIE_MAX_LENGTH = 512;
const RESPONSE_NONCE_MAX_AGE_MS = 10 * 60 * 1_000;
const RESPONSE_NONCE_FUTURE_SKEW_MS = 60 * 1_000;
const MAX_STEAM_ID64 = "18446744073709551615";
const MAX_VERIFICATION_RESPONSE_LENGTH = 4_096;
const MAX_REQUEST_TIMEOUT_MS = 15_000;

const REQUIRED_SIGNED_FIELDS = [
  "op_endpoint",
  "claimed_id",
  "identity",
  "return_to",
  "response_nonce",
  "assoc_handle",
] as const;

// This helper deliberately pins Valve's documented claimed-ID namespace and
// OP endpoint as the discovered provider contract. It never accepts a dynamic
// provider or follows a callback-supplied discovery URL.
const ERROR_MESSAGES = {
  invalid_configuration: "Steam OpenID is not configured correctly.",
  invalid_state: "The Steam connection state is invalid.",
  invalid_callback: "Steam returned an invalid authentication response.",
  verification_failed: "Steam could not verify this authentication response.",
  verification_timeout: "Steam verification timed out.",
  provider_unavailable: "Steam verification is currently unavailable.",
} as const;

export type SteamOpenIdErrorCode = keyof typeof ERROR_MESSAGES;

export class SteamOpenIdError extends Error {
  readonly code: SteamOpenIdErrorCode;

  constructor(code: SteamOpenIdErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "SteamOpenIdError";
    this.code = code;
  }
}

export type SteamOpenIdFlowValidation =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "missing"
        | "malformed"
        | "expired"
        | "state_mismatch"
        | "session_mismatch";
    };

export interface SteamOpenIdFlow {
  state: string;
  cookieValue: string;
  expiresAt: Date;
  cookieOptions: {
    httpOnly: true;
    secure: true;
    sameSite: "lax";
    path: "/";
    maxAge: number;
    expires: Date;
  };
}

interface SteamOpenIdFlowCookiePayload {
  v: typeof FLOW_COOKIE_VERSION;
  state: string;
  sessionHash: string;
  expiresAt: number;
}

export interface SteamOpenIdPositiveAssertion {
  claimedId: string;
  openIdParameters: ReadonlyArray<readonly [string, string]>;
}

export type SteamOpenIdCallback =
  | { status: "cancelled" }
  | {
      status: "positive";
      assertion: SteamOpenIdPositiveAssertion;
    };

interface VerifySteamOpenIdOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function isSafeTimestamp(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isValidFlowState(value: string): boolean {
  return (
    value.length === FLOW_STATE_LENGTH &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

function hashSessionId(sessionId: string): string {
  return createHash("sha256").update(sessionId, "utf8").digest("base64url");
}

function safelyEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");

  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

function encodeFlowCookie(payload: SteamOpenIdFlowCookiePayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeFlowCookie(
  cookieValue: string
): SteamOpenIdFlowCookiePayload | null {
  if (
    cookieValue.length === 0 ||
    cookieValue.length > FLOW_COOKIE_MAX_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(cookieValue)
  ) {
    return null;
  }

  try {
    const decodedBytes = Buffer.from(cookieValue, "base64url");

    if (decodedBytes.toString("base64url") !== cookieValue) {
      return null;
    }

    const value: unknown = JSON.parse(decodedBytes.toString("utf8"));

    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);

    if (
      keys.length !== 4 ||
      !keys.includes("v") ||
      !keys.includes("state") ||
      !keys.includes("sessionHash") ||
      !keys.includes("expiresAt") ||
      record.v !== FLOW_COOKIE_VERSION ||
      typeof record.state !== "string" ||
      !isValidFlowState(record.state) ||
      typeof record.sessionHash !== "string" ||
      !isValidFlowState(record.sessionHash) ||
      typeof record.expiresAt !== "number" ||
      !isSafeTimestamp(record.expiresAt)
    ) {
      return null;
    }

    return {
      v: FLOW_COOKIE_VERSION,
      state: record.state,
      sessionHash: record.sessionHash,
      expiresAt: record.expiresAt,
    };
  } catch {
    return null;
  }
}

function requireNonEmptySessionId(sessionId: string): void {
  if (sessionId.length === 0) {
    throw new SteamOpenIdError("invalid_state");
  }
}

function requireValidNow(nowMs: number): void {
  if (!isSafeTimestamp(nowMs)) {
    throw new SteamOpenIdError("invalid_state");
  }
}

export function normalizeSteamOpenIdOrigin(
  value = process.env.STEAM_OPENID_ORIGIN
): string {
  if (!value) {
    throw new SteamOpenIdError("invalid_configuration");
  }

  let parsed: URL;

  try {
    parsed = new URL(value.trim());
  } catch {
    throw new SteamOpenIdError("invalid_configuration");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    parsed.hostname === "" ||
    parsed.hostname.includes("*") ||
    parsed.origin === "null"
  ) {
    throw new SteamOpenIdError("invalid_configuration");
  }

  return parsed.origin;
}

export function generateSteamOpenIdState(): string {
  return randomBytes(FLOW_STATE_BYTE_LENGTH).toString("base64url");
}

export function createSteamOpenIdFlow(
  sessionId: string,
  nowMs = Date.now()
): SteamOpenIdFlow {
  requireNonEmptySessionId(sessionId);
  requireValidNow(nowMs);

  const state = generateSteamOpenIdState();
  const expiresAtMs =
    nowMs + STEAM_OPENID_FLOW_TTL_SECONDS * 1_000;
  const expiresAt = new Date(expiresAtMs);
  const cookieValue = encodeFlowCookie({
    v: FLOW_COOKIE_VERSION,
    state,
    sessionHash: hashSessionId(sessionId),
    expiresAt: expiresAtMs,
  });

  return {
    state,
    cookieValue,
    expiresAt,
    cookieOptions: {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: STEAM_OPENID_FLOW_TTL_SECONDS,
      expires: expiresAt,
    },
  };
}

export function validateSteamOpenIdFlowCookie({
  cookieValue,
  returnedState,
  sessionId,
  nowMs = Date.now(),
}: {
  cookieValue: string | null | undefined;
  returnedState: string | null | undefined;
  sessionId: string;
  nowMs?: number;
}): SteamOpenIdFlowValidation {
  if (!cookieValue) {
    return { ok: false, reason: "missing" };
  }

  if (
    !returnedState ||
    !isValidFlowState(returnedState) ||
    sessionId.length === 0 ||
    !isSafeTimestamp(nowMs)
  ) {
    return { ok: false, reason: "malformed" };
  }

  const payload = decodeFlowCookie(cookieValue);

  if (!payload) {
    return { ok: false, reason: "malformed" };
  }

  if (
    payload.expiresAt <= nowMs ||
    payload.expiresAt - nowMs >
      STEAM_OPENID_FLOW_TTL_SECONDS * 1_000
  ) {
    return {
      ok: false,
      reason:
        payload.expiresAt <= nowMs ? "expired" : "malformed",
    };
  }

  if (!safelyEqual(payload.state, returnedState)) {
    return { ok: false, reason: "state_mismatch" };
  }

  if (!safelyEqual(payload.sessionHash, hashSessionId(sessionId))) {
    return { ok: false, reason: "session_mismatch" };
  }

  return { ok: true };
}

export function buildSteamOpenIdCallbackUrl(
  origin: string,
  state: string
): string {
  const normalizedOrigin = normalizeSteamOpenIdOrigin(origin);

  if (!isValidFlowState(state)) {
    throw new SteamOpenIdError("invalid_state");
  }

  const callbackUrl = new URL(
    STEAM_OPENID_CALLBACK_PATH,
    `${normalizedOrigin}/`
  );
  callbackUrl.searchParams.set("state", state);

  return callbackUrl.toString();
}

export function buildSteamOpenIdAuthenticationUrl(
  origin: string,
  state: string
): string {
  const normalizedOrigin = normalizeSteamOpenIdOrigin(origin);
  const callbackUrl = buildSteamOpenIdCallbackUrl(
    normalizedOrigin,
    state
  );
  const authenticationUrl = new URL(STEAM_OPENID_ENDPOINT);

  authenticationUrl.searchParams.set(
    "openid.ns",
    STEAM_OPENID_NAMESPACE
  );
  authenticationUrl.searchParams.set("openid.mode", "checkid_setup");
  authenticationUrl.searchParams.set(
    "openid.claimed_id",
    STEAM_OPENID_IDENTIFIER_SELECT
  );
  authenticationUrl.searchParams.set(
    "openid.identity",
    STEAM_OPENID_IDENTIFIER_SELECT
  );
  authenticationUrl.searchParams.set(
    "openid.return_to",
    callbackUrl
  );
  authenticationUrl.searchParams.set(
    "openid.realm",
    `${normalizedOrigin}/`
  );

  return authenticationUrl.toString();
}

export function getSteamOpenIdCallbackState(
  parameters: URLSearchParams
): string | null {
  const states = parameters.getAll("state");

  if (states.length !== 1 || !isValidFlowState(states[0])) {
    return null;
  }

  return states[0];
}

function getUniqueOpenIdParameters(
  parameters: URLSearchParams
): URLSearchParams {
  const openIdParameters = new URLSearchParams();
  const seen = new Set<string>();

  for (const [key, value] of parameters.entries()) {
    if (!key.startsWith("openid.")) {
      continue;
    }

    if (seen.has(key)) {
      throw new SteamOpenIdError("invalid_callback");
    }

    seen.add(key);
    openIdParameters.append(key, value);
  }

  return openIdParameters;
}

function requireOpenIdParameter(
  parameters: URLSearchParams,
  name: string
): string {
  const value = parameters.get(name);

  if (!value) {
    throw new SteamOpenIdError("invalid_callback");
  }

  return value;
}

function requireFreshResponseNonce(
  responseNonce: string,
  nowMs: number
): void {
  const match = responseNonce.match(
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)[!-~]*$/
  );

  if (!match || match[0] !== responseNonce) {
    throw new SteamOpenIdError("invalid_callback");
  }

  const timestampMs = Date.parse(match[1]);

  if (
    !Number.isFinite(timestampMs) ||
    new Date(timestampMs).toISOString().replace(".000Z", "Z") !==
      match[1] ||
    timestampMs < nowMs - RESPONSE_NONCE_MAX_AGE_MS ||
    timestampMs > nowMs + RESPONSE_NONCE_FUTURE_SKEW_MS
  ) {
    throw new SteamOpenIdError("invalid_callback");
  }
}

function getSignedFields(signedValue: string): Set<string> {
  const fields = signedValue.split(",");
  const signedFields = new Set<string>();

  for (const field of fields) {
    if (
      field.length === 0 ||
      !/^[A-Za-z0-9_.-]+$/.test(field) ||
      signedFields.has(field)
    ) {
      throw new SteamOpenIdError("invalid_callback");
    }

    signedFields.add(field);
  }

  return signedFields;
}

function hasValidSteamClaimedId(claimedId: string): boolean {
  try {
    parseSteamId64FromClaimedId(claimedId);
    return true;
  } catch {
    return false;
  }
}

export function validateSteamOpenIdCallback(
  parameters: URLSearchParams,
  expectedReturnTo: string,
  nowMs = Date.now()
): SteamOpenIdCallback {
  requireValidNow(nowMs);

  const openIdParameters = getUniqueOpenIdParameters(parameters);
  const mode = requireOpenIdParameter(
    openIdParameters,
    "openid.mode"
  );

  if (mode === "cancel") {
    return { status: "cancelled" };
  }

  if (mode !== "id_res") {
    throw new SteamOpenIdError("invalid_callback");
  }

  if (
    requireOpenIdParameter(openIdParameters, "openid.ns") !==
      STEAM_OPENID_NAMESPACE ||
    requireOpenIdParameter(
      openIdParameters,
      "openid.op_endpoint"
    ) !== STEAM_OPENID_ENDPOINT ||
    requireOpenIdParameter(
      openIdParameters,
      "openid.return_to"
    ) !== expectedReturnTo
  ) {
    throw new SteamOpenIdError("invalid_callback");
  }

  const identity = requireOpenIdParameter(
    openIdParameters,
    "openid.identity"
  );
  const claimedId = requireOpenIdParameter(
    openIdParameters,
    "openid.claimed_id"
  );

  if (
    identity !== claimedId ||
    !hasValidSteamClaimedId(claimedId)
  ) {
    throw new SteamOpenIdError("invalid_callback");
  }

  requireOpenIdParameter(
    openIdParameters,
    "openid.assoc_handle"
  );
  requireOpenIdParameter(openIdParameters, "openid.sig");

  const responseNonce = requireOpenIdParameter(
    openIdParameters,
    "openid.response_nonce"
  );
  requireFreshResponseNonce(responseNonce, nowMs);

  const signedFields = getSignedFields(
    requireOpenIdParameter(openIdParameters, "openid.signed")
  );

  for (const field of REQUIRED_SIGNED_FIELDS) {
    if (
      !signedFields.has(field) ||
      !openIdParameters.has(`openid.${field}`)
    ) {
      throw new SteamOpenIdError("invalid_callback");
    }
  }

  for (const field of signedFields) {
    if (!openIdParameters.has(`openid.${field}`)) {
      throw new SteamOpenIdError("invalid_callback");
    }
  }

  return {
    status: "positive",
    assertion: {
      claimedId,
      openIdParameters: Array.from(
        openIdParameters.entries(),
        ([key, value]) => [key, value] as const
      ),
    },
  };
}

export function parseSteamId64FromClaimedId(
  claimedId: string
): string {
  const match = claimedId.match(
    /^https?:\/\/steamcommunity\.com\/openid\/id\/(0|[1-9][0-9]{0,19})$/
  );

  if (!match || match[0] !== claimedId) {
    throw new SteamOpenIdError("invalid_callback");
  }

  const steamId64 = match[1];

  if (
    steamId64.length === MAX_STEAM_ID64.length &&
    steamId64 > MAX_STEAM_ID64
  ) {
    throw new SteamOpenIdError("invalid_callback");
  }

  return steamId64;
}

function parseVerificationResponse(responseText: string): boolean {
  if (responseText.length > MAX_VERIFICATION_RESPONSE_LENGTH) {
    return false;
  }

  const values = new Map<string, string>();

  for (const line of responseText.split(/\r?\n/)) {
    if (line.length === 0) {
      continue;
    }

    const separatorIndex = line.indexOf(":");

    if (separatorIndex <= 0) {
      return false;
    }

    const key = line.slice(0, separatorIndex);
    const value = line.slice(separatorIndex + 1);

    if (values.has(key)) {
      return false;
    }

    values.set(key, value);
  }

  return (
    values.get("ns") === STEAM_OPENID_NAMESPACE &&
    values.get("is_valid") === "true"
  );
}

export async function verifySteamOpenIdAssertion(
  assertion: SteamOpenIdPositiveAssertion,
  {
    fetchImpl = fetch,
    timeoutMs = STEAM_OPENID_REQUEST_TIMEOUT_MS,
  }: VerifySteamOpenIdOptions = {}
): Promise<string> {
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > MAX_REQUEST_TIMEOUT_MS
  ) {
    throw new SteamOpenIdError("invalid_configuration");
  }

  const verificationParameters = new URLSearchParams();

  for (const [key, value] of assertion.openIdParameters) {
    verificationParameters.append(key, value);
  }

  verificationParameters.set(
    "openid.mode",
    "check_authentication"
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(STEAM_OPENID_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "text/plain",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: verificationParameters.toString(),
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });

    if (response.status !== 200) {
      throw new SteamOpenIdError("provider_unavailable");
    }

    const responseText = await response.text();

    if (controller.signal.aborted) {
      throw new SteamOpenIdError("verification_timeout");
    }

    if (!parseVerificationResponse(responseText)) {
      throw new SteamOpenIdError("verification_failed");
    }

    return parseSteamId64FromClaimedId(assertion.claimedId);
  } catch (error) {
    if (error instanceof SteamOpenIdError) {
      throw error;
    }

    if (controller.signal.aborted) {
      throw new SteamOpenIdError("verification_timeout");
    }

    throw new SteamOpenIdError("provider_unavailable");
  } finally {
    clearTimeout(timeout);
  }
}
