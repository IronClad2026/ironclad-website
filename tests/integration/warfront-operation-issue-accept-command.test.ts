import { beforeEach, describe, expect, it, vi } from "vitest";
import { anonymousIdentity, playerIdentity } from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const legalGateMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/account-legal-mutation-guard", () => ({
  AccountLegalMutationBlockedError: class AccountLegalMutationBlockedError extends Error {
    reason: "required" | "unavailable";

    constructor(reason: "required" | "unavailable") {
      super(reason);
      this.reason = reason;
    }
  },
  requireCurrentAccountLegalAcceptance: legalGateMock,
}));
vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

import {
  acceptWarfrontOperationAction,
  issueWarfrontOperationAction,
} from "@/app/warfront/actions";
import * as warfrontActions from "@/app/warfront/actions";
import * as operationCommands from "@/lib/warfront/commands/operations";

const OPERATION_ID = "11111111-1111-4111-8111-111111111111";
const CHALLENGER_COMPANY_ID = "22222222-2222-4222-8222-222222222222";
const OPPONENT_COMPANY_ID = "33333333-3333-4333-8333-333333333333";
const CHALLENGER_PLAYER_ONE = "44444444-4444-4444-8444-444444444444";
const CHALLENGER_PLAYER_TWO = "55555555-5555-4555-8555-555555555555";
const OPPONENT_PLAYER_ONE = "66666666-6666-4666-8666-666666666666";
const OPPONENT_PLAYER_TWO = "77777777-7777-4777-8777-777777777777";
const OPENED_AT = "2026-10-05T12:00:00.000Z";
const EXPIRES_AT = "2026-10-05T13:00:00.000Z";

function issueInput() {
  return {
    format: "2v2" as const,
    seriesBestOf: 3,
    challengerPlayerIds: [CHALLENGER_PLAYER_ONE, CHALLENGER_PLAYER_TWO],
    region: "EU",
    notes: "Good luck.",
  };
}

function acceptInput() {
  return {
    operationId: OPERATION_ID,
    opponentPlayerIds: [OPPONENT_PLAYER_ONE, OPPONENT_PLAYER_TWO],
  };
}

const issueOutput = {
  operationId: OPERATION_ID,
  status: "open",
  challengerCompanyId: CHALLENGER_COMPANY_ID,
  format: "2v2",
  seriesBestOf: 3,
  challengerRosterEloSnapshot: 1500.25,
  openedAt: OPENED_AT,
  expiresAt: EXPIRES_AT,
};

const acceptOutput = {
  operationId: OPERATION_ID,
  status: "accepted",
  challengerCompanyId: CHALLENGER_COMPANY_ID,
  opponentCompanyId: OPPONENT_COMPANY_ID,
  format: "2v2",
  seriesBestOf: 3,
  challengerRosterEloSnapshot: 1500.25,
  opponentRosterEloSnapshot: 1510.5,
  acceptedAt: OPENED_AT,
  rosterLockedAt: OPENED_AT,
};

