import "server-only";

import { randomUUID } from "node:crypto";
import type {
  CommandResult,
  CreateWarfrontCompanyInput,
  CreateWarfrontCompanyOutput,
} from "@/lib/warfront/contracts";
import {
  createWarfrontActorContext,
  requireWarfrontLegalAcceptance,
} from "@/lib/warfront/commands/context";
import {
  createWarfrontCommandError,
  normalizeWarfrontCommandError,
} from "@/lib/warfront/commands/errors";
import { invokeCreateWarfrontCompany } from "@/lib/warfront/server/client";

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
      logCommandFailure(correlationId, startedAt, error.code);
      return failure(error, correlationId);
    }

    const output = parseCreateWarfrontCompanyOutput(result.data);
    if (!output) {
      const error = createWarfrontCommandError("INTERNAL_ERROR");
      logCommandFailure(correlationId, startedAt, error.code);
      return failure(error, correlationId);
    }

    return { ok: true, data: output, correlationId };
  } catch (error) {
    const normalized = normalizeWarfrontCommandError(error);
    logCommandFailure(correlationId, startedAt, normalized.code);
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

function failure(
  error: ReturnType<typeof createWarfrontCommandError>,
  correlationId: string
): CommandResult<never> {
  return { ok: false, error, correlationId };
}

function hasOnlyCompanyInputFields(value: Record<string, unknown>) {
  return Object.keys(value).every((key) => COMPANY_INPUT_FIELDS.has(key));
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
  correlationId: string,
  startedAt: number,
  outcome: string
) {
  console.error("WARFRONT command failed.", {
    command: "create_company",
    correlationId,
    durationMs: Date.now() - startedAt,
    outcome,
  });
}
