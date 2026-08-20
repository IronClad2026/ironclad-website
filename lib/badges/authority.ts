import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BadgeSlug } from "@/lib/badges/types";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const PRODUCTION_BADGE_AUTHORITY_SLUGS = [
  "ironclad-recruit",
  "first-deployment",
  "first-victory",
  "battle-tested",
  "first-campaign",
  "iron-regular",
  "tournament-veteran",
  "five-victories",
  "ten-victories",
  "twenty-five-victories",
] as const satisfies readonly BadgeSlug[];

type ProductionBadgeAuthoritySlug =
  (typeof PRODUCTION_BADGE_AUTHORITY_SLUGS)[number];

type BadgeAuthorityClient = Pick<SupabaseClient, "from" | "rpc">;

type BadgeSourceType = "profile" | "match" | "tournament";

type BadgeSourceMetadata = Record<string, string | number | boolean | null>;

type PersistBadgeAwardInput = {
  badgeSlug: ProductionBadgeAuthoritySlug;
  playerId: string;
  sourceType: BadgeSourceType;
  sourceId: string | null;
  originalUnlockedAt: string | null;
  sourceMetadata: BadgeSourceMetadata;
};

export type BadgeAwardEvaluationResult = {
  createdCount: number;
  createdSlugs: ProductionBadgeAuthoritySlug[];
  evaluatedSlugs: ProductionBadgeAuthoritySlug[];
  skippedReasons: string[];
};

export type BadgeBackfillResult = {
  playersEvaluated: number;
  awardsCreated: number;
  badgeCounts: Record<ProductionBadgeAuthoritySlug, number>;
  errors: Array<{
    playerId: string;
    code: string;
  }>;
};

type ProfileBadgePlayerRow = {
  id: unknown;
  profile_completed: unknown;
  steam_id64: unknown;
  current_elo: unknown;
  relic_verified_elo: unknown;
  relic_verified_faction: unknown;
  relic_verified_division: unknown;
  relic_elo_calculation_version: unknown;
  relic_elo_verified_at: unknown;
  updated_at: unknown;
};

type MatchBadgeParticipantRow = {
  player_id: unknown;
};

type MatchBadgeSummaryRow = {
  played_match_count: unknown;
  win_count: unknown;
  first_played_match_id: unknown;
  first_played_at: unknown;
  tenth_played_match_id: unknown;
  tenth_played_at: unknown;
  first_win_match_id: unknown;
  first_win_at: unknown;
  fifth_win_match_id: unknown;
  fifth_win_at: unknown;
  tenth_win_match_id: unknown;
  tenth_win_at: unknown;
  twenty_fifth_win_match_id: unknown;
  twenty_fifth_win_at: unknown;
};

type TournamentBadgeParticipantRow = {
  player_id: unknown;
};

type TournamentBadgeForMatchRow = {
  tournament_id: unknown;
};

type TournamentBadgeSummaryRow = {
  completed_tournament_count: unknown;
  first_completed_tournament_id: unknown;
  first_completed_at: unknown;
  third_completed_tournament_id: unknown;
  third_completed_at: unknown;
  tenth_completed_tournament_id: unknown;
  tenth_completed_at: unknown;
};

type MatchThreshold = {
  badgeSlug: ProductionBadgeAuthoritySlug;
  countKey: "playedMatchCount" | "winCount";
  threshold: number;
  sourceIdKey:
    | "firstPlayedMatchId"
    | "tenthPlayedMatchId"
    | "firstWinMatchId"
    | "fifthWinMatchId"
    | "tenthWinMatchId"
    | "twentyFifthWinMatchId";
  originalUnlockedAtKey:
    | "firstPlayedAt"
    | "tenthPlayedAt"
    | "firstWinAt"
    | "fifthWinAt"
    | "tenthWinAt"
    | "twentyFifthWinAt";
  evaluator: "match-count" | "win-count";
};

type TournamentThreshold = {
  badgeSlug: ProductionBadgeAuthoritySlug;
  threshold: number;
  sourceIdKey:
    | "firstCompletedTournamentId"
    | "thirdCompletedTournamentId"
    | "tenthCompletedTournamentId";
  originalUnlockedAtKey:
    | "firstCompletedAt"
    | "thirdCompletedAt"
    | "tenthCompletedAt";
};

