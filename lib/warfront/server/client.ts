import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type CreateWarfrontCompanyRpcInput = {
  actorClerkUserId: string;
  name: string;
  tag: string;
  slug: string;
  description: string | null;
  region: string | null;
};

type CompanyActorRpcInput = {
  companyId: string;
  actorClerkUserId: string;
};

type CompanyTargetRpcInput = CompanyActorRpcInput & {
  targetPlayerId: string;
};

type InvitationActorRpcInput = {
  invitationId: string;
  actorClerkUserId: string;
};

type InviteCompanyPlayerRpcInput = CompanyActorRpcInput & {
  recipientPlayerId: string;
};

type OperationActorRpcInput = {
  operationId: string;
  actorClerkUserId: string;
};

type IssueOperationRpcInput = {
  actorClerkUserId: string;
  format: string;
  seriesBestOf: number;
  challengerPlayerIds: string[];
  region: string | null;
  notes: string | null;
};

type AcceptOperationRpcInput = OperationActorRpcInput & {
  opponentPlayerIds: string[];
};

type SubmitOperationResultRpcInput = OperationActorRpcInput & {
  clientSubmissionId: string;
  challengerWins: number;
  opponentWins: number;
};

export type WarfrontRpcResponse = {
  data: unknown;
  error: unknown;
};

export async function invokeCreateWarfrontCompany(
  input: CreateWarfrontCompanyRpcInput
): Promise<WarfrontRpcResponse> {
  const client = createSupabaseAdminClient();

  return client.rpc("create_warfront_company_api", {
    p_actor_clerk_user_id: input.actorClerkUserId,
    p_name: input.name,
    p_tag: input.tag,
    p_slug: input.slug,
    p_description: input.description,
    p_region: input.region,
  });
}

export async function callLeaveWarfrontCompany(
  input: CompanyActorRpcInput
): Promise<WarfrontRpcResponse> {
  const client = createSupabaseAdminClient();
  return client.rpc("leave_warfront_company_api", {
    p_company_id: input.companyId,
    p_actor_clerk_user_id: input.actorClerkUserId,
  });
}

export async function callRemoveWarfrontCompanyMember(
  input: CompanyTargetRpcInput
): Promise<WarfrontRpcResponse> {
  const client = createSupabaseAdminClient();
  return client.rpc("remove_warfront_company_member_api", {
    p_company_id: input.companyId,
    p_actor_clerk_user_id: input.actorClerkUserId,
    p_target_player_id: input.targetPlayerId,
  });
}

export async function callPromoteWarfrontCompanyMemberToOfficer(
  input: CompanyTargetRpcInput
): Promise<WarfrontRpcResponse> {
  const client = createSupabaseAdminClient();
  return client.rpc("promote_warfront_company_member_to_officer_api", {
    p_company_id: input.companyId,
    p_actor_clerk_user_id: input.actorClerkUserId,
    p_target_player_id: input.targetPlayerId,
  });
}

export async function callDemoteWarfrontCompanyOfficerToMember(
  input: CompanyTargetRpcInput
): Promise<WarfrontRpcResponse> {
  const client = createSupabaseAdminClient();
  return client.rpc("demote_warfront_company_officer_to_member_api", {
    p_company_id: input.companyId,
    p_actor_clerk_user_id: input.actorClerkUserId,
    p_target_player_id: input.targetPlayerId,
  });
}

export async function callTransferWarfrontCompanyCommander(
  input: CompanyTargetRpcInput
): Promise<WarfrontRpcResponse> {
  const client = createSupabaseAdminClient();
  return client.rpc("transfer_warfront_company_commander_api", {
    p_company_id: input.companyId,
    p_actor_clerk_user_id: input.actorClerkUserId,
    p_target_player_id: input.targetPlayerId,
  });
}

export async function callArchiveWarfrontCompany(
  input: CompanyActorRpcInput
): Promise<WarfrontRpcResponse> {
  const client = createSupabaseAdminClient();
  return client.rpc("archive_warfront_company_api", {
    p_company_id: input.companyId,
    p_actor_clerk_user_id: input.actorClerkUserId,
  });
}

