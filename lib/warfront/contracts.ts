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

export type CancelWarfrontOpenOperationInput = {
  operationId: string;
};

export type WarfrontOperationFormat = "2v2" | "3v3" | "4v4";

export type IssueWarfrontOperationInput = {
  format: WarfrontOperationFormat;
  seriesBestOf: number;
  challengerPlayerIds: string[];
  region?: string | null;
  notes?: string | null;
};

export type AcceptWarfrontOperationInput = {
  operationId: string;
  opponentPlayerIds: string[];
};

export type SubmitWarfrontOperationResultInput = {
  operationId: string;
  clientSubmissionId: string;
  challengerWins: number;
  opponentWins: number;
};

export type ConfirmWarfrontOperationResultInput = {
  operationId: string;
};

export type DisputeWarfrontOperationResultInput = {
  operationId: string;
};

export type CancelWarfrontOpenOperationOutput = {
  operationId: string;
  status: "cancelled";
  cancelledAt: string;
  duplicate: boolean;
};

export type IssueWarfrontOperationOutput = {
  operationId: string;
  status: "open";
  challengerCompanyId: string;
  format: WarfrontOperationFormat;
  seriesBestOf: number;
  challengerRosterEloSnapshot: number;
  openedAt: string;
  expiresAt: string;
};

export type AcceptWarfrontOperationOutput = {
  operationId: string;
  status: "accepted";
  challengerCompanyId: string;
  opponentCompanyId: string;
  format: WarfrontOperationFormat;
  seriesBestOf: number;
  challengerRosterEloSnapshot: number;
  opponentRosterEloSnapshot: number;
  acceptedAt: string;
  rosterLockedAt: string;
};

export type WarfrontOperationSubmittedResult = {
  challengerWins: number;
  opponentWins: number;
  winnerSide: string;
};

export type WarfrontOperationResultState = {
  operationId: string;
  operationStatus: string;
  submittedResult: WarfrontOperationSubmittedResult;
  disputed: boolean;
};

export type SubmitWarfrontOperationResultOutput = {
  result: WarfrontOperationResultState;
  duplicate: boolean;
};

export type ConfirmWarfrontOperationResultOutput = {
  result: WarfrontOperationResultState;
  outcome: "confirmed" | "already_confirmed" | "already_finalized";
};

export type DisputeWarfrontOperationResultOutput = {
  result: WarfrontOperationResultState;
  outcome: "disputed" | "already_finalized";
};