const PROFILE_SELECT = [
  "id",
  "profile_completed",
  "steam_id64",
  "current_elo",
  "relic_verified_elo",
  "relic_verified_faction",
  "relic_verified_division",
  "relic_elo_calculation_version",
  "relic_elo_verified_at",
  "updated_at",
].join(", ");

const MATCH_THRESHOLDS: readonly MatchThreshold[] = [
  {
    badgeSlug: "first-deployment",
    countKey: "playedMatchCount",
    threshold: 1,
    sourceIdKey: "firstPlayedMatchId",
    originalUnlockedAtKey: "firstPlayedAt",
    evaluator: "match-count",
  },
  {
    badgeSlug: "battle-tested",
    countKey: "playedMatchCount",
    threshold: 10,
    sourceIdKey: "tenthPlayedMatchId",
    originalUnlockedAtKey: "tenthPlayedAt",
    evaluator: "match-count",
  },
  {
    badgeSlug: "first-victory",
    countKey: "winCount",
    threshold: 1,
    sourceIdKey: "firstWinMatchId",
    originalUnlockedAtKey: "firstWinAt",
    evaluator: "win-count",
  },
  {
    badgeSlug: "five-victories",
    countKey: "winCount",
    threshold: 5,
    sourceIdKey: "fifthWinMatchId",
    originalUnlockedAtKey: "fifthWinAt",
    evaluator: "win-count",
  },
  {
    badgeSlug: "ten-victories",
    countKey: "winCount",
    threshold: 10,
    sourceIdKey: "tenthWinMatchId",
    originalUnlockedAtKey: "tenthWinAt",
    evaluator: "win-count",
  },
  {
    badgeSlug: "twenty-five-victories",
    countKey: "winCount",
    threshold: 25,
    sourceIdKey: "twentyFifthWinMatchId",
    originalUnlockedAtKey: "twentyFifthWinAt",
    evaluator: "win-count",
  },
];

const TOURNAMENT_THRESHOLDS: readonly TournamentThreshold[] = [
  {
    badgeSlug: "first-campaign",
    threshold: 1,
    sourceIdKey: "firstCompletedTournamentId",
    originalUnlockedAtKey: "firstCompletedAt",
  },
  {
    badgeSlug: "iron-regular",
    threshold: 3,
    sourceIdKey: "thirdCompletedTournamentId",
    originalUnlockedAtKey: "thirdCompletedAt",
  },
  {
    badgeSlug: "tournament-veteran",
    threshold: 10,
    sourceIdKey: "tenthCompletedTournamentId",
    originalUnlockedAtKey: "tenthCompletedAt",
  },
];

const EMPTY_EVALUATION_RESULT: BadgeAwardEvaluationResult = {
  createdCount: 0,
  createdSlugs: [],
  evaluatedSlugs: [],
  skippedReasons: [],
};

export async function evaluateProfileBadgeAwards({
  playerId,
  supabase = createSupabaseAdminClient(),
  evaluationMode = "live",
}: {
  playerId: string;
  supabase?: BadgeAuthorityClient;
  evaluationMode?: "live" | "backfill";
}): Promise<BadgeAwardEvaluationResult> {
  const { data, error } = await supabase
    .from("players")
    .select(PROFILE_SELECT)
    .eq("id", playerId)
    .maybeSingle();

  if (error) {
    throw new BadgeAuthorityError(
      "PROFILE_LOAD_FAILED",
      "Badge profile evaluation could not load the player."
    );
  }

  const player = parseProfileBadgePlayerRow(data);
  if (!player || !isIronCladRecruitQualified(player)) {
    return {
      ...EMPTY_EVALUATION_RESULT,
      evaluatedSlugs: ["ironclad-recruit"],
      skippedReasons: ["profile_not_verified"],
    };
  }

  const originalUnlockedAt = pickLatestIso([
    isoOrNull(player.relic_verified_elo_verified_at),
    isoOrNull(player.updated_at),
  ]);
  const created = await persistBadgeAward(supabase, {
    playerId: player.id,
    badgeSlug: "ironclad-recruit",
    sourceType: "profile",
    sourceId: player.id,
    originalUnlockedAt,
    sourceMetadata: {
      evaluator: "profile-status",
      evaluationMode,
      requirement: "identity-and-elo-verification",
      relicDivision: player.relic_verified_division,
      relicCalculationVersion: player.relic_elo_calculation_version,
      originalUnlockedAtBasis: originalUnlockedAt
        ? "best_available_profile_timestamp"
        : "unavailable",
    },
  });

  return {
    createdCount: created ? 1 : 0,
    createdSlugs: created ? ["ironclad-recruit"] : [],
    evaluatedSlugs: ["ironclad-recruit"],
    skippedReasons: [],
  };
}

