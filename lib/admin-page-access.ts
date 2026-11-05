import "server-only";

import { auth } from "@clerk/nextjs/server";

type AdminPageQuery = Record<string, string | string[] | undefined>;

const ADMIN_QUERY_KEYS = ["filter", "selected", "notice", "detail", "focus", "bracketNotice"];
const TOURNAMENT_LIST_QUERY_KEYS = ["selected", "edit", "error", "notice"];
const TOURNAMENT_QUERY_KEYS = [
  "section", "filter", "page", "selected", "match", "room", "legacyPage", "legacyResolved",
  "bracketNotice", "detail", "error", "focus", "notice",
];
const TOURNAMENT_PATH = /^\/admin\/tournaments\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Build a same-site return target from a fixed page path, never a request URL or redirect parameter. */
export function buildAdminPageReturnPath(pathname: string, query?: AdminPageQuery): string {
  const keys = pathname === "/admin"
    ? ADMIN_QUERY_KEYS
    : pathname === "/admin/tournaments"
      ? TOURNAMENT_LIST_QUERY_KEYS
      : TOURNAMENT_PATH.test(pathname)
        ? TOURNAMENT_QUERY_KEYS
        : null;

  if (!keys) return "/admin";

  const search = new URLSearchParams();
  for (const key of keys) {
    const value = query?.[key];
    if (typeof value === "string") search.append(key, value);
    else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") search.append(key, item);
      }
    }
  }
  const suffix = search.toString();
  return suffix ? `${pathname}?${suffix}` : pathname;
}

/** This page gate supplements, and does not replace, authorization in privileged loaders and actions. */
export async function hasAdminPageAccess(pathname: string, query?: AdminPageQuery): Promise<boolean> {
  const { userId, sessionClaims, redirectToSignIn } = await auth();
  if (!userId) {
    return redirectToSignIn({ returnBackUrl: buildAdminPageReturnPath(pathname, query) });
  }

  return (sessionClaims as { metadata?: { role?: unknown } } | null)?.metadata?.role === "admin";
}