export async function callInviteWarfrontCompanyPlayer(
  input: InviteCompanyPlayerRpcInput
): Promise<WarfrontRpcResponse> {
  const client = createSupabaseAdminClient();
  return client.rpc("invite_warfront_company_player_api", {
    p_company_id: input.companyId,
    p_actor_clerk_user_id: input.actorClerkUserId,
    p_recipient_player_id: input.recipientPlayerId,
  });
}

export async function callAcceptWarfrontCompanyInvitation(
  input: InvitationActorRpcInput
): Promise<WarfrontRpcResponse> {
  const client = createSupabaseAdminClient();
  return client.rpc("accept_warfront_company_invitation_api", {
    p_invitation_id: input.invitationId,
    p_actor_clerk_user_id: input.actorClerkUserId,
  });
}

export async function callDeclineWarfrontCompanyInvitation(
  input: InvitationActorRpcInput
): Promise<WarfrontRpcResponse> {
  const client = createSupabaseAdminClient();
  return client.rpc("decline_warfront_company_invitation_api", {
    p_invitation_id: input.invitationId,
    p_actor_clerk_user_id: input.actorClerkUserId,
  });
}

export async function callRevokeWarfrontCompanyInvitation(
  input: InvitationActorRpcInput
): Promise<WarfrontRpcResponse> {
  const client = createSupabaseAdminClient();
  return client.rpc("revoke_warfront_company_invitation_api", {
    p_invitation_id: input.invitationId,
    p_actor_clerk_user_id: input.actorClerkUserId,
  });
}

export async function callCancelWarfrontOpenOperation(
  input: OperationActorRpcInput
): Promise<WarfrontRpcResponse> {
  const client = createSupabaseAdminClient();
  return client.rpc("cancel_warfront_open_operation_api", {
    p_operation_id: input.operationId,
    p_actor_clerk_user_id: input.actorClerkUserId,
  });
}

export async function callIssueWarfrontOperation(
  input: IssueOperationRpcInput
): Promise<WarfrontRpcResponse> {
  const client = createSupabaseAdminClient();
  return client.rpc("issue_warfront_operation_api", {
    p_actor_clerk_user_id: input.actorClerkUserId,
    p_format: input.format,
    p_series_best_of: input.seriesBestOf,
    p_challenger_player_ids: input.challengerPlayerIds,
    p_region: input.region,
    p_notes: input.notes,
  });
}

export async function callAcceptWarfrontOperation(
  input: AcceptOperationRpcInput
): Promise<WarfrontRpcResponse> {
  const client = createSupabaseAdminClient();
  return client.rpc("accept_warfront_operation_api", {
    p_operation_id: input.operationId,
    p_actor_clerk_user_id: input.actorClerkUserId,
    p_opponent_player_ids: input.opponentPlayerIds,
  });
}

export async function callSubmitWarfrontOperationResult(
  input: SubmitOperationResultRpcInput
): Promise<WarfrontRpcResponse> {
  const client = createSupabaseAdminClient();
  return client.rpc("submit_warfront_operation_result_api", {
    p_operation_id: input.operationId,
    p_actor_clerk_user_id: input.actorClerkUserId,
    p_client_submission_id: input.clientSubmissionId,
    p_challenger_wins: input.challengerWins,
    p_opponent_wins: input.opponentWins,
  });
}

export async function callConfirmWarfrontOperationResult(
  input: OperationActorRpcInput
): Promise<WarfrontRpcResponse> {
  const client = createSupabaseAdminClient();
  return client.rpc("confirm_warfront_operation_result_api", {
    p_operation_id: input.operationId,
    p_actor_clerk_user_id: input.actorClerkUserId,
  });
}

export async function callDisputeWarfrontOperationResult(
  input: OperationActorRpcInput
): Promise<WarfrontRpcResponse> {
  const client = createSupabaseAdminClient();
  return client.rpc("dispute_warfront_operation_result_api", {
    p_operation_id: input.operationId,
    p_actor_clerk_user_id: input.actorClerkUserId,
  });
}
