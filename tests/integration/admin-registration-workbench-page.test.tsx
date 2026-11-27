import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { adminIdentity, anonymousIdentity, playerIdentity } from "@/tests/fixtures/auth";
import { createSupabaseQueryMock } from "@/tests/helpers/supabase-query-mock";

const authMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn((href: string) => {
  throw new Error(`NEXT_REDIRECT:${href}`);
}));
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/patch2-admin-access", async () => {
  const { createPatch2AdminAccessFixture } = await import("@/tests/fixtures/patch2-admin-access");
  return createPatch2AdminAccessFixture(authMock);
});
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: createSupabaseAdminClientMock }));

import AdminRegistrationsPage from "@/app/admin/registrations/page";

const REGISTRATION_ID = "30000000-0000-4000-8000-000000000001";
const ORIGINAL_TOURNAMENT_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_TOURNAMENT_ID = "10000000-0000-4000-8000-000000000002";
const choices = [
  { id: ORIGINAL_TOURNAMENT_ID, title: "Historical Cup", status: "completed" },
  { id: OTHER_TOURNAMENT_ID, title: "Live Cup", status: "in_progress" },
];

function mockQueries(results: Parameters<typeof createSupabaseQueryMock>[0][] = []) {
  const queries = [...results, { data: choices }].map((result) => createSupabaseQueryMock(result));
  const from = vi.fn();
  for (const query of queries) from.mockReturnValueOnce(query.query);
  createSupabaseAdminClientMock.mockReturnValue({ from });
  return { from, queries };
}

