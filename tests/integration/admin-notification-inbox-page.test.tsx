import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminNotificationsPage from "@/app/admin/notifications/page";
import type { AdminInboxScope } from "@/lib/admin-notification-inbox";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), createClient: vi.fn(), load: vi.fn(), enabled: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/patch2-admin-access", async () => {
  const { createPatch2AdminAccessFixture } = await import("@/tests/fixtures/patch2-admin-access");
  return createPatch2AdminAccessFixture(mocks.auth);
});
vi.mock("next/navigation", () => ({ redirect: (href: string) => { throw new Error(`REDIRECT:${href}`); } }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: mocks.createClient }));
vi.mock("@/lib/admin-notification-inbox", () => ({ loadAdminNotificationInbox: mocks.load, isAdminNotificationInboxEnabled: mocks.enabled }));
vi.mock("@/components/admin/tournaments/AdminNotificationInbox", () => ({
  default: ({ data }: { data: { scope: AdminInboxScope } }) => <section data-inbox-kind={data.scope.kind}>Explicit inbox</section>,
}));

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function choices(failSecondBatch = false) {
  const records = [{ id: A, title: "Current tournament", status: "in_progress" }, { id: B, title: "Historical tournament", status: "completed" }];
  const ranges: number[] = [];
  const from = vi.fn((table: string) => {
    expect(table).toBe("tournaments");
    const query = {
      select: vi.fn((columns: string) => { expect(columns).toBe("id, title, status"); return query; }),
      order: vi.fn(() => query),
      range: vi.fn((start: number) => {
        ranges.push(start);
        return Promise.resolve({ data: records.slice(start, start + 1), count: 2,
          error: failSecondBatch && start > 0 ? { message: "Unavailable" } : null });
      }),
    };
    return query;
  });
  mocks.createClient.mockReturnValue({ from });
  return { ranges, from };
}

beforeEach(() => {
  mocks.auth.mockResolvedValue({ userId: "admin-1", sessionClaims: { metadata: { role: "admin" } } });
  mocks.enabled.mockReturnValue(true);
});

describe("admin notification inbox navigation", () => {
  it("keeps saved notification state and legacy assistance reachable when the switch is off", async () => {
    mocks.enabled.mockReturnValue(false);
    const html = renderToStaticMarkup(await AdminNotificationsPage({ searchParams: Promise.resolve({ kind: "platform" }) }));
    expect(html).toContain("turned off in this environment");
    expect(html).toContain("Existing notifications remain saved");
    expect(html).toContain("legacy-assistance?kind=unassigned");
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it.each([null, { userId: "player-1", sessionClaims: { metadata: { role: "player" } } }])("authorizes before loading choices or inbox for %j", async (identity) => {
    mocks.auth.mockResolvedValue(identity ?? { userId: null, sessionClaims: null });
    await expect(AdminNotificationsPage({ searchParams: Promise.resolve({ kind: "platform" }) })).rejects.toThrow("REDIRECT:/");
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it("offers current and historical tournament inboxes across provider caps without a mixed notification list", async () => {
    const db = choices();
    const html = renderToStaticMarkup(await AdminNotificationsPage({ searchParams: Promise.resolve({}) }));
    expect(db.ranges).toEqual([0, 1]);
    expect(html).toContain(`/admin/tournaments/${A}?section=notifications`);
    expect(html).toContain(`/admin/tournaments/${B}?section=notifications`);
    expect(html).toContain("Historical tournament");
    expect(html).toContain("kind=platform");
    expect(html).toContain("kind=unassigned");
    expect(html).not.toContain("Explicit inbox");
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it.each(["platform", "unassigned"] as const)("loads only explicitly chosen %s scope and scoped options", async (kind) => {
    mocks.load.mockResolvedValue({ scope: { kind } });
    const html = renderToStaticMarkup(await AdminNotificationsPage({ searchParams: Promise.resolve({ kind, page: "2", filter: "unread", selected: A }) }));
    expect(mocks.load).toHaveBeenCalledExactlyOnceWith({ kind }, { page: "2", filter: "unread", selected: A });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(html).toContain(`data-inbox-kind="${kind}"`);
  });

  it("shows an explicit retry state for an invalid view or failed inbox read", async () => {
    mocks.load.mockRejectedValue(new Error("Invalid filter"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const html = renderToStaticMarkup(await AdminNotificationsPage({ searchParams: Promise.resolve({ kind: "unassigned", filter: "invalid" }) }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("This inbox could not be loaded");
    expect(html).toContain("Reopen inbox");
    expect(html).not.toContain("Explicit inbox");
  });

  it("does not present a truncated tournament chooser as complete", async () => {
    choices(true);
    const html = renderToStaticMarkup(await AdminNotificationsPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Tournament choices could not be loaded");
    expect(html).not.toContain("Current tournament");
    expect(html).not.toContain(`/admin/tournaments/${A}?section=notifications`);
  });
});