export async function evaluateMatchBadgeAwardsForMatch({
  matchId,
  supabase = createSupabaseAdminClient(),
  evaluationMode = "live",
}: {
  matchId: string;
  supabase?: BadgeAuthorityClient;
  evaluationMode?: "live" | "backfill";
}): Promise<BadgeAwardEvaluationResult> {
  const { data, error } = await supabase.rpc(
    "get_player_badge_match_participants",
    {
      p_match_id: matchId,
    }
  );

  if (error) {
    throw new BadgeAuthorityError(
      "MATCH_PARTICIPANTS_LOAD_FAILED",
      "Badge match evaluation could not load participants."
    );
  }

  const playerIds = [
    ...new Set(
      rowsOf<MatchBadgeParticipantRow>(data)
        .map((row) => stringOrNull(row.player_id))
        .filter((value): value is string => value !== null)
    ),
  ];

  if (playerIds.length === 0) {
    return {
      ...EMPTY_EVALUATION_RESULT,
      skippedReasons: ["match_not_played"],
    };
  }

  return mergeEvaluationResults(
    await Promise.all(
      playerIds.map((playerId) =>
        evaluateMatchBadgeAwardsForPlayer({
          playerId,
          supabase,
          evaluationMode,
        })
      )
    )
  );
}

export async function evaluateMatchBadgeAwardsForReportGroup({
  reportGroupId,
  supabase = createSupabaseAdminClient(),
}: {
  reportGroupId: string;
  supabase?: BadgeAuthorityClient;
}): Promise<BadgeAwardEvaluationResult> {
  const matchId = await loadFinalizedReportGroupMatchId(supabase, reportGroupId);

  if (!matchId) {
    return {
      ...EMPTY_EVALUATION_RESULT,
      skippedReasons: ["report_group_not_finalized"],
    };
  }

  return evaluateMatchBadgeAwardsForMatch({ matchId, supabase });
}

export async function evaluateMatchBadgeAwardsForLegacySubmission({
  submissionId,
  supabase = createSupabaseAdminClient(),
}: {
  submissionId: string;
  supabase?: BadgeAuthorityClient;
}): Promise<BadgeAwardEvaluationResult> {
  const matchId = await loadApprovedLegacySubmissionMatchId(
    supabase,
    submissionId
  );

  if (!matchId) {
    return {
      ...EMPTY_EVALUATION_RESULT,
      skippedReasons: ["submission_not_approved"],
    };
  }

  return evaluateMatchBadgeAwardsForMatch({ matchId, supabase });
}

export async function evaluateTournamentBadgeAwardsForMatch({
  matchId,
  supabase = createSupabaseAdminClient(),
  evaluationMode = "live",
}: {
  matchId: string;
  supabase?: BadgeAuthorityClient;
  evaluationMode?: "live" | "backfill";
}): Promise<BadgeAwardEvaluationResult> {
  const tournamentId = await loadCompletedTournamentIdForMatch(
    supabase,
    matchId
  );

  if (!tournamentId) {
    return {
      ...EMPTY_EVALUATION_RESULT,
      skippedReasons: ["tournament_not_completed"],
    };
  }

  return evaluateTournamentBadgeAwardsForTournament({
    tournamentId,
    supabase,
    evaluationMode,
  });
}

export async function evaluateTournamentBadgeAwardsForReportGroup({
  reportGroupId,
  supabase = createSupabaseAdminClient(),
}: {
  reportGroupId: string;
  supabase?: BadgeAuthorityClient;
}): Promise<BadgeAwardEvaluationResult> {
  const matchId = await loadFinalizedReportGroupMatchId(supabase, reportGroupId);

  if (!matchId) {
    return {
      ...EMPTY_EVALUATION_RESULT,
      skippedReasons: ["report_group_not_finalized"],
    };
  }

  return evaluateTournamentBadgeAwardsForMatch({ matchId, supabase });
}

