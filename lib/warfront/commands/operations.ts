import "server-only";

import { randomUUID } from "node:crypto";
import type {
  AcceptWarfrontOperationInput,
  AcceptWarfrontOperationOutput,
  CancelWarfrontOpenOperationInput,
  CancelWarfrontOpenOperationOutput,
  CommandResult,
  ConfirmWarfrontOperationResultInput,
  ConfirmWarfrontOperationResultOutput,
  DisputeWarfrontOperationResultInput,
  DisputeWarfrontOperationResultOutput,
  IssueWarfrontOperationInput,
  IssueWarfrontOperationOutput,
  SubmitWarfrontOperationResultInput,
  SubmitWarfrontOperationResultOutput,
  WarfrontOperationFormat,
  WarfrontOperationResultState,
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
  callAcceptWarfrontOperation,
  callCancelWarfrontOpenOperation,
  callConfirmWarfrontOperationResult,
  callDisputeWarfrontOperationResult,
  callIssueWarfrontOperation,
  callSubmitWarfrontOperationResult,
  type WarfrontRpcResponse,
} from "@/lib/warfront/server/client";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SMALLINT_MINIMUM = -32768;
const SMALLINT_MAXIMUM = 32767;
const MAX_ROSTER_SELECTORS = 4;

export async function issueWarfrontOperation(
  input: IssueWarfrontOperationInput
): Promise<CommandResult<IssueWarfrontOperationOutput>> {
  return executeOperationCommand(
    input,
    parseIssueWarfrontOperationInput,
    "issue_operation",
    (actorClerkUserId, parsed) =>
      callIssueWarfrontOperation({ actorClerkUserId, ...parsed }),
    parseIssueWarfrontOperationOutput
  );
}

export async function acceptWarfrontOperation(
  input: AcceptWarfrontOperationInput
): Promise<CommandResult<AcceptWarfrontOperationOutput>> {
  return executeOperationCommand(
    input,
    parseAcceptWarfrontOperationInput,
    "accept_operation",
    (actorClerkUserId, parsed) =>
      callAcceptWarfrontOperation({ actorClerkUserId, ...parsed }),
    parseAcceptWarfrontOperationOutput
  );
}

export async function cancelWarfrontOpenOperation(
  input: CancelWarfrontOpenOperationInput
): Promise<CommandResult<CancelWarfrontOpenOperationOutput>> {
  return executeOperationCommand(
    input,
    parseOperationIdInput,
    "cancel_open_operation",
    (actorClerkUserId, parsed) =>
      callCancelWarfrontOpenOperation({
        operationId: parsed.operationId,
        actorClerkUserId,
      }),
    parseCancelWarfrontOpenOperationOutput
  );
}

export async function submitWarfrontOperationResult(
  input: SubmitWarfrontOperationResultInput
): Promise<CommandResult<SubmitWarfrontOperationResultOutput>> {
  return executeOperationCommand(
    input,
    parseSubmitWarfrontOperationResultInput,
    "submit_operation_result",
    (actorClerkUserId, parsed) =>
      callSubmitWarfrontOperationResult({ actorClerkUserId, ...parsed }),
    parseSubmitWarfrontOperationResultOutput
  );
}

export async function confirmWarfrontOperationResult(
  input: ConfirmWarfrontOperationResultInput
): Promise<CommandResult<ConfirmWarfrontOperationResultOutput>> {
  return executeOperationCommand(
    input,
    parseOperationIdInput,
    "confirm_operation_result",
    (actorClerkUserId, parsed) =>
      callConfirmWarfrontOperationResult({
        operationId: parsed.operationId,
        actorClerkUserId,
      }),
    parseConfirmWarfrontOperationResultOutput
  );
}

export async function disputeWarfrontOperationResult(
  input: DisputeWarfrontOperationResultInput
): Promise<CommandResult<DisputeWarfrontOperationResultOutput>> {
  return executeOperationCommand(
    input,
    parseOperationIdInput,
    "dispute_operation_result",
    (actorClerkUserId, parsed) =>
      callDisputeWarfrontOperationResult({
        operationId: parsed.operationId,
        actorClerkUserId,
      }),
    parseDisputeWarfrontOperationResultOutput
  );
}

