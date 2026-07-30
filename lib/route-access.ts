const PUBLIC_ROUTE_ROOTS = [
  "/sign-in",
  "/sign-up",
  "/tournaments",
  "/rules",
  "/rankings",
  "/about",
  "/players",
] as const;

const SELF_AUTHENTICATED_API_ROOTS = ["/api/match-proofs"] as const;

export function isPublicPathname(pathname: string) {
  if (pathname === "/") {
    return true;
  }

  return PUBLIC_ROUTE_ROOTS.some(
    (routeRoot) =>
      pathname === routeRoot || pathname.startsWith(`${routeRoot}/`)
  );
}

export function isSelfAuthenticatedApiPathname(pathname: string) {
  return SELF_AUTHENTICATED_API_ROOTS.some(
    (routeRoot) =>
      pathname === routeRoot || pathname.startsWith(`${routeRoot}/`)
  );
}
