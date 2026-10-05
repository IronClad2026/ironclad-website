import "server-only";

import { randomUUID } from "node:crypto";
import type {
  AcceptWarfrontCompanyInvitationOutput,
  CommandResult,
  DeclineWarfrontCompanyInvitationOutput,
  InviteWarfrontCompanyPlayerInput,
  InviteWarfrontCompanyPlayerOutput,
  RevokeWarfrontCompanyInvitationOutput,
  WarfrontInvitationIdInput,
} from "@/lib/warfront/contracts";
import {
  createWarfrontActorContext,
  requireWarfrontLegalAcceptance,
} from "@/lib/warfront/commands/context";
import {
  createWarfrontCommandError,
  normalizeWarfrontCommandError,
} from "@/lib/warfront/commands/errors";
import {
  callAcceptWarfrontCompanyInvitation,
  callDeclineWarfrontCompanyInvitation,
  callInviteWarfrontCompanyPlayer,
  callRevokeWarfrontCompanyInvitation,
  type WarfrontRpcResponse,
} from "@/lib/warfront/server/client";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function inviteWarfrontCompanyPlayer(
  input: InviteWarfrontCompanyPlayerInput
): Promise<CommandResult<InviteWarfrontCompanyPlayerOutput>> {
  return executeInvitationCommand(
    input,
    parseInviteInput,
    "invite_company_player",
    (actorClerkUserId, parsed) =>
      callInviteWarfrontCompanyPlayer({ actorClerkUserId, ...parsed }),
    parseInviteOutput
  );
}

export async function acceptWarfrontCompanyInvitation(
  input: WarfrontInvitationIdInput
): Promise<CommandResult<AcceptWarfrontCompanyInvitationOutput>> {
  return executeInvitationCommand(
    input,
    parseInvitationIdInput,
    "accept_company_invitation",
    (actorClerkUserId, parsed) =>
      callAcceptWarfrontCompanyInvitation({ actorClerkUserId, ...parsed }),
    parseAcceptOutput
  );
}

export async function declineWarfrontCompanyInvitation(
  input: WarfrontInvitationIdInput
): Promise<CommandResult<DeclineWarfrontCompanyInvitationOutput>> {
  return executeInvitationCommand(
    input,
    parseInvitationIdInput,
    "decline_company_invitation",
    (actorClerkUserId, parsed) =>
      callDeclineWarfrontCompanyInvitation({ actorClerkUserId, ...parsed }),
    parseDeclineOutput
  );
}

export async function revokeWarfrontCompanyInvitation(
  input: WarfrontInvitationIdInput
): Promise<CommandResult<RevokeWarfrontCompanyInvitationOutput>> {
  return executeInvitationCommand(
    input,
    parseInvitationIdInput,
    "revoke_company_invitation",
    (actorClerkUserId, parsed) =>
      callRevokeWarfrontCompanyInvitation({ actorClerkUserId, ...parsed }),
    parseRevokeOutput
  );
}

async function executeInvitationCommand<TInput, TOutput>(
  input: unknown,
  parseInput: (value: unknown) => TInput | null,
  command: string,
  invoke: (actorClerkUserId: string, value: TInput) => Promise<WarfrontRpcResponse>,
  parseOutput: (value: unknown) => TOutput | null
): Promise<CommandResult<TOutput>> {
  const correlationId = randomUUID();
  const startedAt = Date.now();
  const context = await createWarfrontActorContext();

  if (!context.ok) return failure(context.error, correlationId);

  const parsedInput = parseInput(input);
  if (!parsedInput) {
    return failure(createWarfrontCommandError("VALIDATION_ERROR"), correlationId);
  }

  const legalError = await requireWarfrontLegalAcceptance();
  if (legalError) return failure(legalError, correlationId);

  try {
    const result = await invoke(context.context.clerkUserId, parsedInput);
    if (result.error) {
      const error = normalizeWarfrontCommandError(result.error);
      logCommandFailure(command, correlationId, startedAt, error.code);
      return failure(error, correlationId);
    }

    const output = parseOutput(result.data);
    if (!output) {
      const error = createWarfrontCommandError("INTERNAL_ERROR");
      logCommandFailure(command, correlationId, startedAt, error.code);
      return failure(error, correlationId);
    }

    return { ok: true, data: output, correlationId };
  } catch (error) {
    const normalized = normalizeWarfrontCommandError(error);
    logCommandFailure(command, correlationId, startedAt, normalized.code);
    return failure(normalized, correlationId);
  }
}

function parseInviteInput(
  value: unknown
): InviteWarfrontCompanyPlayerInput | null {
  return (
    isRecord(value) &&
    hasOnlyFields(value, ["companyId", "recipientPlayerId"]) &&
    isUuid(value.companyId) &&
    isUuid(value.recipientPlayerId)
  )
    ? { companyId: value.companyId, recipientPlayerId: value.recipientPlayerId }
    : null;
}

function parseInvitationIdInput(
  value: unknown
): WarfrontInvitationIdInput | null {
  return (
    isRecord(value) &&
    hasOnlyFields(value, ["invitationId"]) &&
    isUuid(value.invitationId)
  )
    ? { invitationId: value.invitationId }
    : null;
}

function parseInviteOutput(
  value: unknown
): InviteWarfrontCompanyPlayerOutput | null {
  return (
    isRecord(value) &&
    isUuid(value.invitationId) &&
    isUuid(value.companyId) &&
    value.status === "pending" &&
    typeof value.duplicate === "boolean"
  )
    ? {
        invitationId: value.invitationId,
        companyId: value.companyId,
        status: value.status,
        duplicate: value.duplicate,
      }
    : null;
}

function parseAcceptOutput(
  value: unknown
): AcceptWarfrontCompanyInvitationOutput | null {
  return (
    isRecord(value) &&
    isUuid(value.invitationId) &&
    isUuid(value.companyId) &&
    value.status === "accepted" &&
    typeof value.duplicate === "boolean"
  )
    ? {
        invitationId: value.invitationId,
        companyId: value.companyId,
        status: value.status,
        duplicate: value.duplicate,
      }
    : null;
}

function parseDeclineOutput(
  value: unknown
): DeclineWarfrontCompanyInvitationOutput | null {
  return (
    isRecord(value) &&
    isUuid(value.invitationId) &&
    value.status === "declined" &&
    typeof value.duplicate === "boolean"
  )
    ? {
        invitationId: value.invitationId,
        status: value.status,
        duplicate: value.duplicate,
      }
    : null;
}

function parseRevokeOutput(
  value: unknown
): RevokeWarfrontCompanyInvitationOutput | null {
  return (
    isRecord(value) &&
    isUuid(value.invitationId) &&
    value.status === "invalidated" &&
    typeof value.duplicate === "boolean"
  )
    ? {
        invitationId: value.invitationId,
        status: value.status,
        duplicate: value.duplicate,
      }
    : null;
}

function failure(
  error: ReturnType<typeof createWarfrontCommandError>,
  correlationId: string
): CommandResult<never> {
  return { ok: false, error, correlationId };
}

function hasOnlyFields(value: Record<string, unknown>, fields: string[]) {
  return Object.keys(value).every((key) => fields.includes(key));
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function logCommandFailure(
  command: string,
  correlationId: string,
  startedAt: number,
  outcome: string
) {
  console.error("WARFRONT command failed.", {
    command,
    correlationId,
    durationMs: Date.now() - startedAt,
    outcome,
  });
}
