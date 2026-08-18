import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const createInAppNotificationMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));
vi.mock("@/lib/notifications", () => ({
  createInAppNotification: createInAppNotificationMock,
}));

import { requestMatchAdminAssistance } from "@/app/tournaments/support-actions";

const USER_ID = "user_phase15a";
const MATCH_ID = "11111111-1111-4111-8111-111111111111";
const REGISTRATION_ID = "22222222-2222-4222-8222-222222222222";
const OPPONENT_REGISTRATION_ID = "33333333-3333-4333-8333-333333333333";
const TOURNAMENT_ID = "44444444-4444-4444-8444-444444444444";

type QueryResult = { data: unknown; error: unknown };

class QueryMock implements PromiseLike<QueryResult> {
  constructor(private readonly result: QueryResult) {}

  eq() {
    return this;
  }

  in() {
    return this;
  }

  is() {
    return this;
  }

  limit() {
    return this;
  }

  maybeSingle() {
    return Promise.resolve(this.result);
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

function createClient({
  registration = {
    id: REGISTRATION_ID,
    tournament_id: TOURNAMENT_ID,
    tournament_title: "Phase 15A Fixture Tournament",
    player_name: "Fixture Player",
  } as unknown,
  existingRequests = [] as unknown[],
}: {
  registration?: unknown;
  existingRequests?: unknown[];
} = {}) {
  const from = vi.fn((table: string) => ({
    select: () => {
      if (table === "tournament_matches") {
        return new QueryMock({
          data: {
            id: MATCH_ID,
            match_number: 3,
            status: "in_progress",
            player_one_registration_id: REGISTRATION_ID,
            player_two_registration_id: OPPONENT_REGISTRATION_ID,
          },
          error: null,
        });
      }

      if (table === "registrations") {
        return new QueryMock({ data: registration, error: null });
      }

      if (table === "notifications") {
        return new QueryMock({ data: existingRequests, error: null });
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  }));

  return { from };
}

describe("match admin-assistance fallback", () => {
  beforeEach(() => {
    authMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    createInAppNotificationMock.mockReset();
    authMock.mockResolvedValue({ userId: USER_ID });
    createInAppNotificationMock.mockResolvedValue(true);
  });

  it("requires an authenticated participant before reading match data", async () => {
    authMock.mockResolvedValue({ userId: null });

    const result = await requestMatchAdminAssistance({ matchId: MATCH_ID });

    expect(result.success).toBe(false);
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
    expect(createInAppNotificationMock).not.toHaveBeenCalled();
  });

  it("rejects a signed-in non-participant", async () => {
    createSupabaseAdminClientMock.mockReturnValue(
      createClient({ registration: null })
    );

    const result = await requestMatchAdminAssistance({ matchId: MATCH_ID });

    expect(result).toEqual({
      success: false,
      message: "Only a participant in this match can request assistance.",
    });
    expect(createInAppNotificationMock).not.toHaveBeenCalled();
  });

  it("routes a participant request into the existing admin notification feed", async () => {
    createSupabaseAdminClientMock.mockReturnValue(createClient());

    const result = await requestMatchAdminAssistance({ matchId: MATCH_ID });

    expect(result.success).toBe(true);
    expect(createInAppNotificationMock).toHaveBeenCalledWith({
      recipientRole: "admin",
      type: "match.admin_assistance_requested",
      title: "Match Admin Assistance Requested",
      message: "Fixture Player requested admin assistance for Match #3.",
      actorClerkUserId: USER_ID,
      actorDisplayName: "Fixture Player",
      tournamentId: TOURNAMENT_ID,
      tournamentTitle: "Phase 15A Fixture Tournament",
      registrationId: REGISTRATION_ID,
      matchId: MATCH_ID,
      eventKey: `match.admin_assistance:${MATCH_ID}:${USER_ID}`,
      metadata: { source: "tournament_match_workspace" },
    });
  });

  it("treats an existing open request as success without duplicating it", async () => {
    createSupabaseAdminClientMock.mockReturnValue(
      createClient({ existingRequests: [{ id: "existing" }] })
    );

    const result = await requestMatchAdminAssistance({ matchId: MATCH_ID });

    expect(result.success).toBe(true);
    expect(createInAppNotificationMock).not.toHaveBeenCalled();
  });
});
