import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  BadgeAuthorityError,
  evaluateMatchBadgeAwardsForMatch,
  evaluateProfileBadgeAwards,
  evaluateTournamentBadgeAwardsForMatch,
} from "@/lib/badges/authority";
import {
  enqueueBadgeReconciliationTarget,
  type BadgeReconciliationReason,
} from "@/lib/badges/reconciliation";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type BadgeIntegrationClient = Pick<SupabaseClient, "from" | "rpc">;

export async function evaluateProfileBadgesAfterCommit({
  playerId,
  reason,
  supabase = createSupabaseAdminClient(),
}: {
  playerId: string;
  reason: Extract<
    BadgeReconciliationReason,
    "profile_write" | "steam_identity" | "relic_snapshot"
  >;
  supabase?: BadgeIntegrationClient;
}): Promise<void> {
  try {
    await evaluateProfileBadgeAwards({ playerId, supabase });
  } catch (error) {
    logPostCommitFailure("profile", error, reason);
    await enqueueBadgeReconciliationTarget({
      playerId,
      reason,
      sourceType: "profile",
      sourceId: playerId,
      supabase,
    });
  }
}

export async function evaluateMatchBadgesAfterCommit({
  matchId,
  supabase = createSupabaseAdminClient(),
}: {
  matchId: string;
  supabase?: BadgeIntegrationClient;
}): Promise<void> {
  const results = await Promise.allSettled([
    evaluateMatchBadgeAwardsForMatch({ matchId, supabase }),
    evaluateTournamentBadgeAwardsForMatch({ matchId, supabase }),
  ]);
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );

  if (!failure) return;

  logPostCommitFailure("match", failure.reason, "match_finalization");
  await enqueueMatchParticipants({
    matchId,
    reason: "match_finalization",
    supabase,
  });
}

export async function evaluateReportGroupBadgesAfterCommit({
  reportGroupId,
  supabase = createSupabaseAdminClient(),
}: {
  reportGroupId: string;
  supabase?: BadgeIntegrationClient;
}): Promise<void> {
  const matchId = await loadSourceMatchId(
    supabase,
    "match_result_report_groups",
    reportGroupId
  );

  if (!matchId) {
    console.error("Badge post-commit source lookup failed.", {
      operation: "load-report-group-match-for-badges",
      code: "BADGE_SOURCE_MATCH_UNAVAILABLE",
    });
    return;
  }

  await evaluateMatchBadgesAfterCommit({ matchId, supabase });
}

export async function evaluateLegacySubmissionBadgesAfterCommit({
  submissionId,
  supabase = createSupabaseAdminClient(),
}: {
  submissionId: string;
  supabase?: BadgeIntegrationClient;
}): Promise<void> {
  const matchId = await loadSourceMatchId(
    supabase,
    "match_result_submissions",
    submissionId
  );

  if (!matchId) {
    console.error("Badge post-commit source lookup failed.", {
      operation: "load-legacy-submission-match-for-badges",
      code: "BADGE_SOURCE_MATCH_UNAVAILABLE",
    });
    return;
  }

  await evaluateMatchBadgesAfterCommit({ matchId, supabase });
}

async function enqueueMatchParticipants({
  matchId,
  reason,
  supabase,
}: {
  matchId: string;
  reason: Extract<BadgeReconciliationReason, "match_finalization">;
  supabase: BadgeIntegrationClient;
}) {
  let match: unknown;
  let matchError: unknown;

  try {
    const result = await supabase
      .from("tournament_matches")
      .select("player_one_registration_id, player_two_registration_id")
      .eq("id", matchId)
      .maybeSingle();
    match = result.data;
    matchError = result.error;
  } catch (error) {
    logEnqueueSourceFailure("load-match-participants", error);
    return;
  }

  if (matchError || !isRecord(match)) {
    logEnqueueSourceFailure("load-match-participants", matchError);
    return;
  }

  const registrationIds = [
    stringOrNull(match.player_one_registration_id),
    stringOrNull(match.player_two_registration_id),
  ].filter((value): value is string => value !== null);

  if (registrationIds.length === 0) return;

  let registrations: unknown;
  let registrationError: unknown;

  try {
    const result = await supabase
      .from("registrations")
      .select("profile_id")
      .in("id", registrationIds);
    registrations = result.data;
    registrationError = result.error;
  } catch (error) {
    logEnqueueSourceFailure("load-registration-players", error);
    return;
  }

  if (registrationError) {
    logEnqueueSourceFailure("load-registration-players", registrationError);
    return;
  }

  const playerIds = [
    ...new Set(
      rowsOf(registrations)
        .map((row) => stringOrNull(row.profile_id))
        .filter((value): value is string => value !== null)
    ),
  ];

  await Promise.all(
    playerIds.map((playerId) =>
      enqueueBadgeReconciliationTarget({
        playerId,
        reason,
        sourceType: "match",
        sourceId: matchId,
        supabase,
      })
    )
  );
}

async function loadSourceMatchId(
  supabase: BadgeIntegrationClient,
  table: "match_result_report_groups" | "match_result_submissions",
  sourceId: string
) {
  let data: unknown;
  let error: unknown;

  try {
    const result = await supabase
      .from(table)
      .select("match_id")
      .eq("id", sourceId)
      .maybeSingle();
    data = result.data;
    error = result.error;
  } catch {
    return null;
  }

  if (error || !isRecord(data)) return null;
  return stringOrNull(data.match_id);
}

function logPostCommitFailure(
  area: "profile" | "match",
  error: unknown,
  reason: BadgeReconciliationReason
) {
  console.error("Badge post-commit evaluation failed.", {
    operation: `evaluate-${area}-badges-after-commit`,
    code: getErrorCode(error),
    reason,
  });
}

function logEnqueueSourceFailure(operation: string, error: unknown) {
  console.error("Badge reconciliation source lookup failed.", {
    operation,
    code: getErrorCode(error),
  });
}

function getErrorCode(error: unknown) {
  if (error instanceof BadgeAuthorityError) return error.code;
  return isRecord(error) && typeof error.code === "string"
    ? error.code.slice(0, 80)
    : "BADGE_POST_COMMIT_FAILED";
}

function rowsOf(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
