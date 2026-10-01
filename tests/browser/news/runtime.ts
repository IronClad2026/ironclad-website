import type { Locale } from "@/lib/i18n/config";
import { parameters } from "./fixtures";

declare global {
  interface Window {
    __newsFixture: { blockedRequests: string[]; navigations: string[] };
  }
}

window.__newsFixture ??= { blockedRequests: [], navigations: [] };
const nativeFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    location.href
  );
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (url.origin !== location.origin || url.pathname.startsWith("/api/") || method !== "GET") {
    window.__newsFixture.blockedRequests.push(url.pathname);
    return Promise.reject(new Error("News fixture blocked a live or mutating request."));
  }
  return nativeFetch(input, init);
};

export const usePathname = () => parameters().get("surface") === "home" ? "/" : "/news";
export const useRouter = () => ({
  push: fixtureNavigate,
  replace: fixtureNavigate,
  refresh() {},
});
export function fixtureNavigate(destination: string) {
  window.__newsFixture.navigations.push(destination);
}
export function useAuth() {
  const state = parameters().get("auth") ?? "signedout";
  return {
    isLoaded: true,
    isSignedIn: state !== "signedout",
    userId: state === "signedout" ? null : "fixture-news-user",
    sessionClaims: { metadata: { role: state === "admin" ? "admin" : "player" } },
  };
}
export const useAnnouncementUnreadState = () => parameters().get("unread") === "1";
export const syncLocalePreferenceAfterAuth = async () => ({
  ok: true,
  status: "already-matched",
});
export const setLocalePreference = async (locale: Locale) => ({
  ok: true,
  locale,
  metadataMirror: "not-signed-in",
});