export async function evaluateTournamentBadgeAwardsForLegacySubmission({
  submissionId,
  supabase = createSupabaseAdminClient(),
}: {
  submissionId: string;
  supabase?: BadgeAuthorityClient;
}): Promise<BadgeAwardEvaluationResult> {
  const matchId = await loadApprovedLegacySubmissionMatchId(
    supabase,
    submissionId
  );

  if (!matchId) {
    return {
      ...EMPTY_EVALUATION_RESULT,
      skippedReasons: ["submission_not_approved"],
    };
  }

  return evaluateTournamentBadgeAwardsForMatch({ matchId, supabase });
}

export async function evaluateTournamentBadgeAwardsForTournament({
  tournamentId,
  supabase = createSupabaseAdminClient(),
  evaluationMode = "live",
}: {
  tournamentId: string;
  supabase?: BadgeAuthorityClient;
  evaluationMode?: "live" | "backfill";
}): Promise<BadgeAwardEvaluationResult> {
  const { data, error } = await supabase.rpc(
    "get_player_badge_tournament_participants",
    {
      p_tournament_id: tournamentId,
    }
  );

  if (error) {
    throw new BadgeAuthorityError(
      "TOURNAMENT_PARTICIPANTS_LOAD_FAILED",
      "Badge tournament evaluation could not load participants."
    );
  }

  const playerIds = [
    ...new Set(
      rowsOf<TournamentBadgeParticipantRow>(data)
        .map((row) => stringOrNull(row.player_id))
        .filter((value): value is string => value !== null)
    ),
  ];

  if (playerIds.length === 0) {
    return {
      ...EMPTY_EVALUATION_RESULT,
      skippedReasons: ["tournament_not_completed"],
    };
  }

  return mergeEvaluationResults(
    await Promise.all(
      playerIds.map((playerId) =>
        evaluateTournamentBadgeAwardsForPlayer({
          playerId,
          supabase,
          evaluationMode,
        })
      )
    )
  );
}

export async function evaluateTournamentBadgeAwardsForPlayer({
  playerId,
  supabase = createSupabaseAdminClient(),
  evaluationMode = "live",
}: {
  playerId: string;
  supabase?: BadgeAuthorityClient;
  evaluationMode?: "live" | "backfill";
}): Promise<BadgeAwardEvaluationResult> {
  const summary = await loadTournamentBadgeSummary(supabase, playerId);
  if (!summary) {
    return {
      ...EMPTY_EVALUATION_RESULT,
      evaluatedSlugs: TOURNAMENT_THRESHOLDS.map(
        (threshold) => threshold.badgeSlug
      ),
      skippedReasons: ["tournament_summary_unavailable"],
    };
  }

  const createdSlugs: ProductionBadgeAuthoritySlug[] = [];
  const skippedReasons: string[] = [];

  for (const threshold of TOURNAMENT_THRESHOLDS) {
    const sourceId = summary[threshold.sourceIdKey];
    const originalUnlockedAt = summary[threshold.originalUnlockedAtKey];

    if (summary.completedTournamentCount < threshold.threshold) {
      skippedReasons.push(`${threshold.badgeSlug}_threshold_not_met`);
      continue;
    }

    if (!sourceId) {
      skippedReasons.push(`${threshold.badgeSlug}_source_missing`);
      continue;
    }

    const created = await persistBadgeAward(supabase, {
      playerId,
      badgeSlug: threshold.badgeSlug,
      sourceType: "tournament",
      sourceId,
      originalUnlockedAt,
      sourceMetadata: {
        evaluator: "tournament-count",
        evaluationMode,
        threshold: threshold.threshold,
        qualifyingCount: summary.completedTournamentCount,
        originalUnlockedAtBasis: originalUnlockedAt
          ? "tournament_first_completed_at"
          : "unavailable",
      },
    });

    if (created) {
      createdSlugs.push(threshold.badgeSlug);
    }
  }

  return {
    createdCount: createdSlugs.length,
    createdSlugs,
    evaluatedSlugs: TOURNAMENT_THRESHOLDS.map(
      (threshold) => threshold.badgeSlug
    ),
    skippedReasons,
  };
}

