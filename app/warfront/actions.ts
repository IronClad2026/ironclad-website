"use server";

import type {
  AcceptWarfrontCompanyInvitationOutput,
  ArchiveWarfrontCompanyOutput,
  CommandResult,
  CreateWarfrontCompanyInput,
  CreateWarfrontCompanyOutput,
  DeclineWarfrontCompanyInvitationOutput,
  DemoteWarfrontCompanyOfficerOutput,
  InviteWarfrontCompanyPlayerInput,
  InviteWarfrontCompanyPlayerOutput,
  LeaveWarfrontCompanyOutput,
  PromoteWarfrontCompanyMemberOutput,
  RemoveWarfrontCompanyMemberOutput,
  RevokeWarfrontCompanyInvitationOutput,
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
