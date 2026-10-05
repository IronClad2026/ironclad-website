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
  cancelWarfrontOpenOperationAction,
  confirmWarfrontOperationResultAction,
  disputeWarfrontOperationResultAction,
  submitWarfrontOperationResultAction,
} from "@/app/warfront/actions";
import * as warfrontActions from "@/app/warfront/actions";
import * as operationCommands from "@/lib/warfront/commands/operations";

const OPERATION_ID = "11111111-1111-4111-8111-111111111111";
const SUBMISSION_ID = "22222222-2222-4222-8222-222222222222";
const TIMESTAMP = "2026-10-05T12:00:00.000Z";

const resultState = {
  operationId: OPERATION_ID,
  operationStatus: "pending_result",
  submittedResult: {
    challengerWins: 2,
    opponentWins: 1,
    winnerSide: "challenger",
  },
  disputed: false,
};

function submitInput() {
  return {
    operationId: OPERATION_ID,
    clientSubmissionId: SUBMISSION_ID,
    challengerWins: 2,
    opponentWins: 1,
  };
}

describe("WARFRONT Operation and Result commands", () => {
  beforeEach(() => {
    authMock.mockReset();
    legalGateMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    authMock.mockResolvedValue(playerIdentity);
    legalGateMock.mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("rejects unauthenticated callers before legal or service-role access", async () => {
    authMock.mockResolvedValue(anonymousIdentity);

    const result = await cancelWarfrontOpenOperationAction({
      operationId: OPERATION_ID,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED", retryable: false },
    });
    expect(legalGateMock).not.toHaveBeenCalled();
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("rejects malformed UUIDs, invalid scores, and injected actor fields before the legal gate", async () => {
    const malformedOperation = await cancelWarfrontOpenOperationAction({
      operationId: "not-a-uuid",
    });
    const malformedSubmission = await submitWarfrontOperationResultAction({
      ...submitInput(),
      clientSubmissionId: "not-a-uuid",
    });
    const invalidScore = await submitWarfrontOperationResultAction({
      ...submitInput(),
      challengerWins: "2",
    } as unknown as ReturnType<typeof submitInput>);
    const outOfRangeScore = await submitWarfrontOperationResultAction({
      ...submitInput(),
      opponentWins: 32768,
    });
    const forgedActor = await submitWarfrontOperationResultAction({
      ...submitInput(),
      clerkUserId: "attacker-selected-identity",
    });

    for (const result of [
      malformedOperation,
      malformedSubmission,
      invalidScore,
      outOfRangeScore,
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

  it("rejects PostgreSQL smallint underflow before the legal gate", async () => {
    const result = await submitWarfrontOperationResultAction({
      ...submitInput(),
      opponentWins: -32769,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR", retryable: false },
    });
    expect(legalGateMock).not.toHaveBeenCalled();
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "cancels an open Operation",
      invoke: () => cancelWarfrontOpenOperationAction({ operationId: OPERATION_ID }),
      rpcName: "cancel_warfront_open_operation_api",
      params: {
        p_operation_id: OPERATION_ID,
        p_actor_clerk_user_id: playerIdentity.userId,
      },
      data: {
        operationId: OPERATION_ID,
        status: "cancelled",
        cancelledAt: TIMESTAMP,
        duplicate: false,
      },
      expectedData: {
        operationId: OPERATION_ID,
        status: "cancelled",
        cancelledAt: TIMESTAMP,
        duplicate: false,
      },
    },
    {
      name: "submits a result with a Clerk-derived actor",
      invoke: () => submitWarfrontOperationResultAction(submitInput()),
      rpcName: "submit_warfront_operation_result_api",
      params: {
        p_operation_id: OPERATION_ID,
        p_actor_clerk_user_id: playerIdentity.userId,
        p_client_submission_id: SUBMISSION_ID,
        p_challenger_wins: 2,
        p_opponent_wins: 1,
      },
      data: { result: resultState, duplicate: false },
      expectedData: { result: resultState, duplicate: false },
    },
    {
      name: "confirms a result",
      invoke: () => confirmWarfrontOperationResultAction({ operationId: OPERATION_ID }),
      rpcName: "confirm_warfront_operation_result_api",
      params: {
        p_operation_id: OPERATION_ID,
        p_actor_clerk_user_id: playerIdentity.userId,
      },
      data: { result: resultState, confirmed: true },
      expectedData: { result: resultState, outcome: "confirmed" },
    },
    {
      name: "disputes a result",
      invoke: () => disputeWarfrontOperationResultAction({ operationId: OPERATION_ID }),
      rpcName: "dispute_warfront_operation_result_api",
      params: {
        p_operation_id: OPERATION_ID,
        p_actor_clerk_user_id: playerIdentity.userId,
      },
      data: { result: { ...resultState, disputed: true }, disputed: true },
      expectedData: {
        result: { ...resultState, disputed: true },
        outcome: "disputed",
      },
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

    const result = await confirmWarfrontOperationResultAction({
      operationId: OPERATION_ID,
    });

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

    const result = await submitWarfrontOperationResultAction(submitInput());

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

    const conflict = await confirmWarfrontOperationResultAction({
      operationId: OPERATION_ID,
    });
    const unexpected = await disputeWarfrontOperationResultAction({
      operationId: OPERATION_ID,
    });

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

  it("preserves the canonical duplicate submission outcome with a narrow result", async () => {
    createSupabaseAdminClientMock.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: {
          result: {
            ...resultState,
            logicalAutoFinalizationDue: true,
            finalizationMode: "private-state-not-exposed",
          },
          duplicate: true,
        },
        error: null,
      }),
    });

    const result = await submitWarfrontOperationResultAction(submitInput());

    expect(result).toMatchObject({
      ok: true,
      data: { result: resultState, duplicate: true },
    });
    expect(JSON.stringify(result)).not.toContain("logicalAutoFinalizationDue");
    expect(JSON.stringify(result)).not.toContain("private-state-not-exposed");
  });

  it("exports no Player-facing due-result reconciliation command", () => {
    expect(operationCommands).not.toHaveProperty(
      "reconcileWarfrontOperationResultIfDue"
    );
    expect(operationCommands).not.toHaveProperty(
      "reconcileDueWarfrontOperationResults"
    );
    expect(warfrontActions).not.toHaveProperty(
      "reconcileWarfrontOperationResultIfDueAction"
    );
    expect(warfrontActions).not.toHaveProperty(
      "reconcileDueWarfrontOperationResultsAction"
    );
  });
});
