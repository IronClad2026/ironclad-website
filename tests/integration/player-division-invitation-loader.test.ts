import { beforeEach, describe, expect, it, vi } from "vitest";

const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

import { loadPlayerTournamentDivisionInvitations } from "@/lib/tournament-division-invitations";

const playerId = "11111111-1111-4111-8111-111111111111";
const invitationId = "22222222-2222-4222-8222-222222222222";
const tournamentId = "33333333-3333-4333-8333-333333333333";
const bracketId = "44444444-4444-4444-8444-444444444444";

describe("player Division invitation projection", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("verifies the authenticated player, reconciles, and returns only safe target details", async () => {
    const client = createClient();
    createSupabaseAdminClientMock.mockReturnValue(client.client);

    const result = await loadPlayerTournamentDivisionInvitations(
      "player_clerk_id",
      playerId
    );

    expect(result).toEqual({
      status: "success",
      invitations: [
        {
          id: invitationId,
          status: "pending",
          createdAt: "2026-09-03T08:00:00.000Z",
          invalidationReason: null,
          targetTournamentId: tournamentId,
          targetTournamentSlug: "ironclad-open-two",
          targetTournamentTitle: "IronClad Open Two",
          targetDivisionName: "Main / Pro",
        },
      ],
    });
    expect(client.playerFilters).toEqual([
      ["id", playerId],
      ["clerk_user_id", "player_clerk_id"],
      ["account_closed_at", null],
    ]);
    expect(client.rpc).toHaveBeenCalledExactlyOnceWith(
      "reconcile_tournament_division_invitations",
      {
        p_target_tournament_id: null,
        p_target_tournament_bracket_id: null,
        p_recipient_player_id: playerId,
      }
    );
  });

  it("fails closed when invitation reconciliation fails", async () => {
    const client = createClient({ rpcError: { code: "08006" } });
    createSupabaseAdminClientMock.mockReturnValue(client.client);

    const result = await loadPlayerTournamentDivisionInvitations(
      "player_clerk_id",
      playerId
    );

    expect(result).toEqual({ status: "error", invitations: [] });
    expect(client.invitationOrder).not.toHaveBeenCalled();
  });
});

function createClient({ rpcError = null }: { rpcError?: unknown } = {}) {
  const playerFilters: Array<[string, unknown]> = [];
  const playerQuery = {
    select: vi.fn(),
    eq: vi.fn((column: string, value: unknown) => {
      playerFilters.push([column, value]);
      return playerQuery;
    }),
    is: vi.fn((column: string, value: unknown) => {
      playerFilters.push([column, value]);
      return playerQuery;
    }),
    maybeSingle: vi.fn(async () => ({ data: { id: playerId }, error: null })),
  };
  playerQuery.select.mockReturnValue(playerQuery);

  const invitationOrder = vi.fn(async () => ({
    data: [
      {
        id: invitationId,
        status: "pending",
        created_at: "2026-09-03T08:00:00.000Z",
        invalidation_reason: null,
        target_tournament_bracket_id: bracketId,
      },
    ],
    error: null,
  }));
  const invitationQuery = {
    select: vi.fn(),
    eq: vi.fn(() => invitationQuery),
    order: invitationOrder,
  };
  invitationQuery.select.mockReturnValue(invitationQuery);

  const bracketQuery = {
    select: vi.fn(),
    in: vi.fn(async () => ({
      data: [{ id: bracketId, tournament_id: tournamentId, name: "Main" }],
      error: null,
    })),
  };
  bracketQuery.select.mockReturnValue(bracketQuery);

  const tournamentQuery = {
    select: vi.fn(),
    in: vi.fn(async () => ({
      data: [
        {
          id: tournamentId,
          slug: "ironclad-open-two",
          title: "IronClad Open Two",
        },
      ],
      error: null,
    })),
  };
  tournamentQuery.select.mockReturnValue(tournamentQuery);

  const rpc = vi.fn(async () => ({ data: 0, error: rpcError }));
  const client = {
    rpc,
    from: vi.fn((table: string) => {
      if (table === "players") return playerQuery;
      if (table === "tournament_division_invitations") {
        return invitationQuery;
      }
      if (table === "tournament_brackets") return bracketQuery;
      if (table === "tournaments") return tournamentQuery;
      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return { client, invitationOrder, playerFilters, rpc };
}
