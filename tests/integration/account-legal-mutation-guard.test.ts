import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminIdentity,
  anonymousIdentity,
  playerIdentity,
} from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const clerkClientMock = vi.hoisted(() => vi.fn());
const createAuthenticatedSupabaseClientMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const createInAppNotificationMock = vi.hoisted(() => vi.fn());
const getRelic1v1EloMock = vi.hoisted(() => vi.fn());
const getRequestLocaleMock = vi.hoisted(() => vi.fn());
const loadAccountLegalGateStateMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.unmock("@/lib/account-legal-mutation-guard");

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  clerkClient: clerkClientMock,
}));
vi.mock("@/lib/account-legal-acceptance", () => ({
  loadAccountLegalGateState: loadAccountLegalGateStateMock,
}));
vi.mock("@/lib/elo-verification/relic", () => ({
  getRelic1v1Elo: getRelic1v1EloMock,
}));
vi.mock("@/lib/i18n/request", () => ({
  getRequestLocale: getRequestLocaleMock,
}));
vi.mock("@/lib/notifications", () => ({
  createInAppNotification: createInAppNotificationMock,
}));
vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));
vi.mock("@/lib/supabase-server", () => ({
  createAuthenticatedSupabaseClient: createAuthenticatedSupabaseClientMock,
}));
vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import { setTournamentMediaPublished } from "@/app/admin/tournaments/media-actions";
import {
  confirmDashboardMatchResult,
  disputeDashboardMatchResult,
} from "@/app/dashboard/actions";
import { acceptAccountLegalUpdate } from "@/app/legal-update-actions";
import { deleteIronCladAccount } from "@/app/profile/delete-account-action";
import { submitTournamentRegistration } from "@/app/tournaments/actions";
import {
  AccountLegalMutationBlockedError,
  requireCurrentAccountLegalAcceptance,
} from "@/lib/account-legal-mutation-guard";

const TERMS_ID = "11111111-1111-4111-8111-111111111111";
const PRIVACY_ID = "22222222-2222-4222-8222-222222222222";
const ACCEPTANCE_ID = "33333333-3333-4333-8333-333333333333";
const REPORT_GROUP_ID = "44444444-4444-4444-8444-444444444444";
const TOURNAMENT_ID = "55555555-5555-4555-8555-555555555555";
const BRACKET_ID = "66666666-6666-4666-8666-666666666666";
const MEDIA_ID = "77777777-7777-4777-8777-777777777777";

const requiredState = {
  status: "required" as const,
  terms: {
    id: TERMS_ID,
    version: "1.1",
    url: "/legal/terms-v1.1.pdf",
  },
  privacy: {
    id: PRIVACY_ID,
    version: "1.2",
    url: "/legal/privacy-v1.2.pdf",
  },
};

