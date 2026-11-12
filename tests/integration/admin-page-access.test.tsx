import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const redirectToSignInMock = vi.hoisted(() => vi.fn(() => {
  throw new Error("CLERK_SIGN_IN");
}));
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const loadWorkspaceMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`);
}));
const notFoundMock = vi.hoisted(() => vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/patch2-admin-access", async () => {
  const { createPatch2AdminAccessFixture } = await import("@/tests/fixtures/patch2-admin-access");
  return createPatch2AdminAccessFixture(authMock);
});
vi.mock("next/navigation", () => ({ redirect: redirectMock, notFound: notFoundMock }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: createSupabaseAdminClientMock }));
vi.mock("@/lib/admin-tournament-workspace", () => ({
  loadAdminTournamentWorkspace: loadWorkspaceMock,
  isAdminTournamentWorkspaceTerminal: vi.fn(),
  loadAdminTournamentBracketWorkspaceData: vi.fn(),
  loadAdminTournamentDeletionPreview: vi.fn(),
  loadAdminTournamentEditorWorkspaceData: vi.fn(),
  loadAdminTournamentMapPoolWorkspaceData: vi.fn(),
}));

import AdminPage from "@/app/admin/page";
import AdminTournamentsPage from "@/app/admin/tournaments/page";
import TournamentWorkspacePage from "@/app/admin/tournaments/[tournamentId]/page";
import { buildAdminPageReturnPath, hasAdminPageAccess } from "@/lib/admin-page-access";

const TOURNAMENT_ID = "f57d9890-5ac1-4c81-a966-f7c9324c937f";
const SELECTED_ID = "30000000-0000-4000-8000-000000000001";
const workspacePath = `/admin/tournaments/${TOURNAMENT_ID}`;
const workspaceQuery = {
  section: "assistance", filter: "resolved", page: "2", selected: SELECTED_ID,
  match: "40000000-0000-4000-8000-000000000001", room: "50000000-0000-4000-8000-000000000001",
  legacyPage: "3", legacyResolved: "1", bracketNotice: "saved", detail: "Check A & B",
  error: "load-failed", focus: "note", notice: "saved",
};
const routes: Array<{
  name: string;
  path: string;
  query: Record<string, string>;
  run: (query: Record<string, string>) => Promise<ReactNode>;
  loader: typeof createSupabaseAdminClientMock;
}> = [
  {
    name: "command center",
    path: "/admin",
    query: { filter: "manual_review", selected: SELECTED_ID, notice: "saved", detail: "A & B", focus: "note", bracketNotice: "saved" },
    run: (query: Record<string, string>) => AdminPage({ searchParams: Promise.resolve(query) }),
    loader: createSupabaseAdminClientMock,
  },
  {
    name: "tournament list",
    path: "/admin/tournaments",
    query: { selected: TOURNAMENT_ID, edit: "1", error: "review", notice: "saved" },
    run: (query: Record<string, string>) => AdminTournamentsPage({ searchParams: Promise.resolve(query) }),
    loader: createSupabaseAdminClientMock,
  },
  {
    name: "tournament workspace",
    path: workspacePath,
    query: workspaceQuery,
    run: (query: Record<string, string>) => TournamentWorkspacePage({
      params: Promise.resolve({ tournamentId: TOURNAMENT_ID }),
      searchParams: Promise.resolve(query),
    }),
    loader: loadWorkspaceMock,
  },
];

describe("admin page authentication and access guidance", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockImplementation(() => { throw new Error("PROTECTED_LOADER_REACHED"); });
    loadWorkspaceMock.mockImplementation(() => { throw new Error("PROTECTED_LOADER_REACHED"); });
  });

  it.each(routes)("sends signed-out users back to the exact supported $name context after sign-in", async (route) => {
    authMock.mockResolvedValue({ userId: null, sessionClaims: null, redirectToSignIn: redirectToSignInMock });

    await expect(route.run(route.query)).rejects.toThrow("CLERK_SIGN_IN");

    const target = buildAdminPageReturnPath(route.path, route.query);
    expect(redirectToSignInMock).toHaveBeenCalledExactlyOnceWith({ returnBackUrl: target });
    expect(new URL(target, "https://example.test").pathname).toBe(route.path);
    expect(Object.fromEntries(new URL(target, "https://example.test").searchParams)).toEqual(route.query);
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
    expect(loadWorkspaceMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it.each(routes)("shows account-switch guidance on the $name without protected queries or legacy redirects", async (route) => {
    authMock.mockResolvedValue({ userId: "local_player", sessionClaims: { metadata: { role: "player" } } });

    const markup = renderToStaticMarkup(await route.run(route.query));

    expect(markup).toContain("Administrator access required");
    expect(markup).toContain("this account does not have administrator access");
    expect(markup).toContain("sign out, then sign in");
    expect(markup).toContain("do not need a personal match or a tournament registration");
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
    expect(loadWorkspaceMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(redirectToSignInMock).not.toHaveBeenCalled();
  });

  it.each(routes)("allows an admin with no personal match/profile fields through the $name page gate", async (route) => {
    authMock.mockResolvedValue({ userId: "local_admin", sessionClaims: { metadata: { role: "admin" } } });

    await expect(route.run({})).rejects.toThrow("PROTECTED_LOADER_REACHED");

    expect(route.loader).toHaveBeenCalledOnce();
    expect(authMock.mock.invocationCallOrder[0]).toBeLessThan(route.loader.mock.invocationCallOrder[0]);
    expect(redirectToSignInMock).not.toHaveBeenCalled();
  });

  it.each([null, {}, { metadata: {} }, { metadata: { role: "Admin" } }, { role: "admin" }])(
    "retains the exact metadata admin role requirement: %j", async (sessionClaims) => {
      authMock.mockResolvedValue({ userId: "local_player", sessionClaims });
      expect(await hasAdminPageAccess("/admin")).toBe(false);
    }
  );

  it("keeps the authorized workspace UUID check before loading protected tournament data", async () => {
    authMock.mockResolvedValue({ userId: "local_admin", sessionClaims: { metadata: { role: "admin" } } });
    await expect(TournamentWorkspacePage({ params: Promise.resolve({ tournamentId: "invalid" }) }))
      .rejects.toThrow("NEXT_NOT_FOUND");
    expect(loadWorkspaceMock).not.toHaveBeenCalled();
  });
});

describe("safe internal admin sign-in return paths", () => {
  it.each(["https://example.test/admin", "//example.test/admin", "/\\example.test", "/admin/../dashboard", `${workspacePath}/extra`, `${workspacePath}?next=//example.test`])(
    "rejects an untrusted or malformed page path: %s", (path) => {
      expect(buildAdminPageReturnPath(path, { section: "assistance" })).toBe("/admin");
    }
  );

  it("encodes query values as data and ignores redirect parameters and unsupported keys", () => {
    const target = buildAdminPageReturnPath(workspacePath, {
      section: "assistance", selected: "//example.test/?a=1#hash", detail: "https://example.test\\path\r\nLocation: bad",
      returnBackUrl: "https://example.test", redirect_url: "//example.test", next: "/dashboard",
    });
    const url = new URL(target, "https://ironclad.test");
    expect(url.origin).toBe("https://ironclad.test");
    expect(url.pathname).toBe(workspacePath);
    expect(url.hash).toBe("");
    expect([...url.searchParams.keys()]).toEqual(["section", "selected", "detail"]);
    expect(url.searchParams.get("selected")).toBe("//example.test/?a=1#hash");
  });

  it("preserves repeated supported query values without interpreting them as a redirect", () => {
    const target = buildAdminPageReturnPath(workspacePath, { selected: [SELECTED_ID, "//example.test"], section: "notifications", page: "03" });
    const query = new URL(target, "https://ironclad.test").searchParams;
    expect(query.getAll("selected")).toEqual([SELECTED_ID, "//example.test"]);
    expect(query.get("page")).toBe("03");
  });
});
