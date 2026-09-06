export const DASHBOARD_REGISTRATION_NAVIGATION = "ironclad:dashboard-registration-navigation";

/** Reveal a mounted history panel even when Next navigates to the same hash. */
export function notifyDashboardRegistrationNavigation(href: string) {
  if (typeof window === "undefined") return;
  let destination: URL;
  try {
    destination = new URL(href, window.location.origin);
  } catch {
    return;
  }
  if (
    destination.origin !== window.location.origin ||
    destination.pathname !== "/dashboard" ||
    !destination.hash.startsWith("#registration-")
  ) return;
  window.dispatchEvent(new CustomEvent<string>(DASHBOARD_REGISTRATION_NAVIGATION, {
    detail: destination.hash.slice(1),
  }));
}
