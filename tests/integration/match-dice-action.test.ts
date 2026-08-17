import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const createAuthenticatedSupabaseClientMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/supabase-server", () => ({
  createAuthenticatedSupabaseClient: createAuthenticatedSupabaseClientMock,
}));

import { rollMatchDice } from "@/app/tournaments/dice-actions";
import { parseMatchDiceSnapshot } from "@/lib/match-dice";

const MATCH_ID = "11111111-1111-4111-8111-111111111111";
const ROLLED_AT = "2026-08-17T03:00:00.000Z";

const snapshot = {
  matchId: MATCH_ID,
  currentActivationVersion: 2,
  seriesBestOf: 5,
  viewerRole: "participant",
  viewerSlot: "player_one",
  isActionable: true,
  readOnlyReason: null,
  participants: [
    { slot: "player_one", label: "Player One" },
    { slot: "player_two", label: "Player Two" },
  ],
  activations: [
    {
      activationVersion: 2,
      isCurrent: true,
      games: [
        {
          gameNumber: 1,
          currentTieRound: 1,
          state: "open",
          canRoll: true,
          winnerSlot: null,
          rounds: [],
        },
        {
          gameNumber: 3,
          currentTieRound: 1,
          state: "waiting",
          canRoll: false,
          winnerSlot: null,
          rounds: [
            {
              tieRound: 1,
              rolls: [
                {
                  participantSlot: "player_one",
                  participantLabel: "Player One",
                  die1: 5,
                  die2: 3,
                  total: 8,
                  rolledAt: ROLLED_AT,
                },
              ],
            },
          ],
        },
        {
          gameNumber: 5,
          currentTieRound: 1,
          state: "open",
          canRoll: true,
          winnerSlot: null,
          rounds: [],
        },
      ],
    },
  ],
} as const;

const roll = {
  activationVersion: 2,
  gameNumber: 3,
  tieRound: 1,
  participantSlot: "player_one",
  die1: 5,
  die2: 3,
  total: 8,
  rolledAt: ROLLED_AT,
  created: true,
} as const;

describe("match dice read projection", () => {
  it("accepts a sanitized non-actionable round-robin projection without inventing an activation", () => {
    const unsupported = {
      ...snapshot,
      currentActivationVersion: 0,
      isActionable: false,
      readOnlyReason: "unsupported_format",
      activations: [],
    };

    expect(parseMatchDiceSnapshot(unsupported, MATCH_ID)).toEqual(unsupported);
  });

  it("rejects an empty projection that claims roll authority", () => {
    expect(
      parseMatchDiceSnapshot(
        {
          ...snapshot,
          currentActivationVersion: 0,
          activations: [],
        },
        MATCH_ID
      )
    ).toBeNull();
  });
});

describe("rollMatchDice", () => {
  beforeEach(() => {
    authMock.mockReset();
    authMock.mockResolvedValue({ userId: "user_player_one" });
    createAuthenticatedSupabaseClientMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("requires Clerk authentication before creating a Supabase client", async () => {
    authMock.mockResolvedValue({ userId: null });

    await expect(
      rollMatchDice({
        matchId: MATCH_ID,
        expectedActivationVersion: 2,
        gameNumber: 3,
        expectedTieRound: 1,
      })
    ).resolves.toEqual({
      ok: false,
      error: "Sign in before using the Dice Roll-Off.",
    });
    expect(createAuthenticatedSupabaseClientMock).not.toHaveBeenCalled();
  });

  it.each([
    { matchId: "not-a-uuid", expectedActivationVersion: 2, gameNumber: 3, expectedTieRound: 1 },
    { matchId: MATCH_ID, expectedActivationVersion: 0, gameNumber: 3, expectedTieRound: 1 },
    { matchId: MATCH_ID, expectedActivationVersion: 2, gameNumber: 2, expectedTieRound: 1 },
    { matchId: MATCH_ID, expectedActivationVersion: 2, gameNumber: 3, expectedTieRound: 0 },
    { matchId: MATCH_ID, expectedActivationVersion: 2, gameNumber: 3, expectedTieRound: 1, participantRegistrationId: MATCH_ID },
    { matchId: MATCH_ID, expectedActivationVersion: 2, gameNumber: 3, expectedTieRound: 1, die1: 6 },
  ])("rejects invalid scalar input before calling Supabase", async (input) => {
    const result = await rollMatchDice(
      input as Parameters<typeof rollMatchDice>[0]
    );

    expect(result).toEqual({
      ok: false,
      error: "The Dice Roll-Off request is invalid.",
    });
    expect(createAuthenticatedSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("calls only the authenticated roll RPC with four scalar arguments", async () => {
    const rpc = vi.fn(async () => ({
      data: { snapshot, roll },
      error: null,
    }));
    createAuthenticatedSupabaseClientMock.mockResolvedValue({ rpc });

    const result = await rollMatchDice({
      matchId: MATCH_ID,
      expectedActivationVersion: 2,
      gameNumber: 3,
      expectedTieRound: 1,
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("roll_match_dice", {
      p_match_id: MATCH_ID,
      p_expected_activation_version: 2,
      p_game_number: 3,
      p_expected_tie_round: 1,
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toMatch(
      /clerk|registration|participant_registration|die_1|die_2|winner/i
    );
    expect(result).toEqual({ ok: true, data: { snapshot, roll } });
  });

  it("rejects malformed RPC output instead of trusting private or incomplete data", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        snapshot: { ...snapshot, viewerRegistrationId: MATCH_ID },
        roll,
      },
      error: null,
    }));
    createAuthenticatedSupabaseClientMock.mockResolvedValue({ rpc });

    await expect(
      rollMatchDice({
        matchId: MATCH_ID,
        expectedActivationVersion: 2,
        gameNumber: 3,
        expectedTieRound: 1,
      })
    ).resolves.toEqual({
      ok: false,
      error: "Dice Roll-Off could not be completed. Refresh the Match and try again.",
    });
  });

  it("returns a safe error when the RPC rejects the roll", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "Tournament registration secret detail" },
    }));
    createAuthenticatedSupabaseClientMock.mockResolvedValue({ rpc });

    const result = await rollMatchDice({
      matchId: MATCH_ID,
      expectedActivationVersion: 2,
      gameNumber: 3,
      expectedTieRound: 1,
    });

    expect(result).toEqual({
      ok: false,
      error: "Dice Roll-Off could not be completed. Refresh the Match and try again.",
    });
    expect(JSON.stringify(result)).not.toContain("secret detail");
  });
});