async function executeOperationCommand<TInput, TOutput>(
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

function parseOperationIdInput(
  value: unknown
): { operationId: string } | null {
  return isRecord(value) && hasOnlyFields(value, ["operationId"]) && isUuid(value.operationId)
    ? { operationId: value.operationId }
    : null;
}

function parseSubmitWarfrontOperationResultInput(
  value: unknown
): SubmitWarfrontOperationResultInput | null {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, [
      "operationId",
      "clientSubmissionId",
      "challengerWins",
      "opponentWins",
    ]) ||
    !isUuid(value.operationId) ||
    !isUuid(value.clientSubmissionId) ||
    !isSmallint(value.challengerWins) ||
    !isSmallint(value.opponentWins)
  ) {
    return null;
  }

  return {
    operationId: value.operationId,
    clientSubmissionId: value.clientSubmissionId,
    challengerWins: value.challengerWins,
    opponentWins: value.opponentWins,
  };
}

function parseIssueWarfrontOperationInput(
  value: unknown
): IssueWarfrontOperationInput | null {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, [
      "format",
      "seriesBestOf",
      "challengerPlayerIds",
      "region",
      "notes",
    ]) ||
    !isWarfrontOperationFormat(value.format) ||
    !isSmallint(value.seriesBestOf) ||
    !isUuidArray(value.challengerPlayerIds) ||
    !hasOptionalBoundedString(value.region, 80) ||
    !hasOptionalBoundedString(value.notes, 1000)
  ) {
    return null;
  }

  return {
    format: value.format,
    seriesBestOf: value.seriesBestOf,
    challengerPlayerIds: value.challengerPlayerIds,
    region: value.region ?? null,
    notes: value.notes ?? null,
  };
}

function parseAcceptWarfrontOperationInput(
  value: unknown
): AcceptWarfrontOperationInput | null {
  return isRecord(value) &&
    hasOnlyFields(value, ["operationId", "opponentPlayerIds"]) &&
    isUuid(value.operationId) &&
    isUuidArray(value.opponentPlayerIds)
    ? {
        operationId: value.operationId,
        opponentPlayerIds: value.opponentPlayerIds,
      }
    : null;
}

function parseCancelWarfrontOpenOperationOutput(
  value: unknown
): CancelWarfrontOpenOperationOutput | null {
  return isRecord(value) &&
    isUuid(value.operationId) &&
    value.status === "cancelled" &&
    isTimestamp(value.cancelledAt) &&
    typeof value.duplicate === "boolean"
    ? {
        operationId: value.operationId,
        status: value.status,
        cancelledAt: value.cancelledAt,
        duplicate: value.duplicate,
      }
    : null;
}

function parseIssueWarfrontOperationOutput(
  value: unknown
): IssueWarfrontOperationOutput | null {
  return isRecord(value) &&
    isUuid(value.operationId) &&
    value.status === "open" &&
    isUuid(value.challengerCompanyId) &&
    isWarfrontOperationFormat(value.format) &&
    isSmallint(value.seriesBestOf) &&
    isFiniteNumber(value.challengerRosterEloSnapshot) &&
    isTimestamp(value.openedAt) &&
    isTimestamp(value.expiresAt)
    ? {
        operationId: value.operationId,
        status: value.status,
        challengerCompanyId: value.challengerCompanyId,
        format: value.format,
        seriesBestOf: value.seriesBestOf,
        challengerRosterEloSnapshot: value.challengerRosterEloSnapshot,
        openedAt: value.openedAt,
        expiresAt: value.expiresAt,
      }
    : null;
}

function parseAcceptWarfrontOperationOutput(
  value: unknown
): AcceptWarfrontOperationOutput | null {
  return isRecord(value) &&
    isUuid(value.operationId) &&
    value.status === "accepted" &&
    isUuid(value.challengerCompanyId) &&
    isUuid(value.opponentCompanyId) &&
    isWarfrontOperationFormat(value.format) &&
    isSmallint(value.seriesBestOf) &&
    isFiniteNumber(value.challengerRosterEloSnapshot) &&
    isFiniteNumber(value.opponentRosterEloSnapshot) &&
    isTimestamp(value.acceptedAt) &&
    isTimestamp(value.rosterLockedAt)
    ? {
        operationId: value.operationId,
        status: value.status,
        challengerCompanyId: value.challengerCompanyId,
        opponentCompanyId: value.opponentCompanyId,
        format: value.format,
        seriesBestOf: value.seriesBestOf,
        challengerRosterEloSnapshot: value.challengerRosterEloSnapshot,
        opponentRosterEloSnapshot: value.opponentRosterEloSnapshot,
        acceptedAt: value.acceptedAt,
        rosterLockedAt: value.rosterLockedAt,
      }
    : null;
}

