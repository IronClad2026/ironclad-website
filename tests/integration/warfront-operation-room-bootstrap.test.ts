import { beforeEach, describe, expect, it, vi } from "vitest";
import { anonymousIdentity, playerIdentity } from "@/tests/fixtures/auth";
import {
  parseWarfrontOperationRoomBootstrap,
  type WarfrontOperationRoomBootstrap,
} from "@/lib/warfront/contracts";

const authMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

import { getWarfrontOperationRoomBootstrap } from "@/lib/warfront/room";

const OPERATION_ID = "11111111-1111-4111-8111-111111111111";
const CHALLENGER_COMPANY_ID = "22222222-2222-4222-8222-222222222222";
const OPPONENT_COMPANY_ID = "33333333-3333-4333-8333-333333333333";
const PLAYER_ID = "44444444-4444-4444-8444-444444444444";
const OPPONENT_PLAYER_ID = "55555555-5555-4555-8555-555555555555";
const TIMESTAMP = "2026-10-05T12:00:00.000Z";

function bootstrapFixture(): WarfrontOperationRoomBootstrap {
  return {
    operationId: OPERATION_ID,
    status: "in_progress",
    logicalStatus: "in_progress",
    format: "2v2",
    seriesBestOf: 3,
    region: null,
    openedAt: TIMESTAMP,
    expiresAt: TIMESTAMP,
    acceptedAt: TIMESTAMP,
    startedAt: TIMESTAMP,
    completedAt: null,
    cancelledAt: null,
    serverNow: TIMESTAMP,
    challengerCompany: { companyId: CHALLENGER_COMPANY_ID, name: "Iron", tag: "IRN", slug: "iron", logo: null, banner: null },
    opponentCompany: { companyId: OPPONENT_COMPANY_ID, name: "Steel", tag: "STL", slug: "steel", logo: null, banner: null },
    rosters: [
      { side: "challenger", eloSnapshot: 1250, selectedAt: TIMESTAMP, playerId: null, displayName: "Former Competitor" },
      { side: "opponent", eloSnapshot: 1300, selectedAt: TIMESTAMP, playerId: OPPONENT_PLAYER_ID, displayName: "Opponent" },
    ],
    challengerRosterEloSnapshot: 1250,
    opponentRosterEloSnapshot: 1300,
    viewerPlayerId: PLAYER_ID,
    viewerSide: "challenger",
    dice: {
      operationId: OPERATION_ID,
      status: "in_progress",
      seriesBestOf: 3,
      startedAt: TIMESTAMP,
      viewerPlayerId: PLAYER_ID,
      viewerSide: "challenger",
      isActionable: true,
      readOnlyReason: null,
      games: [{
        gameNumber: 1,
        available: true,
        currentTieRound: 1,
        state: "open",
        canRoll: true,
        winnerSide: null,
        rounds: [{
          tieRound: 1,
          rolls: [{ side: "challenger", rolledByPlayerId: PLAYER_ID, die1: 3, die2: 4, total: 7, rolledAt: TIMESTAMP }],
        }],
      }],
    },
    result: {
      operationId: OPERATION_ID,
      operationStatus: "in_progress",
      seriesBestOf: 3,
      submittedResult: null,
      submittedAt: null,
      confirmationDeadline: null,
      challengerConfirmed: false,
      opponentConfirmed: false,
      disputed: false,
      disputingSide: null,
      finalResult: null,
      finalizationMode: null,
      finalizedAt: null,
      logicalAutoFinalizationDue: false,
      viewerSide: "challenger",
      canConfirm: false,
      canDispute: false,
      canAdminResolve: false,
    },
    assistance: { operationId: OPERATION_ID, status: "none", requestedAt: null, resolvedAt: null },
    chat: { contentState: "purged", contentPurgedAt: TIMESTAMP, latestSequence: null, lastReadSequence: null, unreadCount: 0 },
    capabilities: {
      canRollByRoomState: true,
      canSubmitResultByRoomState: true,
      canConfirmResultByRoomState: false,
      canDisputeByRoomState: false,
      canReadChat: true,
      canSendChatByRoomState: false,
    },
  };
}

describe("WARFRONT Operation Room bootstrap", () => {
  beforeEach(() => {
    authMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    authMock.mockResolvedValue(playerIdentity);
  });

  it("parses the exact bootstrap contract while preserving nullable player IDs, purged chat, and capability values", () => {
    const parsed = parseWarfrontOperationRoomBootstrap(bootstrapFixture());

    expect(parsed).toEqual(bootstrapFixture());
    expect(parsed?.rosters[0].playerId).toBeNull();
    expect(parsed?.chat).toMatchObject({ contentState: "purged", latestSequence: null });
    expect(parsed?.capabilities).toMatchObject({ canRollByRoomState: true, canSendChatByRoomState: false });
  });

  it("rejects malformed and widened response payloads", () => {
    const fixture = bootstrapFixture();
    const widenedRoot = { ...fixture, privateRoomId: "not-in-contract" };
    const widenedChat = { ...fixture, chat: { ...fixture.chat, notification: "not-in-contract" } };
    const malformedDice = { ...fixture, dice: { ...fixture.dice, games: [{ ...fixture.dice.games[0], gameNumber: 2 }] } };

    expect(parseWarfrontOperationRoomBootstrap(null)).toBeNull();
    expect(parseWarfrontOperationRoomBootstrap(widenedRoot)).toBeNull();
    expect(parseWarfrontOperationRoomBootstrap(widenedChat)).toBeNull();
    expect(parseWarfrontOperationRoomBootstrap(malformedDice)).toBeNull();
  });

  it("rejects anonymous access before constructing the service-role client", async () => {
    authMock.mockResolvedValue(anonymousIdentity);

    await expect(getWarfrontOperationRoomBootstrap(OPERATION_ID)).resolves.toEqual({
      ok: false,
      code: "unauthenticated",
    });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("rejects invalid operation IDs before service-role access", async () => {
    await expect(getWarfrontOperationRoomBootstrap("invalid-operation-id")).resolves.toEqual({
      ok: false,
      code: "invalid_operation_id",
    });
    expect(authMock).toHaveBeenCalledOnce();
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("derives the Clerk actor server-side and calls the exact fixed RPC payload", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: bootstrapFixture(), error: null });
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    const result = await getWarfrontOperationRoomBootstrap(OPERATION_ID);

    expect(result).toEqual({ ok: true, data: bootstrapFixture() });
    expect(getWarfrontOperationRoomBootstrap).toHaveLength(1);
    expect(rpc).toHaveBeenCalledWith("get_warfront_operation_room_bootstrap_api", {
      p_operation_id: OPERATION_ID,
      p_actor_clerk_user_id: playerIdentity.userId,
    });
  });

  it("keeps raw database failures out of the safe result", async () => {
    const privateDetail = "private database error detail";
    createSupabaseAdminClientMock.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "42501", message: privateDetail, details: privateDetail, hint: privateDetail },
      }),
    });

    const result = await getWarfrontOperationRoomBootstrap(OPERATION_ID);

    expect(result).toEqual({ ok: false, code: "inaccessible" });
    expect(JSON.stringify(result)).not.toContain(privateDetail);
  });

  it("rejects malformed RPC data without exposing it", async () => {
    createSupabaseAdminClientMock.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: { unexpected: true }, error: null }),
    });

    await expect(getWarfrontOperationRoomBootstrap(OPERATION_ID)).resolves.toEqual({
      ok: false,
      code: "malformed_response",
    });
  });
});
