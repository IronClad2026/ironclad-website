import { createClient } from "@supabase/supabase-js";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteNotifications, loadPlayerNotifications, loadUnreadNotificationCount,
  markAllNotificationsRead, markNotificationRead, markNotificationsRead, resolveNotificationDestination,
} from "@/lib/notifications";
import { mockServer } from "@/tests/mocks/server";

const createClientMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: createClientMock }));

const HYBRID = "11111111-1111-4111-8111-111111111111";
const PLAYER = "22222222-2222-4222-8222-222222222222";
const NULL_ROLE_PLAYER = "33333333-3333-4333-8333-333333333333";
const OWNER = "hybrid_player";
type Row = ReturnType<typeof row>;
let rows: Row[];
let observedRoleFilters: (string | null)[];

function row(id: string, recipientRole: "admin" | "player" | null) {
  return {
    id, recipient_role: recipientRole, recipient_clerk_user_id: OWNER,
    type: "registration.created", title: "Registration", message: "Review registration",
    actor_display_name: null, tournament_id: null, tournament_title: null,
    registration_id: null, match_id: null, report_group_id: null,
    event_key: null as string | null, metadata: {}, read_at: null as string | null,
    in_app_hidden_at: null as string | null, created_at: "2026-11-02T00:00:00.000Z",
  };
}

describe("hybrid admin notifications cannot be targeted through player scope", () => {
  beforeEach(() => {
    rows = [row(HYBRID, "admin"), row(PLAYER, "player"), row(NULL_ROLE_PLAYER, null)];
    observedRoleFilters = [];
    createClientMock.mockReturnValue(createClient("http://127.0.0.1:54321", "test-only-service-key", {
      auth: { persistSession: false, autoRefreshToken: false },
    }));
    // Exercise the actual Supabase query serialization against a local fake
    // PostgREST boundary; no application service or remote database is contacted.
    mockServer.use(http.all("http://127.0.0.1:54321/rest/v1/notifications", async ({ request }) => {
      const query = new URL(request.url).searchParams;
      const roleFilter = query.get("or");
      observedRoleFilters.push(roleFilter);
      let matches = rows.filter((value) => query.get("recipient_clerk_user_id") === `eq.${value.recipient_clerk_user_id}`);
      if (roleFilter === "(recipient_role.is.null,recipient_role.neq.admin)") {
        matches = matches.filter((value) => value.recipient_role !== "admin");
      }
      const target = query.get("id");
      if (target?.startsWith("eq.")) matches = matches.filter((value) => value.id === target.slice(3));
      if (target?.startsWith("in.(")) {
        const ids = target.slice(4, -1).split(",");
        matches = matches.filter((value) => ids.includes(value.id));
      }
      for (const key of ["read_at", "in_app_hidden_at", "event_key"] as const) {
        if (query.get(key) === "is.null") matches = matches.filter((value) => value[key] === null);
        if (query.get(key) === "not.is.null") matches = matches.filter((value) => value[key] !== null);
      }
      if (request.method === "PATCH") {
        const change = await request.json() as Partial<Row>;
        for (const value of matches) Object.assign(value, change);
        return new HttpResponse(null, { status: 204 });
      }
      if (request.method === "DELETE") {
        rows = rows.filter((value) => !matches.includes(value));
        return new HttpResponse(null, { status: 204 });
      }
      const headers = { "content-range": `0-${Math.max(0, matches.length - 1)}/${matches.length}` };
      return request.method === "HEAD" ? new HttpResponse(null, { headers }) : HttpResponse.json(matches, { headers });
    }));
  });

  it.each([
    () => markNotificationRead({ scope: "player", clerkUserId: OWNER, notificationId: HYBRID }),
    () => markNotificationsRead({ scope: "player", clerkUserId: OWNER, notificationIds: [HYBRID, PLAYER] }),
    () => markAllNotificationsRead({ scope: "player", clerkUserId: OWNER }),
    () => deleteNotifications({ scope: "player", clerkUserId: OWNER, notificationIds: [HYBRID, PLAYER] }),
  ])("cannot read, dismiss, or physically delete a shared admin row through a forged player scope", async (operation) => {
    await expect(operation()).resolves.toBe(true);
    expect(rows.find((value) => value.id === HYBRID)).toMatchObject({ recipient_role: "admin", read_at: null, in_app_hidden_at: null });
    expect(observedRoleFilters.length).toBeGreaterThan(0);
    expect(observedRoleFilters.every((value) => value === "(recipient_role.is.null,recipient_role.neq.admin)")).toBe(true);
  });

  it("keeps both ordinary and null-role player notifications mutable", async () => {
    await markAllNotificationsRead({ scope: "player", clerkUserId: OWNER });
    expect(rows.find((value) => value.id === HYBRID)?.read_at).toBeNull();
    expect(rows.filter((value) => value.id !== HYBRID).every((value) => value.read_at !== null)).toBe(true);
  });

  it("excludes hybrid admin records from player reads, counts, and click destinations", async () => {
    const loaded = await loadPlayerNotifications(OWNER);
    expect(loaded.error).toBeNull();
    expect(loaded.notifications.map((value) => value.id)).toEqual([PLAYER, NULL_ROLE_PLAYER]);
    expect(loaded).toMatchObject({ totalCount: 2, unreadCount: 2 });
    await expect(loadUnreadNotificationCount({ scope: "player", clerkUserId: OWNER })).resolves.toBe(2);
    await expect(resolveNotificationDestination(HYBRID, "player", OWNER)).resolves.toBeNull();
    expect(observedRoleFilters.every((value) => value === "(recipient_role.is.null,recipient_role.neq.admin)")).toBe(true);
  });
});
