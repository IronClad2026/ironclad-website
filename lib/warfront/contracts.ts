export type WarfrontCommandErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "LEGAL_REQUIRED"
  | "LEGAL_UNAVAILABLE"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "NOT_AVAILABLE"
  | "LIFECYCLE_CONFLICT"
  | "CONCURRENCY_CONFLICT"
  | "INTERNAL_ERROR";

export type WarfrontCommandError = {
  code: WarfrontCommandErrorCode;
  message: string;
  retryable: boolean;
};

export type CommandResult<T> =
  | {
      ok: true;
      data: T;
      correlationId: string;
    }
  | {
      ok: false;
      error: WarfrontCommandError;
      correlationId: string;
    };

export type CreateWarfrontCompanyInput = {
  name: string;
  tag: string;
  slug: string;
  description?: string | null;
  region?: string | null;
};

export type CreateWarfrontCompanyOutput = {
  companyId: string;
  role: "commander";
  createdAt: string;
  duplicate: boolean;
};

export type WarfrontCompanyIdInput = {
  companyId: string;
};

export type WarfrontCompanyMemberInput = {
  companyId: string;
  targetPlayerId: string;
};

export type WarfrontInvitationIdInput = {
  invitationId: string;
};

export type InviteWarfrontCompanyPlayerInput = {
  companyId: string;
  recipientPlayerId: string;
};

export type LeaveWarfrontCompanyOutput = {
  companyId: string;
  leftAt: string;
  openOperationCancelled: boolean;
};

export type RemoveWarfrontCompanyMemberOutput = {
  companyId: string;
  removedAt: string;
  openOperationCancelled: boolean;
};

export type PromoteWarfrontCompanyMemberOutput = {
  companyId: string;
  role: "officer";
  duplicate: boolean;
};

export type DemoteWarfrontCompanyOfficerOutput = {
  companyId: string;
  role: "member";
  duplicate: boolean;
};

export type TransferWarfrontCompanyCommanderOutput = {
  companyId: string;
  transferredAt: string;
  duplicate: boolean;
};

export type ArchiveWarfrontCompanyOutput = {
  companyId: string;
  status: "archived";
  archivedAt?: string;
  duplicate: boolean;
};

export type InviteWarfrontCompanyPlayerOutput = {
  invitationId: string;
  companyId: string;
  status: "pending";
  duplicate: boolean;
};

export type AcceptWarfrontCompanyInvitationOutput = {
  invitationId: string;
  companyId: string;
  status: "accepted";
  duplicate: boolean;
};

export type DeclineWarfrontCompanyInvitationOutput = {
  invitationId: string;
  status: "declined";
  duplicate: boolean;
};

export type RevokeWarfrontCompanyInvitationOutput = {
  invitationId: string;
  status: "invalidated";
  duplicate: boolean;
};
