import { beforeEach, describe, expect, it, vi } from "vitest";
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));
import { loadPlayerNotifications } from "@/lib/notifications";

const POLL_ID = "11111111-1111-4111-8111-111111111111";
const TOURNAMENT_ID = "22222222-2222-4222-8222-222222222222";

describe("Feature C notification contract", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
  });

  it.each([
    {
      type: "poll.published",
      tournamentId: TOURNAMENT_ID,
      href: `/tournaments?tournament=${TOURNAMENT_ID}&tab=decisions&poll=${POLL_ID}`,
    },
    {
      type: "poll.decision_published",
      tournamentId: TOURNAMENT_ID,
      href: `/tournaments?tournament=${TOURNAMENT_ID}&tab=decisions&poll=${POLL_ID}`,
    },
    {
      type: "poll.published",
      tournamentId: null,
      href: "/dashboard#community-polls",
    },
  ])("projects a safe exact deep link for $type", async ({ type, tournamentId, href }) => {
    createSupabaseAdminClientMock.mockReturnValue(
      createNotificationProjectionClient({
        id: "notification-1",
        recipient_role: "player",
        type,
        title: "Poll update",
        message: "A Poll update is available.",
        actor_display_name: null,
        tournament_id: tournamentId,
        tournament_title: tournamentId ? "Synthetic Tournament" : null,
        registration_id: null,
        match_id: null,
        report_group_id: null,
        event_key: `poll:${POLL_ID}:event`,
        metadata: { pollId: POLL_ID, privateEligibilityId: "must-not-project" },
        read_at: null,
        created_at: "2026-08-18T00:00:00.000Z",
      })
    );

    const result = await loadPlayerNotifications("user_one");

    expect(result.notifications[0]?.href).toBe(href);
    expect(JSON.stringify(result.notifications[0])).not.toMatch(
      /pollId|privateEligibility|eligible/i
    );
  });
});

function createNotificationProjectionClient(row: Record<string, unknown>) {
  type Result = { count: number | null; data: unknown; error: null };
  type Query = PromiseLike<Result> & Record<string, (...args: unknown[]) => Query>;

  return {
    from: vi.fn(() => {
      const query = {} as Query;
      let result: Result = { count: null, data: [row], error: null };
      for (const method of ["eq", "is", "limit", "order"] as const) {
        query[method] = () => query;
      }
      query.select = (...args: unknown[]) => {
        if (args[0] === "id") result = { count: 1, data: null, error: null };
        return query;
      };
      query.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
      return query;
    }),
  };
}