function parseSubmitWarfrontOperationResultOutput(
  value: unknown
): SubmitWarfrontOperationResultOutput | null {
  const result = isRecord(value) ? parseWarfrontOperationResultState(value.result) : null;
  return result && isRecord(value) && typeof value.duplicate === "boolean"
    ? { result, duplicate: value.duplicate }
    : null;
}

function parseConfirmWarfrontOperationResultOutput(
  value: unknown
): ConfirmWarfrontOperationResultOutput | null {
  const result = isRecord(value) ? parseWarfrontOperationResultState(value.result) : null;
  if (!result || !isRecord(value)) return null;

  if (value.confirmed === true && !hasOtherOutcome(value, ["confirmed"])) {
    return { result, outcome: "confirmed" };
  }
  if (
    value.alreadyConfirmed === true &&
    !hasOtherOutcome(value, ["alreadyConfirmed"])
  ) {
    return { result, outcome: "already_confirmed" };
  }
  if (
    value.alreadyFinalized === true &&
    !hasOtherOutcome(value, ["alreadyFinalized"])
  ) {
    return { result, outcome: "already_finalized" };
  }
  return null;
}

function parseDisputeWarfrontOperationResultOutput(
  value: unknown
): DisputeWarfrontOperationResultOutput | null {
  const result = isRecord(value) ? parseWarfrontOperationResultState(value.result) : null;
  if (!result || !isRecord(value)) return null;

  if (value.disputed === true && !hasOtherOutcome(value, ["disputed"])) {
    return { result, outcome: "disputed" };
  }
  if (
    value.alreadyFinalized === true &&
    !hasOtherOutcome(value, ["alreadyFinalized"])
  ) {
    return { result, outcome: "already_finalized" };
  }
  return null;
}

function parseWarfrontOperationResultState(
  value: unknown
): WarfrontOperationResultState | null {
  if (!isRecord(value) || !isUuid(value.operationId) || !hasBoundedString(value.operationStatus, 1, 80)) {
    return null;
  }

  const submittedResult = value.submittedResult;
  if (
    !isRecord(submittedResult) ||
    !isSmallint(submittedResult.challengerWins) ||
    !isSmallint(submittedResult.opponentWins) ||
    !hasBoundedString(submittedResult.winnerSide, 1, 32) ||
    typeof value.disputed !== "boolean"
  ) {
    return null;
  }

  return {
    operationId: value.operationId,
    operationStatus: value.operationStatus,
    submittedResult: {
      challengerWins: submittedResult.challengerWins,
      opponentWins: submittedResult.opponentWins,
      winnerSide: submittedResult.winnerSide,
    },
    disputed: value.disputed,
  };
}

function hasOtherOutcome(value: Record<string, unknown>, allowed: string[]) {
  return ["confirmed", "alreadyConfirmed", "alreadyFinalized", "disputed"].some(
    (key) => key !== allowed[0] && value[key] === true
  );
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

function isSmallint(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= SMALLINT_MINIMUM &&
    value <= SMALLINT_MAXIMUM
  );
}

function isUuidArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= MAX_ROSTER_SELECTORS &&
    value.every(isUuid)
  );
}

function hasOptionalBoundedString(
  value: unknown,
  maximum: number
): value is string | null | undefined {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim().length > 0 && value.length <= maximum)
  );
}

function isWarfrontOperationFormat(
  value: unknown
): value is WarfrontOperationFormat {
  return value === "2v2" || value === "3v3" || value === "4v4";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasBoundedString(
  value: unknown,
  minimum: number,
  maximum: number
): value is string {
  return (
    typeof value === "string" &&
    value.length >= minimum &&
    value.length <= maximum
  );
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
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
