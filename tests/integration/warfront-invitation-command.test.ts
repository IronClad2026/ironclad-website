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
  acceptWarfrontCompanyInvitationAction,
  archiveWarfrontCompanyAction,
  declineWarfrontCompanyInvitationAction,
  demoteWarfrontCompanyOfficerToMemberAction,
  inviteWarfrontCompanyPlayerAction,
  leaveWarfrontCompanyAction,
  promoteWarfrontCompanyMemberToOfficerAction,
  removeWarfrontCompanyMemberAction,
  revokeWarfrontCompanyInvitationAction,
  transferWarfrontCompanyCommanderAction,
} from "@/app/warfront/actions";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_PLAYER_ID = "22222222-2222-4222-8222-222222222222";
const INVITATION_ID = "33333333-3333-4333-8333-333333333333";
const TIMESTAMP = "2026-10-05T12:00:00.000Z";

describe("WARFRONT Company and invitation commands", () => {
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

    const result = await inviteWarfrontCompanyPlayerAction({
      companyId: COMPANY_ID,
      recipientPlayerId: TARGET_PLAYER_ID,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED", retryable: false },
    });
    expect(legalGateMock).not.toHaveBeenCalled();
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("rejects invalid UUIDs, unknown fields, and a forged actor before the legal gate", async () => {
    const invalidUuid = await leaveWarfrontCompanyAction({ companyId: "not-a-uuid" });
    const forgedInput = {
      companyId: COMPANY_ID,
      recipientPlayerId: TARGET_PLAYER_ID,
      clerkUserId: "attacker-selected-identity",
    };
    const injectedActor = await inviteWarfrontCompanyPlayerAction(forgedInput);

    expect(invalidUuid).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
    expect(injectedActor).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
    expect(legalGateMock).not.toHaveBeenCalled();
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "leaves a Company",
      invoke: () => leaveWarfrontCompanyAction({ companyId: COMPANY_ID }),
      rpcName: "leave_warfront_company_api",
      params: {
        p_company_id: COMPANY_ID,
        p_actor_clerk_user_id: playerIdentity.userId,
      },
      data: { companyId: COMPANY_ID, leftAt: TIMESTAMP, openOperationCancelled: false },
    },
    {
      name: "removes a member",
      invoke: () => removeWarfrontCompanyMemberAction({ companyId: COMPANY_ID, targetPlayerId: TARGET_PLAYER_ID }),
      rpcName: "remove_warfront_company_member_api",
      params: { p_company_id: COMPANY_ID, p_actor_clerk_user_id: playerIdentity.userId, p_target_player_id: TARGET_PLAYER_ID },
      data: { companyId: COMPANY_ID, removedAt: TIMESTAMP, openOperationCancelled: true },
    },
    {
      name: "promotes a member",
      invoke: () => promoteWarfrontCompanyMemberToOfficerAction({ companyId: COMPANY_ID, targetPlayerId: TARGET_PLAYER_ID }),
      rpcName: "promote_warfront_company_member_to_officer_api",
      params: { p_company_id: COMPANY_ID, p_actor_clerk_user_id: playerIdentity.userId, p_target_player_id: TARGET_PLAYER_ID },
      data: { companyId: COMPANY_ID, role: "officer", duplicate: false },
    },
    {
      name: "demotes an officer",
      invoke: () => demoteWarfrontCompanyOfficerToMemberAction({ companyId: COMPANY_ID, targetPlayerId: TARGET_PLAYER_ID }),
      rpcName: "demote_warfront_company_officer_to_member_api",
      params: { p_company_id: COMPANY_ID, p_actor_clerk_user_id: playerIdentity.userId, p_target_player_id: TARGET_PLAYER_ID },
      data: { companyId: COMPANY_ID, role: "member", duplicate: false },
    },
    {
      name: "transfers command",
      invoke: () => transferWarfrontCompanyCommanderAction({ companyId: COMPANY_ID, targetPlayerId: TARGET_PLAYER_ID }),
      rpcName: "transfer_warfront_company_commander_api",
      params: { p_company_id: COMPANY_ID, p_actor_clerk_user_id: playerIdentity.userId, p_target_player_id: TARGET_PLAYER_ID },
      data: { companyId: COMPANY_ID, transferredAt: TIMESTAMP, duplicate: false },
    },
    {
      name: "archives a Company",
      invoke: () => archiveWarfrontCompanyAction({ companyId: COMPANY_ID }),
      rpcName: "archive_warfront_company_api",
      params: { p_company_id: COMPANY_ID, p_actor_clerk_user_id: playerIdentity.userId },
      data: { companyId: COMPANY_ID, status: "archived", archivedAt: TIMESTAMP, duplicate: false },
    },
    {
      name: "invites a target Player without making it the actor",
      invoke: () => inviteWarfrontCompanyPlayerAction({ companyId: COMPANY_ID, recipientPlayerId: TARGET_PLAYER_ID }),
      rpcName: "invite_warfront_company_player_api",
      params: { p_company_id: COMPANY_ID, p_actor_clerk_user_id: playerIdentity.userId, p_recipient_player_id: TARGET_PLAYER_ID },
      data: { invitationId: INVITATION_ID, companyId: COMPANY_ID, status: "pending", duplicate: false },
    },
    {
      name: "accepts an invitation",
      invoke: () => acceptWarfrontCompanyInvitationAction({ invitationId: INVITATION_ID }),
      rpcName: "accept_warfront_company_invitation_api",
      params: { p_invitation_id: INVITATION_ID, p_actor_clerk_user_id: playerIdentity.userId },
      data: { invitationId: INVITATION_ID, companyId: COMPANY_ID, status: "accepted", duplicate: false },
    },
    {
      name: "declines an invitation",
      invoke: () => declineWarfrontCompanyInvitationAction({ invitationId: INVITATION_ID }),
      rpcName: "decline_warfront_company_invitation_api",
      params: { p_invitation_id: INVITATION_ID, p_actor_clerk_user_id: playerIdentity.userId },
      data: { invitationId: INVITATION_ID, status: "declined", duplicate: false },
    },
    {
      name: "revokes an invitation",
      invoke: () => revokeWarfrontCompanyInvitationAction({ invitationId: INVITATION_ID }),
      rpcName: "revoke_warfront_company_invitation_api",
      params: { p_invitation_id: INVITATION_ID, p_actor_clerk_user_id: playerIdentity.userId },
      data: { invitationId: INVITATION_ID, status: "invalidated", duplicate: false },
    },
  ])("$name through its exact fixed M12 RPC", async ({ invoke, rpcName, params, data }) => {
    const rpc = vi.fn().mockResolvedValue({ data, error: null });
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    const result = await invoke();

    expect(result).toMatchObject({ ok: true, data });
    expect(legalGateMock.mock.invocationCallOrder[0]).toBeLessThan(
      rpc.mock.invocationCallOrder[0]
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(rpcName, params);
  });

  it.each(["4001", "40001", "PT409"])(
    "normalizes %s without exposing private database detail",
    async (code) => {
      const privateDetail = `private database detail for ${code}`;
      createSupabaseAdminClientMock.mockReturnValue({
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { code, message: privateDetail, details: privateDetail },
        }),
      });

      const result = await acceptWarfrontCompanyInvitationAction({
        invitationId: INVITATION_ID,
      });

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

  it("normalizes lifecycle failures without exposing raw database data", async () => {
    const privateDetail = "private lifecycle database detail";
    createSupabaseAdminClientMock.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: "55000",
          message: privateDetail,
          details: privateDetail,
          hint: privateDetail,
        },
      }),
    });

    const result = await revokeWarfrontCompanyInvitationAction({
      invitationId: INVITATION_ID,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "LIFECYCLE_CONFLICT", retryable: false },
    });
    expect(JSON.stringify(result)).not.toContain(privateDetail);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      privateDetail
    );
  });

  it("preserves the archive wrapper's duplicate response without inventing archivedAt", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { companyId: COMPANY_ID, status: "archived", duplicate: true },
      error: null,
    });
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    const result = await archiveWarfrontCompanyAction({ companyId: COMPANY_ID });

    expect(result).toMatchObject({
      ok: true,
      data: { companyId: COMPANY_ID, status: "archived", duplicate: true },
    });
    if (result.ok) expect(result.data.archivedAt).toBeUndefined();
  });
});
