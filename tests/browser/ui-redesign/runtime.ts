import { useSyncExternalStore } from "react";
import {
  badgeFixture, careerFixture, fixtureDate, fixturePlayerId, fixtureUserId,
  notificationFixture, parameters, profileFixture, registrationFixtures,
} from "./fixtures";

declare global {
  interface Window {
    __uiFixture: { actions: string[]; navigations: string[]; blockedRequests: string[] };
  }
}
window.__uiFixture ??= { actions: [], navigations: [], blockedRequests: [] };

const nativeFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (url.origin !== location.origin || url.pathname.startsWith("/api/") || method !== "GET") {
    window.__uiFixture.blockedRequests.push(url.pathname);
    return Promise.reject(new Error("UI fixture blocked an external or API request."));
  }
  return nativeFetch(input, init);
};

const subscribe = (listener: () => void) => { window.addEventListener("popstate", listener); return () => window.removeEventListener("popstate", listener); };
export function fixtureNavigate(destination: string) {
  window.__uiFixture.navigations.push(destination);
  const requested = new URL(destination, location.origin);
  if (!requested.pathname.startsWith("/tournaments")) return;
  const current = parameters();
  for (const key of ["tournament", "tab", "match", "q"]) current.delete(key);
  requested.searchParams.forEach((value, key) => current.set(key, value));
  history.replaceState(null, "", `/tests/browser/ui-redesign/?${current}${requested.hash}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
export const useRouter = () => ({ push: fixtureNavigate, replace: fixtureNavigate, refresh() {} });
export const usePathname = () => parameters().get("surface") === "dashboard" ? "/dashboard" : "/tournaments";
export function useSearchParams() { const search = useSyncExternalStore(subscribe, () => location.search, () => ""); return new URLSearchParams(search); }
const fixtureToken = async () => null;
export const useAuth = () => ({ isLoaded: true, isSignedIn: parameters().get("surface") === "dashboard", userId: parameters().get("surface") === "dashboard" ? fixtureUserId : null, getToken: fixtureToken });
export const auth = async () => ({ userId: fixtureUserId, sessionClaims: { metadata: { role: "player" } } });
export const redirect = (path: string): never => { throw new Error(`Fixture redirect: ${path}`); };
export const getRequestLocale = async () => parameters().get("locale") === "ru" ? "ru" as const : "en" as const;

export function createAuthenticatedBrowserSupabaseClient() {
  const reject = (): never => { throw new Error("UI fixture must not contact Supabase."); };
  return { from: reject, rpc: reject, storage: { from: reject } };
}
export function createSupabaseAdminClient(): never { throw new Error("UI fixture must not contact an admin database."); }
export async function createAuthenticatedSupabaseClient() {
  return { from(table: string) {
    if (table !== "players" && table !== "registrations") throw new Error("Unrecognized fixture table.");
    const query = {
      select() { return query; }, eq() { return query; },
      async maybeSingle() { return { data: parameters().has("noProfile") ? null : profileFixture(), error: null }; },
      async order() { return { data: registrationFixtures(), error: null }; },
    };
    return query;
  } };
}
export const loadPlayerCareerDashboard = async () => careerFixture();
export const loadPlayerNotifications = async () => ({ notifications: notificationFixture(), totalCount: notificationFixture().length, unreadCount: notificationFixture().length, error: null });
export const loadCommunityPollsForRequest = async () => ({ polls: [], error: null });
export const loadPlayerTournamentDivisionInvitations = async () => ({ status: "success", invitations: parameters().has("empty") ? [] : [
  { id: "fixture-invitation", status: parameters().has("accepted") ? "accepted" : "pending", createdAt: fixtureDate, invalidationReason: null, targetTournamentId: fixturePlayerId, targetTournamentSlug: "fixture-event-2", targetTournamentTitle: "IronClad Open 2", targetDivisionName: "Academy" },
] });
export const loadPlayerBadgeRevealDashboardState = async () => ({ status: "success", badgeData: badgeFixture(), pendingReveals: [] });

export async function fixtureAction(name: string, _args: unknown[]) {
  void _args;
  window.__uiFixture.actions.push(name);
  if (name === "getNotificationPushConfiguration") return { ok: true, enabled: false, publicKey: null };
  if (name === "loadAuthoritativeNotificationUnreadCount") return { ok: true, unreadCount: notificationFixture().length };
  return { status: "error", ok: false, message: "Local UI fixture: action isolated; no data was changed." };
}
