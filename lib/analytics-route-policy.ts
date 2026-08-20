const MAX_ANALYTICS_URL_LENGTH = 2_048;

const EXACT_PUBLIC_PATHS = new Set([
  "/",
  "/about",
  "/rankings",
  "/rules",
  "/terms",
  "/privacy",
  "/players",
  "/tournaments",
]);

const PLAYER_PROFILE_PATH_PATTERN =
  /^\/players\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const NORMALIZED_PLAYER_PROFILE_PATH = "/players/[playerId]";

/**
 * Returns the only URL that may be sent to Web Analytics, or null when the
 * candidate does not match IronClad's deliberately narrow public-route policy.
 */
export function sanitizeAnalyticsEventUrl(
  candidate: unknown,
  expectedOrigin: unknown
): string | null {
  if (
    typeof candidate !== "string" ||
    candidate.length === 0 ||
    candidate.length > MAX_ANALYTICS_URL_LENGTH ||
    typeof expectedOrigin !== "string" ||
    expectedOrigin.length === 0 ||
    candidate.includes("?") ||
    candidate.includes("#")
  ) {
    return null;
  }

  let url: URL;
  let origin: URL;

  try {
    url = new URL(candidate);
    origin = new URL(expectedOrigin);
  } catch {
    return null;
  }

  if (
    url.protocol !== "https:" ||
    origin.protocol !== "https:" ||
    origin.pathname !== "/" ||
    origin.search !== "" ||
    origin.hash !== "" ||
    origin.username !== "" ||
    origin.password !== "" ||
    url.origin !== origin.origin ||
    url.username !== "" ||
    url.password !== "" ||
    !hasCanonicalRawPath(candidate, url.pathname)
  ) {
    return null;
  }

  let sanitizedPath: string;

  if (EXACT_PUBLIC_PATHS.has(url.pathname)) {
    sanitizedPath = url.pathname;
  } else if (PLAYER_PROFILE_PATH_PATTERN.test(url.pathname)) {
    sanitizedPath = NORMALIZED_PLAYER_PROFILE_PATH;
  } else {
    return null;
  }

  return new URL(sanitizedPath, origin.origin).href;
}

/**
 * Validates a provider-supplied requestPath before it enters the Admin model.
 * Raw Player IDs and opaque provider roll-ups deliberately fail closed.
 */
export function sanitizeAnalyticsBreakdownPath(
  candidate: unknown
): string | null {
  if (typeof candidate !== "string") return null;

  return EXACT_PUBLIC_PATHS.has(candidate) ||
    candidate === NORMALIZED_PLAYER_PROFILE_PATH
    ? candidate
    : null;
}

function hasCanonicalRawPath(candidate: string, parsedPathname: string) {
  const authorityStart = "https://".length;
  const pathStart = candidate.indexOf("/", authorityStart);
  const rawPath = pathStart === -1 ? "/" : candidate.slice(pathStart);

  return rawPath === parsedPathname;
}
