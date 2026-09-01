import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  BadgeAuthorityError,
  evaluateAllBadgeAwardsForPlayer,
} from "@/lib/badges/authority";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const BADGE_RECONCILIATION_CLAIM_LIMIT = 25;
export const BADGE_RECONCILIATION_MAX_CLAIM_LIMIT = 50;

export const BADGE_RECONCILIATION_REASONS = [
  "profile_write",
  "steam_identity",
  "relic_snapshot",
  "match_finalization",
  "match_authority",
  "tournament_completion",
  "leaderboard_recalculation",
  "season_finalization",
  "evaluation_failure",
  "manual_recovery",
] as const;

export type BadgeReconciliationReason =
  (typeof BADGE_RECONCILIATION_REASONS)[number];

export type BadgeReconciliationSourceType =
  | "profile"
  | "match"
  | "tournament"
  | "season"
  | "system";

type BadgeReconciliationClient = Pick<SupabaseClient, "from" | "rpc">;

type ClaimedBadgeReconciliationTarget = {
  targetId: string;
  playerId: string;
  claimToken: string;
  reason: string;
  sourceType: string | null;
  sourceId: string | null;
  attemptCount: number;
};

export type BadgeReconciliationWorkerResult = {
  claimed: number;
  completed: number;
  retryableFailures: number;
  completionFailures: number;
};

export class BadgeReconciliationWorkerError extends Error {
  readonly code:
    | "BADGE_RECONCILIATION_CLAIM_FAILED"
    | "BADGE_RECONCILIATION_CLAIM_INVALID";

  constructor(code: BadgeReconciliationWorkerError["code"]) {
    super("Badge reconciliation worker database operation failed.");
    this.name = "BadgeReconciliationWorkerError";
    this.code = code;
  }
}

export async function enqueueBadgeReconciliationTarget({
  playerId,
  reason,
  sourceType = null,
  sourceId = null,
  supabase = createSupabaseAdminClient(),
}: {
  playerId: string;
  reason: BadgeReconciliationReason;
  sourceType?: BadgeReconciliationSourceType | null;
  sourceId?: string | null;
  supabase?: BadgeReconciliationClient;
}): Promise<boolean> {
  let error: unknown;

  try {
    ({ error } = await supabase.rpc("enqueue_badge_reconciliation_target", {
      p_player_id: playerId,
      p_reason: reason,
      p_source_type: sourceType,
      p_source_id: sourceId,
    }));
  } catch (caught) {
    error = caught;
  }

  if (error) {
    console.error("Badge reconciliation enqueue failed.", {
      operation: "enqueue-badge-reconciliation",
      code: getErrorCode(error),
      reason,
    });
    return false;
  }

  return true;
}

export async function runBadgeReconciliationWorker({
  limit = BADGE_RECONCILIATION_CLAIM_LIMIT,
  supabase = createSupabaseAdminClient(),
}: {
  limit?: number;
  supabase?: BadgeReconciliationClient;
} = {}): Promise<BadgeReconciliationWorkerResult> {
  const boundedLimit = Math.max(
    1,
    Math.min(
      Number.isInteger(limit) ? limit : BADGE_RECONCILIATION_CLAIM_LIMIT,
      BADGE_RECONCILIATION_MAX_CLAIM_LIMIT
    )
  );
  const { data, error } = await supabase.rpc(
    "claim_badge_reconciliation_targets",
    { p_limit: boundedLimit }
  );

  if (error) {
    throw new BadgeReconciliationWorkerError(
      "BADGE_RECONCILIATION_CLAIM_FAILED"
    );
  }

  const targets = parseClaimedTargets(data);
  if (!targets) {
    throw new BadgeReconciliationWorkerError(
      "BADGE_RECONCILIATION_CLAIM_INVALID"
    );
  }

  const outcomes = await mapWithConcurrency(targets, 3, (target) =>
    processClaimedTarget(supabase, target)
  );

  return {
    claimed: targets.length,
    completed: outcomes.filter((outcome) => outcome === "completed").length,
    retryableFailures: outcomes.filter(
      (outcome) => outcome === "retryable-failure"
    ).length,
    completionFailures: outcomes.filter(
      (outcome) => outcome === "completion-failure"
    ).length,
  };
}

async function processClaimedTarget(
  supabase: BadgeReconciliationClient,
  target: ClaimedBadgeReconciliationTarget
): Promise<"completed" | "retryable-failure" | "completion-failure"> {
  let succeeded = false;
  let errorCode: string | null = null;

  try {
    await evaluateAllBadgeAwardsForPlayer({
      playerId: target.playerId,
      supabase,
      evaluationMode: "reconciliation",
    });
    succeeded = true;
  } catch (error) {
    errorCode = getErrorCode(error);
    console.error("Badge reconciliation evaluation failed.", {
      operation: "evaluate-badge-reconciliation-target",
      code: errorCode,
      reason: target.reason,
      attemptCount: target.attemptCount,
    });
  }

  const { data, error } = await supabase.rpc(
    "complete_badge_reconciliation_target",
    {
      p_target_id: target.targetId,
      p_claim_token: target.claimToken,
      p_succeeded: succeeded,
      p_error_code: errorCode,
    }
  );

  if (error || data !== true) {
    console.error("Badge reconciliation completion failed.", {
      operation: "complete-badge-reconciliation-target",
      code: getErrorCode(error),
    });
    return "completion-failure";
  }

  return succeeded ? "completed" : "retryable-failure";
}

function parseClaimedTargets(
  value: unknown
): ClaimedBadgeReconciliationTarget[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const parsed = value.map(parseClaimedTarget);
  return parsed.every(
    (target): target is ClaimedBadgeReconciliationTarget => target !== null
  )
    ? parsed
    : null;
}

function parseClaimedTarget(
  value: unknown
): ClaimedBadgeReconciliationTarget | null {
  if (!isRecord(value)) return null;

  const targetId = stringOrNull(value.target_id);
  const playerId = stringOrNull(value.player_id);
  const claimToken = stringOrNull(value.claim_token);
  const reason = stringOrNull(value.reason);
  const sourceType = nullableString(value.source_type);
  const sourceId = nullableString(value.source_id);
  const attemptCount = integerOrNull(value.attempt_count);

  if (
    !targetId ||
    !playerId ||
    !claimToken ||
    !reason ||
    sourceType === undefined ||
    sourceId === undefined ||
    attemptCount === null ||
    attemptCount < 1
  ) {
    return null;
  }

  return {
    targetId,
    playerId,
    claimToken,
    reason,
    sourceType,
    sourceId,
    attemptCount,
  };
}

async function mapWithConcurrency<T, U>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<U>
): Promise<U[]> {
  const results: U[] = [];

  for (let index = 0; index < values.length; index += concurrency) {
    results.push(
      ...(await Promise.all(
        values.slice(index, index + concurrency).map(mapper)
      ))
    );
  }

  return results;
}

function getErrorCode(error: unknown) {
  if (error instanceof BadgeAuthorityError) {
    return error.code;
  }

  if (isRecord(error) && typeof error.code === "string") {
    return error.code.slice(0, 80);
  }

  return "BADGE_RECONCILIATION_FAILED";
}

function nullableString(value: unknown): string | null | undefined {
  return value === null ? null : stringOrNull(value) ?? undefined;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function integerOrNull(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