export async function evaluateMatchBadgeAwardsForPlayer({
  playerId,
  supabase = createSupabaseAdminClient(),
  evaluationMode = "live",
}: {
  playerId: string;
  supabase?: BadgeAuthorityClient;
  evaluationMode?: "live" | "backfill";
}): Promise<BadgeAwardEvaluationResult> {
  const summary = await loadMatchBadgeSummary(supabase, playerId);
  if (!summary) {
    return {
      ...EMPTY_EVALUATION_RESULT,
      evaluatedSlugs: MATCH_THRESHOLDS.map((threshold) => threshold.badgeSlug),
      skippedReasons: ["match_summary_unavailable"],
    };
  }

  const createdSlugs: ProductionBadgeAuthoritySlug[] = [];
  const skippedReasons: string[] = [];

  for (const threshold of MATCH_THRESHOLDS) {
    const qualifyingCount = summary[threshold.countKey];
    const sourceId = summary[threshold.sourceIdKey];
    const originalUnlockedAt = summary[threshold.originalUnlockedAtKey];

    if (qualifyingCount < threshold.threshold) {
      skippedReasons.push(`${threshold.badgeSlug}_threshold_not_met`);
      continue;
    }

    if (!sourceId) {
      skippedReasons.push(`${threshold.badgeSlug}_source_missing`);
      continue;
    }

    const created = await persistBadgeAward(supabase, {
      playerId,
      badgeSlug: threshold.badgeSlug,
      sourceType: "match",
      sourceId,
      originalUnlockedAt,
      sourceMetadata: {
        evaluator: threshold.evaluator,
        evaluationMode,
        threshold: threshold.threshold,
        qualifyingCount,
        originalUnlockedAtBasis: originalUnlockedAt
          ? "official_match_result_timestamp"
          : "unavailable",
      },
    });

    if (created) {
      createdSlugs.push(threshold.badgeSlug);
    }
  }

  return {
    createdCount: createdSlugs.length,
    createdSlugs,
    evaluatedSlugs: MATCH_THRESHOLDS.map((threshold) => threshold.badgeSlug),
    skippedReasons,
  };
}

export async function backfillInitialBadgeAwards({
  supabase = createSupabaseAdminClient(),
  playerIds,
}: {
  supabase?: BadgeAuthorityClient;
  playerIds?: readonly string[];
} = {}): Promise<BadgeBackfillResult> {
  const candidates = playerIds ? [...playerIds] : await loadBackfillPlayerIds(supabase);
  const badgeCounts = Object.fromEntries(
    PRODUCTION_BADGE_AUTHORITY_SLUGS.map((slug) => [slug, 0])
  ) as Record<ProductionBadgeAuthoritySlug, number>;
  const errors: BadgeBackfillResult["errors"] = [];

  for (const playerId of candidates) {
    try {
      const result = mergeEvaluationResults([
        await evaluateProfileBadgeAwards({
          playerId,
          supabase,
          evaluationMode: "backfill",
        }),
        await evaluateMatchBadgeAwardsForPlayer({
          playerId,
          supabase,
          evaluationMode: "backfill",
        }),
        await evaluateTournamentBadgeAwardsForPlayer({
          playerId,
          supabase,
          evaluationMode: "backfill",
        }),
      ]);

      for (const slug of result.createdSlugs) {
        badgeCounts[slug] += 1;
      }
    } catch (error) {
      errors.push({
        playerId,
        code:
          error instanceof BadgeAuthorityError
            ? error.code
            : "BADGE_BACKFILL_FAILED",
      });
    }
  }

  return {
    playersEvaluated: candidates.length,
    awardsCreated: Object.values(badgeCounts).reduce(
      (total, count) => total + count,
      0
    ),
    badgeCounts,
    errors,
  };
}

async function loadBackfillPlayerIds(supabase: BadgeAuthorityClient) {
  const { data, error } = await supabase
    .from("players")
    .select("id")
    .order("created_at", { ascending: true });

  if (error) {
    throw new BadgeAuthorityError(
      "BACKFILL_PLAYER_LOAD_FAILED",
      "Badge backfill could not load players."
    );
  }

  return rowsOf<{ id: unknown }>(data)
    .map((row) => stringOrNull(row.id))
    .filter((value): value is string => value !== null);
}

