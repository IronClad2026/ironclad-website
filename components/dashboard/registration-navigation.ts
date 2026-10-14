/** Resolve legacy registration links only against the current rendered Dashboard. */
export function resolveDashboardRegistrationHref(href: string): {
  href: string;
  target: HTMLElement | null;
} {
  const unchanged = { href, target: null };
  if (typeof window === "undefined" || window.location.pathname !== "/dashboard") return unchanged;
  const dashboard = document.querySelector("[data-dashboard-command-centre]");
  if (!dashboard) return unchanged;
  let destination: URL;
  try {
    destination = new URL(href, window.location.origin);
  } catch {
    return unchanged;
  }
  if (
    destination.origin !== window.location.origin ||
    destination.pathname !== "/dashboard" ||
    !destination.hash.startsWith("#registration-")
  ) return unchanged;

  let target: HTMLElement | null = null;
  try {
    target = document.getElementById(decodeURIComponent(destination.hash.slice(1)));
  } catch {
    // Malformed old hashes receive the same safe Dashboard fallback.
  }
  if (target && dashboard.contains(target) && target.matches('[data-registration-presentation="current"]')) {
    return { href, target };
  }
  return { href: `${destination.pathname}${destination.search}`, target: null };
}
