import "server-only";

const MAX_ENDPOINT_BYTES = 2_048;
const MAX_KEY_CHARACTERS = 128;
const WINDOWS_PUSH_SUFFIX = ".notify.windows.com";
const APPLE_PUSH_SUFFIX = ".push.apple.com";

const EXACT_PUSH_SERVICE_HOSTS = new Set([
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
]);

export type WebPushSubscriptionInput = {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export type ValidatedWebPushSubscription = {
  endpoint: string;
  expiresAt: string | null;
  p256dh: string;
  auth: string;
};

export function parseWebPushEndpoint(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim() ||
    Buffer.byteLength(value, "utf8") > MAX_ENDPOINT_BYTES ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return null;
  }

  let endpoint: URL;

  try {
    endpoint = new URL(value);
  } catch {
    return null;
  }

  const authority = /^https:\/\/([^/?#]+)(?:[/?#]|$)/i.exec(value)?.[1];
  const hostname = endpoint.hostname.toLowerCase();
  const allowedHost =
    EXACT_PUSH_SERVICE_HOSTS.has(hostname) ||
    isAllowedProviderSubdomain(hostname, WINDOWS_PUSH_SUFFIX) ||
    isAllowedProviderSubdomain(hostname, APPLE_PUSH_SUFFIX);

  if (
    endpoint.protocol !== "https:" ||
    !authority ||
    authority.toLowerCase() !== hostname ||
    endpoint.username ||
    endpoint.password ||
    endpoint.port ||
    endpoint.hash ||
    !allowedHost
  ) {
    return null;
  }

  return endpoint.href;
}

export function parseWebPushSubscription(
  value: unknown,
  now = Date.now()
): ValidatedWebPushSubscription | null {
  if (!isRecord(value)) return null;

  const endpoint = parseWebPushEndpoint(value.endpoint);
  const keys = value.keys;

  if (!endpoint || !isRecord(keys)) return null;

  const p256dh = parseBase64UrlKey(keys.p256dh, 65, true);
  const auth = parseBase64UrlKey(keys.auth, 16, false);
  const expiresAt = parseExpirationTime(value.expirationTime, now);

  if (!p256dh || !auth || expiresAt === undefined) return null;

  return { endpoint, expiresAt, p256dh, auth };
}

export function parseVapidPublicKey(value: unknown): string | null {
  return parseBase64UrlKey(value, 65, true);
}

function parseExpirationTime(
  value: unknown,
  now: number
): string | null | undefined {
  if (value === undefined || value === null) return null;

  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= now
  ) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function parseBase64UrlKey(
  value: unknown,
  expectedBytes: number,
  requireUncompressedPoint: boolean
): string | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_KEY_CHARACTERS ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    return null;
  }

  let decoded: Buffer;

  try {
    decoded = Buffer.from(value, "base64url");
  } catch {
    return null;
  }

  if (
    decoded.length !== expectedBytes ||
    decoded.toString("base64url") !== value ||
    (requireUncompressedPoint && decoded[0] !== 0x04)
  ) {
    return null;
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAllowedProviderSubdomain(hostname: string, suffix: string) {
  if (!hostname.endsWith(suffix)) return false;

  const subdomain = hostname.slice(0, -suffix.length);
  return /^(?!-)[a-z0-9-]{1,63}(?<!-)$/.test(subdomain);
}