async function loadMatchBadgeSummary(
  supabase: BadgeAuthorityClient,
  playerId: string
) {
  const { data, error } = await supabase.rpc(
    "get_player_badge_match_threshold_summary",
    {
      p_player_id: playerId,
    }
  );

  if (error) {
    throw new BadgeAuthorityError(
      "MATCH_SUMMARY_LOAD_FAILED",
      "Badge match evaluation could not load the match summary."
    );
  }

  const row = rowsOf<MatchBadgeSummaryRow>(data)[0];
  if (!row) {
    return null;
  }

  return {
    playedMatchCount: integerOrZero(row.played_match_count),
    winCount: integerOrZero(row.win_count),
    firstPlayedMatchId: stringOrNull(row.first_played_match_id),
    firstPlayedAt: isoOrNull(row.first_played_at),
    tenthPlayedMatchId: stringOrNull(row.tenth_played_match_id),
    tenthPlayedAt: isoOrNull(row.tenth_played_at),
    firstWinMatchId: stringOrNull(row.first_win_match_id),
    firstWinAt: isoOrNull(row.first_win_at),
    fifthWinMatchId: stringOrNull(row.fifth_win_match_id),
    fifthWinAt: isoOrNull(row.fifth_win_at),
    tenthWinMatchId: stringOrNull(row.tenth_win_match_id),
    tenthWinAt: isoOrNull(row.tenth_win_at),
    twentyFifthWinMatchId: stringOrNull(row.twenty_fifth_win_match_id),
    twentyFifthWinAt: isoOrNull(row.twenty_fifth_win_at),
  };
}

async function loadCompletedTournamentIdForMatch(
  supabase: BadgeAuthorityClient,
  matchId: string
) {
  const { data, error } = await supabase.rpc(
    "get_player_badge_tournament_for_match",
    {
      p_match_id: matchId,
    }
  );

  if (error) {
    throw new BadgeAuthorityError(
      "MATCH_TOURNAMENT_LOAD_FAILED",
      "Badge tournament evaluation could not load the match tournament."
    );
  }

  return stringOrNull(
    rowsOf<TournamentBadgeForMatchRow>(data)[0]?.tournament_id
  );
}

async function loadTournamentBadgeSummary(
  supabase: BadgeAuthorityClient,
  playerId: string
) {
  const { data, error } = await supabase.rpc(
    "get_player_badge_tournament_summary",
    {
      p_player_id: playerId,
    }
  );

  if (error) {
    throw new BadgeAuthorityError(
      "TOURNAMENT_SUMMARY_LOAD_FAILED",
      "Badge tournament evaluation could not load the tournament summary."
    );
  }

  const row = rowsOf<TournamentBadgeSummaryRow>(data)[0];
  if (!row) {
    return null;
  }

  return {
    completedTournamentCount: integerOrZero(row.completed_tournament_count),
    firstCompletedTournamentId: stringOrNull(
      row.first_completed_tournament_id
    ),
    firstCompletedAt: isoOrNull(row.first_completed_at),
    thirdCompletedTournamentId: stringOrNull(
      row.third_completed_tournament_id
    ),
    thirdCompletedAt: isoOrNull(row.third_completed_at),
    tenthCompletedTournamentId: stringOrNull(
      row.tenth_completed_tournament_id
    ),
    tenthCompletedAt: isoOrNull(row.tenth_completed_at),
  };
}

async function loadFinalizedReportGroupMatchId(
  supabase: BadgeAuthorityClient,
  reportGroupId: string
) {
  const { data, error } = await supabase
    .from("match_result_report_groups")
    .select("match_id, status, finalized_at")
    .eq("id", reportGroupId)
    .maybeSingle();

  if (error) {
    throw new BadgeAuthorityError(
      "REPORT_GROUP_LOAD_FAILED",
      "Badge match evaluation could not load the report group."
    );
  }

  const reportGroup = firstRecord(data);
  const matchId = stringOrNull(reportGroup?.match_id);
  const status = stringOrNull(reportGroup?.status);
  const finalizedAt = isoOrNull(reportGroup?.finalized_at);

  return matchId && finalizedAt && isFinalizedReportGroupStatus(status)
    ? matchId
    : null;
}

