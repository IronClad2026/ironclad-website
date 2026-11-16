import { beforeEach, describe, expect, it, vi } from "vitest";

const adapters = vi.hoisted(() => ({ server: vi.fn(), member: vi.fn() }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: adapters.server }));
vi.mock("@/lib/supabase-server", () => ({ createAuthenticatedSupabaseClient: adapters.member }));

import { loadReadyOwnedMatches, loadReadyPrivateContext } from "@/lib/ready/platform-data";

const PROFILE = "a77de588-2462-423c-ac05-747499a40000";
const REGISTRATION = "a77de588-2462-423c-ac05-747499a40001";
const EVENT = "a77de588-2462-423c-ac05-747499a40002";
const DIVISION = "a77de588-2462-423c-ac05-747499a40003";
const MATCH = "a77de588-2462-423c-ac05-747499a40004";
const OTHER = "a77de588-2462-423c-ac05-747499a40005";
const CLERK = "user_staging_test";

function query(data: unknown, error: unknown = null) {
  return {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(), not: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    then: (resolve: (value: unknown) => void) => resolve({ data, error }),
  };
}

describe("Ready read scoping", () => {
  beforeEach(() => vi.resetAllMocks());

  it("checks current account status before opening a user-token client", async () => {
    const account = query({ id: PROFILE, profile_completed: true, account_closed_at: "2026-11-14T00:00:00Z" });
    adapters.server.mockReturnValue({ from: vi.fn().mockReturnValue(account) });
    await expect(loadReadyPrivateContext(CLERK)).resolves.toEqual({ profile: null, registrations: [] });
    expect(account.eq).toHaveBeenCalledWith("clerk_user_id", CLERK);
    expect(adapters.member).not.toHaveBeenCalled();
  });

  it("reads registration IDs under player RLS with both the Clerk and profile ownership constraints", async () => {
    const account = query({ id: PROFILE, profile_completed: true, account_closed_at: null });
    const own = { id: REGISTRATION, tournament_id: EVENT, tournament_bracket_id: DIVISION, registration_status: "approved" };
    const registrations = query([own]);
    adapters.server.mockReturnValue({ from: vi.fn().mockReturnValue(account) });
    const from = vi.fn().mockReturnValue(registrations);
    adapters.member.mockResolvedValue({ from });
    await expect(loadReadyPrivateContext(CLERK)).resolves.toMatchObject({ registrations: [own] });
    expect(from).toHaveBeenCalledWith("registrations");
    expect(registrations.eq.mock.calls).toEqual([
      ["clerk_user_id", CLERK],
      ["profile_id", PROFILE],
    ]);
  });

  it("requires an owned seat and matching event/division even if the response contains another player's match", async () => {
    const owned = {
      profile: { id: PROFILE, profile_completed: true, account_closed_at: null },
      registrations: [{ id: REGISTRATION, tournament_id: EVENT, tournament_bracket_id: DIVISION, registration_status: "approved" }],
    };
    const fixture = {
      id: MATCH, match_number: 1, status: "in_progress", activation_version: 1, outcome_type: null,
      player_one_registration_id: OTHER, player_two_registration_id: null,
      generated_brackets: { format: "single_elimination", tournament_brackets: {
        id: DIVISION, name: "Academy", launched_at: "2026-11-15T00:00:00Z",
        tournaments: { id: EVENT, slug: "approved-fixture", title: "Approved fixture", status: "in_progress" },
      } },
    };
    const a = query([fixture]);
    const b = query([fixture]);
    adapters.server.mockReturnValue({ from: vi.fn().mockReturnValueOnce(a).mockReturnValueOnce(b) });
    await expect(loadReadyOwnedMatches(owned, MATCH)).resolves.toEqual([]);
    expect(a.in).toHaveBeenCalledWith("player_one_registration_id", [REGISTRATION]);
    expect(b.in).toHaveBeenCalledWith("player_two_registration_id", [REGISTRATION]);
    expect(a.eq).toHaveBeenCalledWith("id", MATCH);
    expect(b.eq).toHaveBeenCalledWith("id", MATCH);
  });
});
