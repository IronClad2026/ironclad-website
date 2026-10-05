import "server-only";

import { randomUUID } from "node:crypto";
import type {
  ArchiveWarfrontCompanyOutput,
  CommandResult,
  CreateWarfrontCompanyInput,
  CreateWarfrontCompanyOutput,
  DemoteWarfrontCompanyOfficerOutput,
  LeaveWarfrontCompanyOutput,
  PromoteWarfrontCompanyMemberOutput,
  RemoveWarfrontCompanyMemberOutput,
  TransferWarfrontCompanyCommanderOutput,
  WarfrontCompanyIdInput,
  WarfrontCompanyMemberInput,
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
  callArchiveWarfrontCompany,
  callDemoteWarfrontCompanyOfficerToMember,
  callLeaveWarfrontCompany,
  callPromoteWarfrontCompanyMemberToOfficer,
  callRemoveWarfrontCompanyMember,
  callTransferWarfrontCompanyCommander,
  invokeCreateWarfrontCompany,
  type WarfrontRpcResponse,
} from "@/lib/warfront/server/client";

const COMPANY_INPUT_FIELDS = new Set([
  "name",
  "tag",
  "slug",
  "description",
  "region",
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ParsedCreateWarfrontCompanyInput = {
  name: string;
  tag: string;
  slug: string;
  description: string | null;
  region: string | null;
};

export async function createWarfrontCompany(
  input: CreateWarfrontCompanyInput
): Promise<CommandResult<CreateWarfrontCompanyOutput>> {
  const correlationId = randomUUID();
  const startedAt = Date.now();
  const context = await createWarfrontActorContext();

  if (!context.ok) {
    return failure(context.error, correlationId);
  }

  const parsedInput = parseCreateWarfrontCompanyInput(input);
  if (!parsedInput) {
    return failure(createWarfrontCommandError("VALIDATION_ERROR"), correlationId);
  }

  const legalError = await requireWarfrontLegalAcceptance();
  if (legalError) {
    return failure(legalError, correlationId);
  }

  try {
    const result = await invokeCreateWarfrontCompany({
      actorClerkUserId: context.context.clerkUserId,
      ...parsedInput,
    });

    if (result.error) {
      const error = normalizeWarfrontCommandError(result.error);
      logCommandFailure("create_company", correlationId, startedAt, error.code);
      return failure(error, correlationId);
    }

    const output = parseCreateWarfrontCompanyOutput(result.data);
    if (!output) {
      const error = createWarfrontCommandError("INTERNAL_ERROR");
      logCommandFailure("create_company", correlationId, startedAt, error.code);
      return failure(error, correlationId);
    }

    return { ok: true, data: output, correlationId };
  } catch (error) {
    const normalized = normalizeWarfrontCommandError(error);
    logCommandFailure("create_company", correlationId, startedAt, normalized.code);
    return failure(normalized, correlationId);
  }
}

export async function leaveWarfrontCompany(
  input: WarfrontCompanyIdInput
): Promise<CommandResult<LeaveWarfrontCompanyOutput>> {
  return executeCompanyCommand(
    input,
    parseCompanyIdInput,
    "leave_company",
    (actorClerkUserId, parsed) =>
      callLeaveWarfrontCompany({ actorClerkUserId, companyId: parsed.companyId }),
    parseLeaveWarfrontCompanyOutput
  );
}

export async function removeWarfrontCompanyMember(
  input: WarfrontCompanyMemberInput
): Promise<CommandResult<RemoveWarfrontCompanyMemberOutput>> {
  return executeCompanyCommand(
    input,
    parseCompanyMemberInput,
    "remove_company_member",
    (actorClerkUserId, parsed) =>
      callRemoveWarfrontCompanyMember({ actorClerkUserId, ...parsed }),
    parseRemoveWarfrontCompanyMemberOutput
  );
}

export async function promoteWarfrontCompanyMemberToOfficer(
  input: WarfrontCompanyMemberInput
): Promise<CommandResult<PromoteWarfrontCompanyMemberOutput>> {
  return executeCompanyCommand(
    input,
    parseCompanyMemberInput,
    "promote_company_member",
    (actorClerkUserId, parsed) =>
      callPromoteWarfrontCompanyMemberToOfficer({ actorClerkUserId, ...parsed }),
    parsePromoteWarfrontCompanyMemberOutput
  );
}

export async function demoteWarfrontCompanyOfficerToMember(
  input: WarfrontCompanyMemberInput
): Promise<CommandResult<DemoteWarfrontCompanyOfficerOutput>> {
  return executeCompanyCommand(
    input,
    parseCompanyMemberInput,
    "demote_company_officer",
    (actorClerkUserId, parsed) =>
      callDemoteWarfrontCompanyOfficerToMember({ actorClerkUserId, ...parsed }),
    parseDemoteWarfrontCompanyOfficerOutput
  );
}

export async function transferWarfrontCompanyCommander(
  input: WarfrontCompanyMemberInput
): Promise<CommandResult<TransferWarfrontCompanyCommanderOutput>> {
  return executeCompanyCommand(
    input,
    parseCompanyMemberInput,
    "transfer_company_commander",
    (actorClerkUserId, parsed) =>
      callTransferWarfrontCompanyCommander({ actorClerkUserId, ...parsed }),
    parseTransferWarfrontCompanyCommanderOutput
  );
}

export async function archiveWarfrontCompany(
  input: WarfrontCompanyIdInput
): Promise<CommandResult<ArchiveWarfrontCompanyOutput>> {
  return executeCompanyCommand(
    input,
    parseCompanyIdInput,
    "archive_company",
    (actorClerkUserId, parsed) =>
      callArchiveWarfrontCompany({ actorClerkUserId, companyId: parsed.companyId }),
    parseArchiveWarfrontCompanyOutput
  );
}

async function executeCompanyCommand<TInput, TOutput>(
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

function parseCreateWarfrontCompanyInput(
  input: unknown
): ParsedCreateWarfrontCompanyInput | null {
  if (!isRecord(input) || !hasOnlyCompanyInputFields(input)) return null;

  if (
    !hasBoundedString(input.name, 2, 80) ||
    !hasBoundedString(input.tag, 2, 12) ||
    !hasBoundedString(input.slug, 2, 80) ||
    !hasOptionalBoundedString(input.description, 1, 1000) ||
    !hasOptionalBoundedString(input.region, 1, 80)
  ) {
    return null;
  }

  return {
    name: input.name,
    tag: input.tag,
    slug: input.slug,
    description: input.description ?? null,
    region: input.region ?? null,
  };
}

function parseCreateWarfrontCompanyOutput(
  value: unknown
): CreateWarfrontCompanyOutput | null {
  if (
    !isRecord(value) ||
    !isUuid(value.companyId) ||
    value.role !== "commander" ||
    !isTimestamp(value.createdAt) ||
    typeof value.duplicate !== "boolean"
  ) {
    return null;
  }

  return {
    companyId: value.companyId,
    role: value.role,
    createdAt: value.createdAt,
    duplicate: value.duplicate,
  };
}

function parseCompanyIdInput(value: unknown): WarfrontCompanyIdInput | null {
  return isRecord(value) && hasOnlyFields(value, ["companyId"]) && isUuid(value.companyId)
    ? { companyId: value.companyId }
    : null;
}

function parseCompanyMemberInput(
  value: unknown
): WarfrontCompanyMemberInput | null {
  return (
    isRecord(value) &&
    hasOnlyFields(value, ["companyId", "targetPlayerId"]) &&
    isUuid(value.companyId) &&
    isUuid(value.targetPlayerId)
  )
    ? { companyId: value.companyId, targetPlayerId: value.targetPlayerId }
    : null;
}

function parseLeaveWarfrontCompanyOutput(
  value: unknown
): LeaveWarfrontCompanyOutput | null {
  return isRecord(value) && isUuid(value.companyId) && isTimestamp(value.leftAt) && typeof value.openOperationCancelled === "boolean"
    ? { companyId: value.companyId, leftAt: value.leftAt, openOperationCancelled: value.openOperationCancelled }
    : null;
}

function parseRemoveWarfrontCompanyMemberOutput(
  value: unknown
): RemoveWarfrontCompanyMemberOutput | null {
  return isRecord(value) && isUuid(value.companyId) && isTimestamp(value.removedAt) && typeof value.openOperationCancelled === "boolean"
    ? { companyId: value.companyId, removedAt: value.removedAt, openOperationCancelled: value.openOperationCancelled }
    : null;
}

function parsePromoteWarfrontCompanyMemberOutput(
  value: unknown
): PromoteWarfrontCompanyMemberOutput | null {
  return isRecord(value) && isUuid(value.companyId) && value.role === "officer" && typeof value.duplicate === "boolean"
    ? { companyId: value.companyId, role: value.role, duplicate: value.duplicate }
    : null;
}

function parseDemoteWarfrontCompanyOfficerOutput(
  value: unknown
): DemoteWarfrontCompanyOfficerOutput | null {
  return isRecord(value) && isUuid(value.companyId) && value.role === "member" && typeof value.duplicate === "boolean"
    ? { companyId: value.companyId, role: value.role, duplicate: value.duplicate }
    : null;
}

function parseTransferWarfrontCompanyCommanderOutput(
  value: unknown
): TransferWarfrontCompanyCommanderOutput | null {
  return isRecord(value) && isUuid(value.companyId) && isTimestamp(value.transferredAt) && typeof value.duplicate === "boolean"
    ? { companyId: value.companyId, transferredAt: value.transferredAt, duplicate: value.duplicate }
    : null;
}

function parseArchiveWarfrontCompanyOutput(
  value: unknown
): ArchiveWarfrontCompanyOutput | null {
  const archivedAt =
    isRecord(value) && value.archivedAt !== undefined
      ? isTimestamp(value.archivedAt)
        ? value.archivedAt
        : null
      : undefined;

  if (
    !isRecord(value) ||
    !isUuid(value.companyId) ||
    value.status !== "archived" ||
    typeof value.duplicate !== "boolean" ||
    archivedAt === null ||
    (!value.duplicate && archivedAt === undefined)
  ) {
    return null;
  }

  const output: ArchiveWarfrontCompanyOutput = {
    companyId: value.companyId,
    status: value.status,
    duplicate: value.duplicate,
  };
  if (archivedAt !== undefined) output.archivedAt = archivedAt;
  return output;
}

function failure(
  error: ReturnType<typeof createWarfrontCommandError>,
  correlationId: string
): CommandResult<never> {
  return { ok: false, error, correlationId };
}

function hasOnlyCompanyInputFields(value: Record<string, unknown>) {
  return Object.keys(value).every((key) => COMPANY_INPUT_FIELDS.has(key));
}

function hasOnlyFields(value: Record<string, unknown>, fields: string[]) {
  return Object.keys(value).every((key) => fields.includes(key));
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

function hasOptionalBoundedString(
  value: unknown,
  minimum: number,
  maximum: number
): value is string | null | undefined {
  return (
    value === undefined ||
    value === null ||
    hasBoundedString(value, minimum, maximum)
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