async function loadApprovedLegacySubmissionMatchId(
  supabase: BadgeAuthorityClient,
  submissionId: string
) {
  const { data, error } = await supabase
    .from("match_result_submissions")
    .select("match_id, status")
    .eq("id", submissionId)
    .maybeSingle();

  if (error) {
    throw new BadgeAuthorityError(
      "SUBMISSION_LOAD_FAILED",
      "Badge match evaluation could not load the legacy submission."
    );
  }

  const submission = firstRecord(data);
  const matchId = stringOrNull(submission?.match_id);
  const status = stringOrNull(submission?.status);

  return matchId && status === "approved" ? matchId : null;
}

async function persistBadgeAward(
  supabase: BadgeAuthorityClient,
  input: PersistBadgeAwardInput
) {
  const { data, error } = await supabase
    .from("player_badge_awards")
    .upsert(
      {
        player_id: input.playerId,
        badge_slug: input.badgeSlug,
        source_type: input.sourceType,
        source_id: input.sourceId,
        source_metadata: input.sourceMetadata,
        original_unlocked_at: input.originalUnlockedAt,
      },
      {
        ignoreDuplicates: true,
        onConflict: "player_id,badge_slug",
      }
    )
    .select("id, badge_slug")
    .maybeSingle();

  if (error) {
    throw new BadgeAuthorityError(
      "AWARD_INSERT_FAILED",
      "Badge award could not be persisted."
    );
  }

  return firstRecord(data) !== null;
}

function isIronCladRecruitQualified(player: {
  profile_completed: boolean;
  steam_id64: string | null;
  current_elo: number | null;
  relic_verified_elo: number | null;
  relic_verified_faction: string | null;
  relic_verified_division: string | null;
  relic_elo_calculation_version: string | null;
  relic_verified_elo_verified_at: string | null;
}) {
  return (
    player.profile_completed &&
    player.steam_id64 !== null &&
    player.current_elo !== null &&
    player.relic_verified_elo !== null &&
    player.current_elo === player.relic_verified_elo &&
    player.relic_verified_faction !== null &&
    player.relic_verified_division !== null &&
    player.relic_elo_calculation_version !== null &&
    player.relic_verified_elo_verified_at !== null
  );
}

function parseProfileBadgePlayerRow(value: unknown) {
  const row = firstRecord<ProfileBadgePlayerRow>(value);
  if (!row) return null;

  const id = stringOrNull(row.id);
  if (!id) return null;

  return {
    id,
    profile_completed: row.profile_completed === true,
    steam_id64: stringOrNull(row.steam_id64),
    current_elo: integerOrNull(row.current_elo),
    relic_verified_elo: integerOrNull(row.relic_verified_elo),
    relic_verified_faction: stringOrNull(row.relic_verified_faction),
    relic_verified_division: stringOrNull(row.relic_verified_division),
    relic_elo_calculation_version: stringOrNull(
      row.relic_elo_calculation_version
    ),
    relic_verified_elo_verified_at: isoOrNull(row.relic_elo_verified_at),
    updated_at: isoOrNull(row.updated_at),
  };
}

function isFinalizedReportGroupStatus(status: string | null) {
  return (
    status === "confirmed" ||
    status === "auto_approved" ||
    status === "approved"
  );
}

function mergeEvaluationResults(
  results: readonly BadgeAwardEvaluationResult[]
): BadgeAwardEvaluationResult {
  return {
    createdCount: results.reduce(
      (total, result) => total + result.createdCount,
      0
    ),
    createdSlugs: results.flatMap((result) => result.createdSlugs),
    evaluatedSlugs: [...new Set(results.flatMap((result) => result.evaluatedSlugs))],
    skippedReasons: results.flatMap((result) => result.skippedReasons),
  };
}

function rowsOf<T extends Record<string, unknown>>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord) as T[];
  }

  if (isRecord(value)) {
    return [value as T];
  }

  return [];
}

function firstRecord<T extends Record<string, unknown>>(
  value: unknown
): T | null {
  return rowsOf<T>(value)[0] ?? null;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function integerOrNull(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^-?\d+$/.test(value)
        ? Number(value)
        : Number.NaN;

  return Number.isInteger(parsed) ? parsed : null;
}

function integerOrZero(value: unknown) {
  return integerOrNull(value) ?? 0;
}

function isoOrNull(value: unknown) {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? value : null;
}

function pickLatestIso(values: Array<string | null>) {
  return values
    .filter((value): value is string => value !== null)
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export class BadgeAuthorityError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "BadgeAuthorityError";
    this.code = code;
  }
}