describe("WARFRONT Operation issue and acceptance commands", () => {
  beforeEach(() => {
    authMock.mockReset();
    legalGateMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    authMock.mockResolvedValue(playerIdentity);
    legalGateMock.mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it.each([
    ["issue", () => issueWarfrontOperationAction(issueInput())],
    ["accept", () => acceptWarfrontOperationAction(acceptInput())],
  ])("rejects unauthenticated %s callers before legal or service-role access", async (_, invoke) => {
    authMock.mockResolvedValue(anonymousIdentity);

    const result = await invoke();

    expect(result).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED", retryable: false },
    });
    expect(legalGateMock).not.toHaveBeenCalled();
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("rejects malformed selectors, invalid primitives, bounds, unknown fields, and injected actors before the legal gate", async () => {
    const malformedOperation = await acceptWarfrontOperationAction({
      ...acceptInput(),
      operationId: "not-a-uuid",
    });
    const malformedRoster = await issueWarfrontOperationAction({
      ...issueInput(),
      challengerPlayerIds: ["not-a-uuid"],
    });
    const invalidPrimitive = await issueWarfrontOperationAction({
      ...issueInput(),
      seriesBestOf: "3",
    } as unknown as ReturnType<typeof issueInput>);
    const overflow = await issueWarfrontOperationAction({
      ...issueInput(),
      seriesBestOf: 32768,
    });
    const underflow = await issueWarfrontOperationAction({
      ...issueInput(),
      seriesBestOf: -32769,
    });
    const unknownField = await acceptWarfrontOperationAction({
      ...acceptInput(),
      unexpected: true,
    });
    const forgedActor = await issueWarfrontOperationAction({
      ...issueInput(),
      clerkUserId: "attacker-selected-identity",
    });

    for (const result of [
      malformedOperation,
      malformedRoster,
      invalidPrimitive,
      overflow,
      underflow,
      unknownField,
      forgedActor,
    ]) {
      expect(result).toMatchObject({
        ok: false,
        error: { code: "VALIDATION_ERROR", retryable: false },
      });
    }
    expect(legalGateMock).not.toHaveBeenCalled();
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it.each([32767, -32768])(
    "passes the valid PostgreSQL smallint boundary %i to the canonical RPC boundary",
    async (seriesBestOf) => {
      const rpc = vi.fn().mockResolvedValue({
        data: null,
        error: { code: "55000" },
      });
      createSupabaseAdminClientMock.mockReturnValue({ rpc });

      const result = await issueWarfrontOperationAction({
        ...issueInput(),
        seriesBestOf,
      });

      expect(result).toMatchObject({
        ok: false,
        error: { code: "LIFECYCLE_CONFLICT", retryable: false },
      });
      expect(legalGateMock).toHaveBeenCalledTimes(1);
      expect(rpc).toHaveBeenCalledWith("issue_warfront_operation_api", {
        p_actor_clerk_user_id: playerIdentity.userId,
        p_format: "2v2",
        p_series_best_of: seriesBestOf,
        p_challenger_player_ids: [
          CHALLENGER_PLAYER_ONE,
          CHALLENGER_PLAYER_TWO,
        ],
        p_region: "EU",
        p_notes: "Good luck.",
      });
    }
  );

  it.each([
    {
      name: "issues an Operation with the Clerk-derived actor",
      invoke: () => issueWarfrontOperationAction(issueInput()),
      rpcName: "issue_warfront_operation_api",
      params: {
        p_actor_clerk_user_id: playerIdentity.userId,
        p_format: "2v2",
        p_series_best_of: 3,
        p_challenger_player_ids: [CHALLENGER_PLAYER_ONE, CHALLENGER_PLAYER_TWO],
        p_region: "EU",
        p_notes: "Good luck.",
      },
      data: issueOutput,
      expectedData: issueOutput,
    },
    {
      name: "accepts an Operation with the Clerk-derived actor",
      invoke: () => acceptWarfrontOperationAction(acceptInput()),
      rpcName: "accept_warfront_operation_api",
      params: {
        p_operation_id: OPERATION_ID,
        p_actor_clerk_user_id: playerIdentity.userId,
        p_opponent_player_ids: [OPPONENT_PLAYER_ONE, OPPONENT_PLAYER_TWO],
      },
      data: acceptOutput,
      expectedData: acceptOutput,
    },
  ])("$name through its exact fixed canonical RPC", async ({
    invoke,
    rpcName,
    params,
    data,
    expectedData,
  }) => {
    const rpc = vi.fn().mockResolvedValue({ data, error: null });
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    const result = await invoke();

    expect(result).toMatchObject({ ok: true, data: expectedData });
    expect(legalGateMock.mock.invocationCallOrder[0]).toBeLessThan(
      rpc.mock.invocationCallOrder[0]
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(rpcName, params);
  });

  it("does not invoke the RPC when the existing legal gate rejects", async () => {
    legalGateMock.mockRejectedValue(new Error("legal gate unavailable"));

    const result = await issueWarfrontOperationAction(issueInput());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "LEGAL_UNAVAILABLE", retryable: false },
    });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it.each([
    ["22023", "VALIDATION_ERROR", false],
    ["42501", "FORBIDDEN", false],
    ["P0002", "NOT_FOUND", false],
    ["55000", "LIFECYCLE_CONFLICT", false],
    ["4001", "CONCURRENCY_CONFLICT", true],
    ["40001", "CONCURRENCY_CONFLICT", true],
    ["40P01", "CONCURRENCY_CONFLICT", true],
    ["PT409", "CONCURRENCY_CONFLICT", true],
  ])("normalizes %s without exposing raw database data", async (code, errorCode, retryable) => {
    const privateDetail = `private database detail for ${code}`;
    createSupabaseAdminClientMock.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code,
          message: privateDetail,
          details: privateDetail,
          hint: privateDetail,
        },
      }),
    });

    const result = await issueWarfrontOperationAction(issueInput());

    expect(result).toMatchObject({
      ok: false,
      error: { code: errorCode, retryable },
    });
    expect(JSON.stringify(result)).not.toContain(privateDetail);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      privateDetail
    );
  });

  it("normalizes HTTP 409 and unexpected exceptions without raw database leakage", async () => {
    const privateDetail = "private transport/database detail";
    createSupabaseAdminClientMock.mockReturnValue({
      rpc: vi
        .fn()
        .mockResolvedValueOnce({
          data: null,
          error: { status: 409, message: privateDetail, details: privateDetail },
        })
        .mockRejectedValueOnce(new Error(privateDetail)),
    });

    const conflict = await acceptWarfrontOperationAction(acceptInput());
    const unexpected = await issueWarfrontOperationAction(issueInput());

    expect(conflict).toMatchObject({
      ok: false,
      error: { code: "CONCURRENCY_CONFLICT", retryable: true },
    });
    expect(unexpected).toMatchObject({
      ok: false,
      error: { code: "INTERNAL_ERROR", retryable: false },
    });
    expect(JSON.stringify([conflict, unexpected])).not.toContain(privateDetail);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      privateDetail
    );
  });

  it("returns only the documented safe issue DTO fields", async () => {
    createSupabaseAdminClientMock.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: {
          ...issueOutput,
          rosterPlayerIds: [CHALLENGER_PLAYER_ONE, CHALLENGER_PLAYER_TWO],
          internalLockState: "not-for-browser",
        },
        error: null,
      }),
    });

    const result = await issueWarfrontOperationAction(issueInput());

    expect(result).toMatchObject({ ok: true, data: issueOutput });
    expect(JSON.stringify(result)).not.toContain("rosterPlayerIds");
    expect(JSON.stringify(result)).not.toContain("internalLockState");
  });

  it("exports no Player-facing reconciliation or maintenance command", () => {
    expect(operationCommands).not.toHaveProperty(
      "reconcileWarfrontOperationResultIfDue"
    );
    expect(operationCommands).not.toHaveProperty(
      "reconcileDueWarfrontOperationResults"
    );
    expect(operationCommands).not.toHaveProperty("expireWarfrontOpenOperations");
    expect(operationCommands).not.toHaveProperty(
      "reconcileWarfrontOperationSettlements"
    );
    expect(warfrontActions).not.toHaveProperty(
      "reconcileWarfrontOperationResultIfDueAction"
    );
    expect(warfrontActions).not.toHaveProperty(
      "reconcileDueWarfrontOperationResultsAction"
    );
    expect(warfrontActions).not.toHaveProperty(
      "expireWarfrontOpenOperationsAction"
    );
  });
});
