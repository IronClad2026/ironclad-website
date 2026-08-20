import { beforeEach, describe, expect, it, vi } from "vitest";
import { anonymousIdentity, playerIdentity } from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { acceptAccountLegalUpdate } from "@/app/legal-update-actions";
import type { AccountLegalAcceptanceActionState } from "@/app/legal-update-actions";

const TERMS_ID = "11111111-1111-4111-8111-111111111111";
const PRIVACY_ID = "22222222-2222-4222-8222-222222222222";
const ACCEPTANCE_ID = "33333333-3333-4333-8333-333333333333";
const initialState: AccountLegalAcceptanceActionState = {
  status: "idle",
  code: "idle",
};

function form({ terms = true, privacy = true } = {}) {
  const data = new FormData();
  data.set("termsDocumentId", TERMS_ID);
  data.set("privacyDocumentId", PRIVACY_ID);
  if (terms) data.set("termsAccepted", "accepted");
  if (privacy) data.set("privacyAcknowledged", "acknowledged");
  return data;
}

describe("account legal acceptance action", () => {
  beforeEach(() => {
    authMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    revalidatePathMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("denies an unauthenticated request before trusted-client construction", async () => {
    authMock.mockResolvedValue(anonymousIdentity);

    await expect(
      acceptAccountLegalUpdate(
        initialState,
        form()
      )
    ).resolves.toEqual({ status: "error", code: "auth-required" });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it.each([
    ["Terms", { terms: false, privacy: true }],
    ["Privacy", { terms: true, privacy: false }],
  ])("requires explicit unchecked-by-default %s confirmation", async (_, values) => {
    authMock.mockResolvedValue(playerIdentity);

    await expect(
      acceptAccountLegalUpdate(
        initialState,
        form(values)
      )
    ).resolves.toEqual({ status: "error", code: "acceptance-required" });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("passes only identity, untrusted selectors, and true controls to the authoritative RPC", async () => {
    authMock.mockResolvedValue(playerIdentity);
    const rpc = vi.fn(async () => ({
      data: [
        {
          acceptance_id: ACCEPTANCE_ID,
          accepted_at: "2026-08-19T02:00:00.000Z",
          terms_document_id: TERMS_ID,
          privacy_document_id: PRIVACY_ID,
        },
      ],
      error: null,
    }));
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    await expect(
      acceptAccountLegalUpdate(
        initialState,
        form()
      )
    ).resolves.toEqual({ status: "success", code: "accepted" });

    expect(authMock.mock.invocationCallOrder[0]).toBeLessThan(
      createSupabaseAdminClientMock.mock.invocationCallOrder[0]
    );
    expect(rpc).toHaveBeenCalledWith(
      "accept_current_account_legal_documents",
      {
        p_clerk_user_id: playerIdentity.userId,
        p_expected_terms_document_id: TERMS_ID,
        p_expected_privacy_document_id: PRIVACY_ID,
        p_terms_accepted: true,
        p_privacy_acknowledged: true,
      }
    );
    expect(JSON.stringify(rpc.mock.calls)).not.toMatch(
      /sha256|immutable_url|version|accepted_at/
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
  });

  it("sanitizes a failed transaction and does not revalidate", async () => {
    authMock.mockResolvedValue(playerIdentity);
    const privateMessage = "private database detail";
    createSupabaseAdminClientMock.mockReturnValue({
      rpc: vi.fn(async () => ({ data: null, error: new Error(privateMessage) })),
    });

    await expect(
      acceptAccountLegalUpdate(
        initialState,
        form()
      )
    ).resolves.toEqual({ status: "error", code: "unavailable" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalledWith(
      expect.stringContaining(privateMessage)
    );
  });

  it("keeps a committed acceptance successful when cache invalidation fails", async () => {
    authMock.mockResolvedValue(playerIdentity);
    createSupabaseAdminClientMock.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: [
          {
            acceptance_id: ACCEPTANCE_ID,
            accepted_at: "2026-08-19T02:00:00.000Z",
            terms_document_id: TERMS_ID,
            privacy_document_id: PRIVACY_ID,
          },
        ],
        error: null,
      })),
    });
    revalidatePathMock.mockImplementation(() => {
      throw new Error("private cache detail");
    });

    await expect(
      acceptAccountLegalUpdate(
        initialState,
        form()
      )
    ).resolves.toEqual({ status: "success", code: "accepted" });
  });
});
