"use server";

import type {
  AcceptWarfrontOperationInput,
  AcceptWarfrontOperationOutput,
  AcceptWarfrontCompanyInvitationOutput,
  ArchiveWarfrontCompanyOutput,
  CancelWarfrontOpenOperationInput,
  CancelWarfrontOpenOperationOutput,
  CommandResult,
  ConfirmWarfrontOperationResultInput,
  ConfirmWarfrontOperationResultOutput,
  CreateWarfrontCompanyInput,
  CreateWarfrontCompanyOutput,
  DeclineWarfrontCompanyInvitationOutput,
  DemoteWarfrontCompanyOfficerOutput,
  DisputeWarfrontOperationResultInput,
  DisputeWarfrontOperationResultOutput,
  InviteWarfrontCompanyPlayerInput,
  InviteWarfrontCompanyPlayerOutput,
  IssueWarfrontOperationInput,
  IssueWarfrontOperationOutput,
  LeaveWarfrontCompanyOutput,
  PromoteWarfrontCompanyMemberOutput,
  RemoveWarfrontCompanyMemberOutput,
  RevokeWarfrontCompanyInvitationOutput,
  SubmitWarfrontOperationResultInput,
  SubmitWarfrontOperationResultOutput,
  TransferWarfrontCompanyCommanderOutput,
  WarfrontCompanyIdInput,
  WarfrontCompanyMemberInput,
  WarfrontInvitationIdInput,
} from "@/lib/warfront/contracts";
import {
  archiveWarfrontCompany,
  createWarfrontCompany,
  demoteWarfrontCompanyOfficerToMember,
  leaveWarfrontCompany,
  promoteWarfrontCompanyMemberToOfficer,
  removeWarfrontCompanyMember,
  transferWarfrontCompanyCommander,
} from "@/lib/warfront/commands/company";
import {
  acceptWarfrontCompanyInvitation,
  declineWarfrontCompanyInvitation,
  inviteWarfrontCompanyPlayer,
  revokeWarfrontCompanyInvitation,
} from "@/lib/warfront/commands/invitations";
import {
  acceptWarfrontOperation,
  cancelWarfrontOpenOperation,
  confirmWarfrontOperationResult,
  disputeWarfrontOperationResult,
  issueWarfrontOperation,
  submitWarfrontOperationResult,
} from "@/lib/warfront/commands/operations";

export async function createWarfrontCompanyAction(
  input: CreateWarfrontCompanyInput
): Promise<CommandResult<CreateWarfrontCompanyOutput>> {
  return createWarfrontCompany(input);
}

export async function leaveWarfrontCompanyAction(
  input: WarfrontCompanyIdInput
): Promise<CommandResult<LeaveWarfrontCompanyOutput>> {
  return leaveWarfrontCompany(input);
}

export async function removeWarfrontCompanyMemberAction(
  input: WarfrontCompanyMemberInput
): Promise<CommandResult<RemoveWarfrontCompanyMemberOutput>> {
  return removeWarfrontCompanyMember(input);
}

export async function promoteWarfrontCompanyMemberToOfficerAction(
  input: WarfrontCompanyMemberInput
): Promise<CommandResult<PromoteWarfrontCompanyMemberOutput>> {
  return promoteWarfrontCompanyMemberToOfficer(input);
}

export async function demoteWarfrontCompanyOfficerToMemberAction(
  input: WarfrontCompanyMemberInput
): Promise<CommandResult<DemoteWarfrontCompanyOfficerOutput>> {
  return demoteWarfrontCompanyOfficerToMember(input);
}

export async function transferWarfrontCompanyCommanderAction(
  input: WarfrontCompanyMemberInput
): Promise<CommandResult<TransferWarfrontCompanyCommanderOutput>> {
  return transferWarfrontCompanyCommander(input);
}

export async function archiveWarfrontCompanyAction(
  input: WarfrontCompanyIdInput
): Promise<CommandResult<ArchiveWarfrontCompanyOutput>> {
  return archiveWarfrontCompany(input);
}

export async function inviteWarfrontCompanyPlayerAction(
  input: InviteWarfrontCompanyPlayerInput
): Promise<CommandResult<InviteWarfrontCompanyPlayerOutput>> {
  return inviteWarfrontCompanyPlayer(input);
}

export async function acceptWarfrontCompanyInvitationAction(
  input: WarfrontInvitationIdInput
): Promise<CommandResult<AcceptWarfrontCompanyInvitationOutput>> {
  return acceptWarfrontCompanyInvitation(input);
}

export async function declineWarfrontCompanyInvitationAction(
  input: WarfrontInvitationIdInput
): Promise<CommandResult<DeclineWarfrontCompanyInvitationOutput>> {
  return declineWarfrontCompanyInvitation(input);
}

export async function revokeWarfrontCompanyInvitationAction(
  input: WarfrontInvitationIdInput
): Promise<CommandResult<RevokeWarfrontCompanyInvitationOutput>> {
  return revokeWarfrontCompanyInvitation(input);
}

export async function cancelWarfrontOpenOperationAction(
  input: CancelWarfrontOpenOperationInput
): Promise<CommandResult<CancelWarfrontOpenOperationOutput>> {
  return cancelWarfrontOpenOperation(input);
}

export async function issueWarfrontOperationAction(
  input: IssueWarfrontOperationInput
): Promise<CommandResult<IssueWarfrontOperationOutput>> {
  return issueWarfrontOperation(input);
}

export async function acceptWarfrontOperationAction(
  input: AcceptWarfrontOperationInput
): Promise<CommandResult<AcceptWarfrontOperationOutput>> {
  return acceptWarfrontOperation(input);
}

export async function submitWarfrontOperationResultAction(
  input: SubmitWarfrontOperationResultInput
): Promise<CommandResult<SubmitWarfrontOperationResultOutput>> {
  return submitWarfrontOperationResult(input);
}

export async function confirmWarfrontOperationResultAction(
  input: ConfirmWarfrontOperationResultInput
): Promise<CommandResult<ConfirmWarfrontOperationResultOutput>> {
  return confirmWarfrontOperationResult(input);
}

export async function disputeWarfrontOperationResultAction(
  input: DisputeWarfrontOperationResultInput
): Promise<CommandResult<DisputeWarfrontOperationResultOutput>> {
  return disputeWarfrontOperationResult(input);
}
