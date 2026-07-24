const PUBLIC_ROUTE_ROOTS = [
  "/sign-in",
  "/sign-up",
  "/tournaments",
  "/rules",
  "/rankings",
  "/about",
  "/players",
] as const;

export function isPublicPathname(pathname: string) {
  if (pathname === "/") {
    return true;
  }

  return PUBLIC_ROUTE_ROOTS.some(
    (routeRoot) =>
      pathname === routeRoot || pathname.startsWith(`${routeRoot}/`)
  );
}