describe("legacy Admin registration links and tournament choice", () => {
  beforeEach(() => {
    authMock.mockResolvedValue(adminIdentity);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it.each([
    ["signed-out", anonymousIdentity],
    ["non-admin", playerIdentity],
  ])("denies %s before reading private data or resolving a selected link", async (_, identity) => {
    authMock.mockResolvedValue(identity);

    await expect(AdminRegistrationsPage({
      searchParams: Promise.resolve({ selected: REGISTRATION_ID }),
    })).rejects.toThrow("NEXT_REDIRECT:/");

    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledExactlyOnceWith("/");
  });

  it("shows tournament choices without querying global registration rows or rendering mutation forms", async () => {
    const { from, queries } = mockQueries();
    const markup = renderToStaticMarkup(await AdminRegistrationsPage({
      searchParams: Promise.resolve({ filter: "pending" }),
    }));

    expect(from).toHaveBeenCalledExactlyOnceWith("tournaments");
    expect(queries[0].calls).toEqual([
      { method: "select", args: ["id, title, status"] },
      { method: "order", args: ["created_at", { ascending: false }] },
    ]);
    expect(markup).toContain("Choose a Tournament");
    expect(markup).toContain("Historical Cup");
    expect(markup).toContain("Live Cup");
    expect(markup).toContain(`/admin/tournaments/${ORIGINAL_TOURNAMENT_ID}?section=registrations&amp;filter=pending`);
    expect(markup).not.toContain("<form");
    expect(markup).not.toContain("checkbox");
    expect(markup).not.toContain("selected=");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("resolves an old selected link to its stored original tournament after admin authorization", async () => {
    const { from, queries } = mockQueries([
      { data: { id: REGISTRATION_ID, tournament_id: ORIGINAL_TOURNAMENT_ID } },
      { data: { id: ORIGINAL_TOURNAMENT_ID } },
    ]);
    const query = {
      selected: REGISTRATION_ID,
      tournamentId: OTHER_TOURNAMENT_ID,
      filter: "manual_review",
      notice: "note-required",
      detail: "Review evidence",
      focus: "note",
    };

    await expect(AdminRegistrationsPage({ searchParams: Promise.resolve(query) })).rejects.toThrow(
      `NEXT_REDIRECT:/admin/tournaments/${ORIGINAL_TOURNAMENT_ID}?section=registrations&filter=manual_review&selected=${REGISTRATION_ID}&notice=note-required&detail=Review+evidence&focus=note`
    );

    expect(authMock.mock.invocationCallOrder[0]).toBeLessThan(createSupabaseAdminClientMock.mock.invocationCallOrder[0]);
    expect(from.mock.calls).toEqual([["registrations"], ["tournaments"]]);
    expect(queries[0].calls).toEqual([
      { method: "select", args: ["id, tournament_id"] },
      { method: "eq", args: ["id", REGISTRATION_ID] },
      { method: "maybeSingle", args: [] },
    ]);
    expect(queries[1].calls).toContainEqual({ method: "eq", args: ["id", ORIGINAL_TOURNAMENT_ID] });
  });

  it.each(["all", "pending", "manual_review", "approved", "rejected", "waitlisted", "withdrawn"])(
    "preserves the %s filter on a resolved historical link", async (filter) => {
      mockQueries([
        { data: { id: REGISTRATION_ID, tournament_id: ORIGINAL_TOURNAMENT_ID } },
        { data: { id: ORIGINAL_TOURNAMENT_ID } },
      ]);
      await expect(AdminRegistrationsPage({ searchParams: Promise.resolve({ selected: REGISTRATION_ID, filter }) }))
        .rejects.toThrow(`NEXT_REDIRECT:/admin/tournaments/${ORIGINAL_TOURNAMENT_ID}?section=registrations&filter=${filter}&selected=${REGISTRATION_ID}`);
    }
  );

  it("normalizes a valid uppercase registration bookmark before lookup and redirect", async () => {
    const selected = "abcdef12-abcd-4abc-8abc-abcdef123456";
    const { queries } = mockQueries([
      { data: { id: selected, tournament_id: ORIGINAL_TOURNAMENT_ID } },
      { data: { id: ORIGINAL_TOURNAMENT_ID } },
    ]);
    await expect(AdminRegistrationsPage({ searchParams: Promise.resolve({ selected: selected.toUpperCase() }) }))
      .rejects.toThrow(`NEXT_REDIRECT:/admin/tournaments/${ORIGINAL_TOURNAMENT_ID}?section=registrations&filter=all&selected=${selected}`);
    expect(queries[0].calls).toContainEqual({ method: "eq", args: ["id", selected] });
  });

  it.each([
    null,
    { id: REGISTRATION_ID, tournament_id: null },
    { id: REGISTRATION_ID, tournament_id: "unknown" },
    { id: "30000000-0000-4000-8000-000000000002", tournament_id: ORIGINAL_TOURNAMENT_ID },
  ])("retains an unresolved association safely and clears the selection from tournament choices: %j", async (data) => {
    const { from } = mockQueries([{ data }]);
    const markup = renderToStaticMarkup(await AdminRegistrationsPage({
      searchParams: Promise.resolve({ selected: REGISTRATION_ID, focus: "reject" }),
    }));

    expect(from.mock.calls).toEqual([["registrations"], ["tournaments"]]);
    expect(markup).toContain("could not be matched to an available tournament");
    expect(markup).toContain("missing tournament association remain retained");
    expect(markup).not.toContain("selected=");
    expect(markup).not.toContain("focus=");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("does not redirect into a tournament which no longer exists", async () => {
    mockQueries([
      { data: { id: REGISTRATION_ID, tournament_id: ORIGINAL_TOURNAMENT_ID } },
      { data: null },
    ]);
    const markup = renderToStaticMarkup(await AdminRegistrationsPage({
      searchParams: Promise.resolve({ selected: REGISTRATION_ID }),
    }));
    expect(markup).toContain("Choose a Tournament");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it.each(["not-a-uuid", "https://example.test", [REGISTRATION_ID, REGISTRATION_ID]])(
    "does not look up malformed or repeated selected query parameters: %j", async (selected) => {
      const { from } = mockQueries();
      await AdminRegistrationsPage({ searchParams: Promise.resolve({ selected }) });
      expect(from).toHaveBeenCalledExactlyOnceWith("tournaments");
      expect(redirectMock).not.toHaveBeenCalled();
    }
  );

  it("sanitizes unsupported navigation values and bounds forwarded detail", async () => {
    mockQueries([
      { data: { id: REGISTRATION_ID, tournament_id: ORIGINAL_TOURNAMENT_ID } },
      { data: { id: ORIGINAL_TOURNAMENT_ID } },
    ]);
    const query = {
      selected: REGISTRATION_ID, filter: "unsupported", notice: "https://example.test",
      focus: "redirectUrl", detail: " a ".repeat(200),
    };
    await expect(AdminRegistrationsPage({ searchParams: Promise.resolve(query) })).rejects.toThrow("NEXT_REDIRECT:");
    const destination = new URL(redirectMock.mock.calls[0][0], "https://example.test");
    expect(destination.pathname).toBe(`/admin/tournaments/${ORIGINAL_TOURNAMENT_ID}`);
    expect(destination.searchParams.get("filter")).toBe("all");
    expect(destination.searchParams.has("notice")).toBe(false);
    expect(destination.searchParams.has("focus")).toBe(false);
    expect(destination.searchParams.get("detail")).toHaveLength(240);
  });

  it.each(["registration-scope-required", "registration-scope-mismatch"])(
    "explains %s without presenting an unscoped action", async (notice) => {
      mockQueries();
      const markup = renderToStaticMarkup(await AdminRegistrationsPage({ searchParams: Promise.resolve({ notice }) }));
      expect(markup).toContain("needs a matching tournament workspace");
      expect(markup).not.toContain("<form");
    }
  );

  it("fails safely when destination data or tournament choices cannot be loaded", async () => {
    const registration = createSupabaseQueryMock({ error: { message: "PRIVATE_DATABASE_DETAILS" } });
    const tournament = createSupabaseQueryMock({ error: { message: "PRIVATE_DATABASE_DETAILS" } });
    const from = vi.fn().mockReturnValueOnce(registration.query).mockReturnValueOnce(tournament.query);
    createSupabaseAdminClientMock.mockReturnValue({ from });
    const markup = renderToStaticMarkup(await AdminRegistrationsPage({ searchParams: Promise.resolve({ selected: REGISTRATION_ID }) }));
    expect(markup).toContain("Tournament choices could not be loaded");
    expect(markup).not.toContain("PRIVATE_DATABASE_DETAILS");
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
