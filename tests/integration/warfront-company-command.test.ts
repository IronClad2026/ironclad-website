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

import { createWarfrontCompanyAction } from "@/app/warfront/actions";
import type { CreateWarfrontCompanyInput } from "@/lib/warfront/contracts";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const validInput: CreateWarfrontCompanyInput = {
  name: "Iron Wolves",
  tag: "IW",
  slug: "iron-wolves",
  description: "A competitive Company.",
  region: "Europe",
};

function successfulRpcResult() {
  return {
    data: {
      companyId: COMPANY_ID,
      role: "commander",
      createdAt: "2026-10-05T12:00:00.000Z",
      duplicate: false,
    },
    error: null,
  };
}

describe("WARFRONT create Company command", () => {
  beforeEach(() => {
    authMock.mockReset();
    legalGateMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    authMock.mockResolvedValue(playerIdentity);
    legalGateMock.mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("rejects an unauthenticated caller before legal or service-role access", async () => {
    authMock.mockResolvedValue(anonymousIdentity);

    const result = await createWarfrontCompanyAction(validInput);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED", retryable: false },
    });
    expect(legalGateMock).not.toHaveBeenCalled();
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("rejects invalid transport input before the legal gate or RPC", async () => {
    const result = await createWarfrontCompanyAction({
      ...validInput,
      name: "x",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR", retryable: false },
    });
    expect(legalGateMock).not.toHaveBeenCalled();
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("derives the actor from Clerk and returns the typed successful result", async () => {
    const rpc = vi.fn().mockResolvedValue(successfulRpcResult());
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    const result = await createWarfrontCompanyAction(validInput);

    expect(result).toMatchObject({
      ok: true,
      data: successfulRpcResult().data,
    });
    expect(authMock).toHaveBeenCalledOnce();
    expect(legalGateMock.mock.invocationCallOrder[0]).toBeLessThan(
      rpc.mock.invocationCallOrder[0]
    );
    expect(rpc).toHaveBeenCalledWith("create_warfront_company_api", {
      p_actor_clerk_user_id: playerIdentity.userId,
      p_name: validInput.name,
      p_tag: validInput.tag,
      p_slug: validInput.slug,
      p_description: validInput.description,
      p_region: validInput.region,
    });
  });

  it("rejects an injected actor field instead of accepting caller-selected identity", async () => {
    const inputWithActor = {
      ...validInput,
      clerkUserId: "attacker-selected-identity",
    } as unknown as CreateWarfrontCompanyInput;

    const result = await createWarfrontCompanyAction(inputWithActor);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it.each(["4001", "40001", "PT409"]) (
    "returns a safe retryable concurrency outcome for %s",
    async (code) => {
      const privateDetail = `private database detail for ${code}`;
      createSupabaseAdminClientMock.mockReturnValue({
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { code, message: privateDetail, details: privateDetail },
        }),
      });

      const result = await createWarfrontCompanyAction(validInput);

      expect(result).toMatchObject({
        ok: false,
        error: { code: "CONCURRENCY_CONFLICT", retryable: true },
      });
      expect(JSON.stringify(result)).not.toContain(privateDetail);
      expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
        privateDetail
      );
    }
  );

  it("does not expose raw database details in a normalized failure", async () => {
    const privateMessage = "private PostgreSQL failure";
    createSupabaseAdminClientMock.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: "55000",
          message: privateMessage,
          details: privateMessage,
          hint: privateMessage,
        },
      }),
    });

    const result = await createWarfrontCompanyAction(validInput);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "LIFECYCLE_CONFLICT", retryable: false },
    });
    expect(JSON.stringify(result)).not.toContain(privateMessage);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      privateMessage
    );
  });
});