describe("authenticated mutation legal-acceptance guard", () => {
  beforeEach(() => {
    authMock.mockResolvedValue(playerIdentity);
    clerkClientMock.mockReset();
    createAuthenticatedSupabaseClientMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    createInAppNotificationMock.mockReset();
    getRelic1v1EloMock.mockReset();
    getRequestLocaleMock.mockResolvedValue("en");
    loadAccountLegalGateStateMock.mockResolvedValue({ status: "satisfied" });
    revalidatePathMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("blocks the original REQUIRED dashboard confirmation bypass before RPC execution", async () => {
    const rpc = vi.fn();
    loadAccountLegalGateStateMock.mockResolvedValue(requiredState);
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    await expect(
      confirmDashboardMatchResult(
        formData({ reportGroupId: REPORT_GROUP_ID })
      )
    ).rejects.toMatchObject({
      name: "AccountLegalMutationBlockedError",
      reason: "required",
    });

    expect(loadAccountLegalGateStateMock).toHaveBeenCalledOnce();
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("allows an accepted user to confirm through the unchanged authoritative RPC", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    await expect(
      confirmDashboardMatchResult(
        formData({ reportGroupId: REPORT_GROUP_ID })
      )
    ).resolves.toEqual({
      status: "success",
      code: "confirmed",
      message: "Result confirmed. The bracket has been updated.",
    });

    expect(loadAccountLegalGateStateMock).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("confirm_match_result_report_group_api", {
      p_report_group_id: REPORT_GROUP_ID,
      p_confirmed_by_clerk_user_id: playerIdentity.userId,
    });
  });

  it("protects the dashboard dispute path before RPC execution", async () => {
    const rpc = vi.fn();
    loadAccountLegalGateStateMock.mockResolvedValue(requiredState);
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    await expect(
      disputeDashboardMatchResult(
        formData({
          reportGroupId: REPORT_GROUP_ID,
          disputeNotes: "The reported score is incorrect.",
        })
      )
    ).rejects.toMatchObject({
      name: "AccountLegalMutationBlockedError",
      reason: "required",
    });

    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fails closed for UNAVAILABLE before dashboard RPC execution", async () => {
    const rpc = vi.fn();
    loadAccountLegalGateStateMock.mockResolvedValue({ status: "unavailable" });
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    await expect(
      confirmDashboardMatchResult(
        formData({ reportGroupId: REPORT_GROUP_ID })
      )
    ).rejects.toMatchObject({
      name: "AccountLegalMutationBlockedError",
      reason: "unavailable",
    });

    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("preserves existing anonymous authentication handling without consulting the guard authority", async () => {
    authMock.mockResolvedValue(anonymousIdentity);

    await expect(
      confirmDashboardMatchResult(
        formData({ reportGroupId: REPORT_GROUP_ID })
      )
    ).resolves.toEqual({
      status: "error",
      code: "sign-in-required",
      message: "Sign in before confirming a match result.",
    });

    expect(loadAccountLegalGateStateMock).not.toHaveBeenCalled();
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("defensively maps an unexpected inactive guard state to fail-closed UNAVAILABLE", async () => {
    loadAccountLegalGateStateMock.mockResolvedValue({
      status: "inactive",
      reason: "anonymous",
    });

    await expect(requireCurrentAccountLegalAcceptance()).rejects.toEqual(
      expect.objectContaining({
        name: "AccountLegalMutationBlockedError",
        reason: "unavailable",
      })
    );
  });

  it("protects a representative Player registration mutation before trusted-client construction", async () => {
    loadAccountLegalGateStateMock.mockResolvedValue(requiredState);

    await expect(
      submitTournamentRegistration({
        tournamentId: TOURNAMENT_ID,
        bracketId: BRACKET_ID,
        tournamentTitle: "IronClad Open",
        bracketName: "Academy",
        rulebookDocumentId: "88888888-8888-4888-8888-888888888888",
        ppaDocumentId: "99999999-9999-4999-8999-999999999999",
        termsDocumentId: TERMS_ID,
        privacyDocumentId: PRIVACY_ID,
        rulebookAgreement: true,
        playerParticipationAgreement: true,
        termsAgreement: true,
        privacyAcknowledgement: true,
        age18Confirmation: true,
        accountAndSteamOwnershipConfirmation: true,
        waitlistConfirmed: true,
      })
    ).rejects.toMatchObject({
      name: "AccountLegalMutationBlockedError",
      reason: "required",
    });

    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
    expect(getRelic1v1EloMock).not.toHaveBeenCalled();
  });

  it("protects a representative Admin media mutation before trusted-client construction", async () => {
    authMock.mockResolvedValue(adminIdentity);
    loadAccountLegalGateStateMock.mockResolvedValue(requiredState);

    await expect(
      setTournamentMediaPublished({
        tournamentId: TOURNAMENT_ID,
        mediaId: MEDIA_ID,
        published: true,
      })
    ).rejects.toMatchObject({
      name: "AccountLegalMutationBlockedError",
      reason: "required",
    });

    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("keeps the legal acceptance action callable while acceptance is REQUIRED", async () => {
    loadAccountLegalGateStateMock.mockResolvedValue(requiredState);
    const rpc = vi.fn(async () => ({
      data: [
        {
          acceptance_id: ACCEPTANCE_ID,
          accepted_at: "2026-08-31T00:00:00.000Z",
          terms_document_id: TERMS_ID,
          privacy_document_id: PRIVACY_ID,
        },
      ],
      error: null,
    }));
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    await expect(
      acceptAccountLegalUpdate(
        { status: "idle", code: "idle" },
        legalAcceptanceFormData()
      )
    ).resolves.toEqual({ status: "success", code: "accepted" });

    expect(loadAccountLegalGateStateMock).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      "accept_current_account_legal_documents",
      expect.objectContaining({
        p_clerk_user_id: playerIdentity.userId,
        p_expected_terms_document_id: TERMS_ID,
        p_expected_privacy_document_id: PRIVACY_ID,
      })
    );
  });

  it("keeps the account-deletion privacy-right action callable while acceptance is REQUIRED", async () => {
    loadAccountLegalGateStateMock.mockResolvedValue(requiredState);
    const remove = vi.fn(async () => ({ error: null }));
    const from = vi.fn(() => ({ remove }));
    const rpc = vi.fn(async () => ({
      data: { outcome: "deleted" },
      error: null,
    }));
    const deleteUser = vi.fn(async () => undefined);
    createSupabaseAdminClientMock.mockReturnValue({
      rpc,
      storage: { from },
    });
    clerkClientMock.mockResolvedValue({ users: { deleteUser } });

    await expect(
      deleteIronCladAccount(
        { status: "idle", message: "" },
        formData({ confirmation: "DELETE" })
      )
    ).resolves.toEqual({
      status: "success",
      code: "deleted",
      message: "Your IronClad account has been deleted.",
    });

    expect(loadAccountLegalGateStateMock).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith([
      `${playerIdentity.userId}/avatar`,
    ]);
    expect(rpc).toHaveBeenCalledWith("close_ironclad_player_account", {
      p_clerk_user_id: playerIdentity.userId,
    });
    expect(deleteUser).toHaveBeenCalledWith(playerIdentity.userId);
  });

  it("converts authority failures to the same fail-closed UNAVAILABLE error", async () => {
    loadAccountLegalGateStateMock.mockRejectedValue(
      new Error("private legal lookup detail")
    );

    const failure = await requireCurrentAccountLegalAcceptance().catch(
      (error: unknown) => error
    );

    expect(failure).toBeInstanceOf(AccountLegalMutationBlockedError);
    expect(failure).toMatchObject({
      reason: "unavailable",
    });
  });
});

function formData(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

function legalAcceptanceFormData() {
  const data = formData({
    termsDocumentId: TERMS_ID,
    privacyDocumentId: PRIVACY_ID,
    termsAccepted: "accepted",
    privacyAcknowledged: "acknowledged",
  });
  return data;
}
