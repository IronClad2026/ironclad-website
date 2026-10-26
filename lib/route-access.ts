const PUBLIC_ROUTE_ROOTS = [
  "/sign-in",
  "/sign-up",
  "/tournaments",
  "/rules",
  "/terms",
  "/privacy",
  "/documents-rules-ppa",
  "/rankings",
  "/about",
  "/players",
  "/announcements",
  "/news",
] as const;

const SELF_AUTHENTICATED_API_ROOTS = ["/api/match-proofs"] as const;

const SELF_AUTHENTICATED_EXACT_API_PATHS = [
  "/api/cron/combat-highlights-cleanup",
  "/api/polls",
  "/api/internal/transactional-email",
  "/api/notifications/click",
  "/api/partners/v1/tournaments",
] as const;

export function isPublicPathname(pathname: string) {
  if (pathname === "/") {
    return true;
  }

  return PUBLIC_ROUTE_ROOTS.some(
    (routeRoot) =>
      pathname === routeRoot || pathname.startsWith(`${routeRoot}/`),
  );
}

export function isSelfAuthenticatedApiPathname(pathname: string) {
  return (
    isPartnerCompetitionApiPathname(pathname) ||
    SELF_AUTHENTICATED_EXACT_API_PATHS.some(
      (routePath) => pathname === routePath,
    ) ||
    SELF_AUTHENTICATED_API_ROOTS.some(
      (routeRoot) =>
        pathname === routeRoot || pathname.startsWith(`${routeRoot}/`),
    )
  );
}

// Only the three implemented route shapes bypass Clerk session protection.
// Each route must independently authorize its server-to-server partner token.
function isPartnerCompetitionApiPathname(pathname: string) {
  const tournamentsPrefix = "/api/partners/v1/tournaments/";
  if (pathname.startsWith(tournamentsPrefix)) {
    return isSingleDecodedSegment(pathname.slice(tournamentsPrefix.length));
  }
  const playerPrefix = "/api/partners/v1/players/";
  const playerSuffix = "/tournaments";
  return (
    pathname.startsWith(playerPrefix) &&
    pathname.endsWith(playerSuffix) &&
    isSingleDecodedSegment(
      pathname.slice(playerPrefix.length, -playerSuffix.length),
    )
  );
}

function isSingleDecodedSegment(segment: string) {
  try {
    const decoded = decodeURIComponent(segment);
    return (
      decoded !== "." &&
      decoded !== ".." &&
      /^[^/\\\u0000-\u001f\u007f]+$/.test(decoded)
    );
  } catch {
    return false;
  }
}
