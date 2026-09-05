import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createBadgeUnlockedNotification,
  reconcileBadgeUnlockedNotificationsForPlayer,
} from "@/lib/badge-notifications";
import type { BadgeSlug } from "@/lib/badges/types";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const PRODUCTION_BADGE_AUTHORITY_SLUGS = [
  "ironclad-recruit",
  "first-deployment",
  "first-victory",
  "battle-tested",
  "reliable-competitor",
  "comeback-commander",
  "flawless-campaign",
  "first-campaign",
  "iron-regular",
  "tournament-veteran",
  "rising-through-the-ranks",
  "season-campaigner",
  "five-victories",
  "ten-victories",
  "twenty-five-victories",
  "iron-streak",
  "unbroken",
  "clean-sweep",
  "giant-slayer",
  "giant-hunter",
  "first-advance",
  "semifinalist",
  "finalist",
  "academy-champion",
  "challenge-champion",
  "elite-champion",
  "double-champion",
  "triple-crown",
  "season-podium",
  "season-champion",
] as const satisfies readonly BadgeSlug[];

type ProductionBadgeAuthoritySlug =
  (typeof PRODUCTION_BADGE_AUTHORITY_SLUGS)[number];

type BadgeAuthorityClient = Pick<SupabaseClient, "from" | "rpc">;

type BadgeSourceType = "profile" | "match" | "tournament" | "season";

type BadgeSourceMetadata = Record<string, string | number | boolean | null>;

export type BadgeEvaluationMode = "live" | "reconciliation" | "backfill";

type PersistBadgeAwardInput = {
  badgeSlug: ProductionBadgeAuthoritySlug;
  playerId: string;
  sourceType: BadgeSourceType;
  sourceId: string | null;
  originalUnlockedAt: string | null;
  evaluationMode: BadgeEvaluationMode;
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
  account_closed_at: unknown;
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

type MatchExcellenceSummaryRow = {
  best_win_streak: unknown;
  third_streak_match_id: unknown;
  third_streak_at: unknown;
  fifth_streak_match_id: unknown;
  fifth_streak_at: unknown;
  clean_sweep_count: unknown;
  first_clean_sweep_match_id: unknown;
  first_clean_sweep_at: unknown;
  upset_win_count: unknown;
  first_upset_match_id: unknown;
  first_upset_at: unknown;
  first_upset_elo_delta: unknown;
  third_upset_match_id: unknown;
  third_upset_at: unknown;
  third_upset_elo_delta: unknown;
};

type ReliableCompetitorSummaryRow = {
  best_run: unknown;
  tenth_match_id: unknown;
  tenth_at: unknown;
};

type ComebackCommanderSummaryRow = {
  match_id: unknown;
  game1_winner_registration_id: unknown;
  series_winner_registration_id: unknown;
  series_best_of: unknown;
  finalized_game_count: unknown;
  finalized_at: unknown;
};

type FlawlessCampaignSummaryRow = {
  tournament_id: unknown;
  registration_id: unknown;
  first_completed_at: unknown;
  expected_path_segment_count: unknown;
  played_segment_count: unknown;
  automatic_bye_count: unknown;
  opponent_no_show_count: unknown;
  verified_game_count: unknown;
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

type TournamentBracketProgressionSummaryRow = {
  original_bracket: unknown;
  original_tournament_id: unknown;
  original_completed_at: unknown;
  higher_bracket: unknown;
  higher_tournament_id: unknown;
  higher_completed_at: unknown;
};

type TournamentPrestigeSummaryRow = {
  played_advance_win_count: unknown;
  first_advance_match_id: unknown;
  first_advance_at: unknown;
  semifinalist_count: unknown;
  first_semifinal_tournament_id: unknown;
  first_semifinal_at: unknown;
  finalist_count: unknown;
  first_finalist_tournament_id: unknown;
  first_finalist_at: unknown;
  academy_championship_count: unknown;
  first_academy_championship_tournament_id: unknown;
  first_academy_championship_at: unknown;
  challenge_championship_count: unknown;
  first_challenge_championship_tournament_id: unknown;
  first_challenge_championship_at: unknown;
  main_championship_count: unknown;
  first_main_championship_tournament_id: unknown;
  first_main_championship_at: unknown;
  championship_count: unknown;
  second_championship_tournament_id: unknown;
  second_championship_at: unknown;
  triple_crown_bracket_count: unknown;
  triple_crown_tournament_id: unknown;
  triple_crown_at: unknown;
};

type SeasonBadgeForTournamentRow = {
  season_id: unknown;
};

type SeasonBadgeParticipantRow = {
  player_id: unknown;
};

type SeasonBadgeSummaryRow = {
  season_campaigner_count: unknown;
  first_season_campaigner_season_id: unknown;
  first_season_campaigner_at: unknown;
  first_season_campaigner_threshold_tournament_id: unknown;
  first_season_campaigner_tournament_count: unknown;
  podium_finish_count: unknown;
  first_podium_season_id: unknown;
  first_podium_at: unknown;
  first_podium_rank: unknown;
  champion_finish_count: unknown;
  first_champion_season_id: unknown;
  first_champion_at: unknown;
  first_champion_rank: unknown;
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

type MatchExcellenceThreshold = {
  badgeSlug: ProductionBadgeAuthoritySlug;
  countKey: "bestWinStreak" | "cleanSweepCount" | "upsetWinCount";
  threshold: number;
  sourceIdKey:
    | "thirdStreakMatchId"
    | "fifthStreakMatchId"
    | "firstCleanSweepMatchId"
    | "firstUpsetMatchId"
    | "thirdUpsetMatchId";
  originalUnlockedAtKey:
    | "thirdStreakAt"
    | "fifthStreakAt"
    | "firstCleanSweepAt"
    | "firstUpsetAt"
    | "thirdUpsetAt";
  evaluator: "win-streak" | "clean-sweep" | "elo-upset";
  upsetEloDeltaKey?: "firstUpsetEloDelta" | "thirdUpsetEloDelta";
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

type TournamentPrestigeThreshold = {
  badgeSlug: ProductionBadgeAuthoritySlug;
  countKey:
    | "playedAdvanceWinCount"
    | "semifinalistCount"
    | "finalistCount"
    | "academyChampionshipCount"
    | "challengeChampionshipCount"
    | "mainChampionshipCount"
    | "championshipCount"
    | "tripleCrownBracketCount";
  threshold: number;
  sourceIdKey:
    | "firstAdvanceMatchId"
    | "firstSemifinalTournamentId"
    | "firstFinalistTournamentId"
    | "firstAcademyChampionshipTournamentId"
    | "firstChallengeChampionshipTournamentId"
    | "firstMainChampionshipTournamentId"
    | "secondChampionshipTournamentId"
    | "tripleCrownTournamentId";
  originalUnlockedAtKey:
    | "firstAdvanceAt"
    | "firstSemifinalAt"
    | "firstFinalistAt"
    | "firstAcademyChampionshipAt"
    | "firstChallengeChampionshipAt"
    | "firstMainChampionshipAt"
    | "secondChampionshipAt"
    | "tripleCrownAt";
  evaluator:
    | "tournament-progression"
    | "round-reach"
    | "division-championship"
    | "championship-count"
    | "triple-crown";
  bracketType?: "academy" | "challenge" | "main";
  eventType?: "played_match_win" | "tournament_win";
  sourceType?: BadgeSourceType;
};

type SeasonThreshold = {
  badgeSlug: ProductionBadgeAuthoritySlug;
  countKey:
    | "seasonCampaignerCount"
    | "podiumFinishCount"
    | "championFinishCount";
  threshold: number;
  sourceIdKey:
    | "firstSeasonCampaignerSeasonId"
    | "firstPodiumSeasonId"
    | "firstChampionSeasonId";
  originalUnlockedAtKey:
    | "firstSeasonCampaignerAt"
    | "firstPodiumAt"
    | "firstChampionAt";
  evaluator: "season-campaigner" | "season-podium" | "season-champion";
  rankKey?: "firstPodiumRank" | "firstChampionRank";
};

const PROFILE_SELECT = [
  "id",
  "account_closed_at",
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

const MATCH_EXCELLENCE_THRESHOLDS: readonly MatchExcellenceThreshold[] = [
  {
    badgeSlug: "iron-streak",
    countKey: "bestWinStreak",
    threshold: 3,
    sourceIdKey: "thirdStreakMatchId",
    originalUnlockedAtKey: "thirdStreakAt",
    evaluator: "win-streak",
  },
  {
    badgeSlug: "unbroken",
    countKey: "bestWinStreak",
    threshold: 5,
    sourceIdKey: "fifthStreakMatchId",
    originalUnlockedAtKey: "fifthStreakAt",
    evaluator: "win-streak",
  },
  {
    badgeSlug: "clean-sweep",
    countKey: "cleanSweepCount",
    threshold: 1,
    sourceIdKey: "firstCleanSweepMatchId",
    originalUnlockedAtKey: "firstCleanSweepAt",
    evaluator: "clean-sweep",
  },
  {
    badgeSlug: "giant-slayer",
    countKey: "upsetWinCount",
    threshold: 1,
    sourceIdKey: "firstUpsetMatchId",
    originalUnlockedAtKey: "firstUpsetAt",
    evaluator: "elo-upset",
    upsetEloDeltaKey: "firstUpsetEloDelta",
  },
  {
    badgeSlug: "giant-hunter",
    countKey: "upsetWinCount",
    threshold: 3,
    sourceIdKey: "thirdUpsetMatchId",
    originalUnlockedAtKey: "thirdUpsetAt",
    evaluator: "elo-upset",
    upsetEloDeltaKey: "thirdUpsetEloDelta",
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

const TOURNAMENT_PRESTIGE_THRESHOLDS: readonly TournamentPrestigeThreshold[] = [
  {
    badgeSlug: "first-advance",
    countKey: "playedAdvanceWinCount",
    threshold: 1,
    sourceIdKey: "firstAdvanceMatchId",
    originalUnlockedAtKey: "firstAdvanceAt",
    evaluator: "tournament-progression",
    eventType: "played_match_win",
    sourceType: "match",
  },
  {
    badgeSlug: "semifinalist",
    countKey: "semifinalistCount",
    threshold: 1,
    sourceIdKey: "firstSemifinalTournamentId",
    originalUnlockedAtKey: "firstSemifinalAt",
    evaluator: "round-reach",
  },
  {
    badgeSlug: "finalist",
    countKey: "finalistCount",
    threshold: 1,
    sourceIdKey: "firstFinalistTournamentId",
    originalUnlockedAtKey: "firstFinalistAt",
    evaluator: "round-reach",
  },
  {
    badgeSlug: "academy-champion",
    countKey: "academyChampionshipCount",
    threshold: 1,
    sourceIdKey: "firstAcademyChampionshipTournamentId",
    originalUnlockedAtKey: "firstAcademyChampionshipAt",
    evaluator: "division-championship",
    bracketType: "academy",
    eventType: "tournament_win",
  },
  {
    badgeSlug: "challenge-champion",
    countKey: "challengeChampionshipCount",
    threshold: 1,
    sourceIdKey: "firstChallengeChampionshipTournamentId",
    originalUnlockedAtKey: "firstChallengeChampionshipAt",
    evaluator: "division-championship",
    bracketType: "challenge",
    eventType: "tournament_win",
  },
  {
    badgeSlug: "elite-champion",
    countKey: "mainChampionshipCount",
    threshold: 1,
    sourceIdKey: "firstMainChampionshipTournamentId",
    originalUnlockedAtKey: "firstMainChampionshipAt",
    evaluator: "division-championship",
    bracketType: "main",
    eventType: "tournament_win",
  },
  {
    badgeSlug: "double-champion",
    countKey: "championshipCount",
    threshold: 2,
    sourceIdKey: "secondChampionshipTournamentId",
    originalUnlockedAtKey: "secondChampionshipAt",
    evaluator: "championship-count",
    eventType: "tournament_win",
  },
  {
    badgeSlug: "triple-crown",
    countKey: "tripleCrownBracketCount",
    threshold: 3,
    sourceIdKey: "tripleCrownTournamentId",
    originalUnlockedAtKey: "tripleCrownAt",
    evaluator: "triple-crown",
    eventType: "tournament_win",
  },
];

const SEASON_THRESHOLDS: readonly SeasonThreshold[] = [
  {
    badgeSlug: "season-campaigner",
    countKey: "seasonCampaignerCount",
    threshold: 1,
    sourceIdKey: "firstSeasonCampaignerSeasonId",
    originalUnlockedAtKey: "firstSeasonCampaignerAt",
    evaluator: "season-campaigner",
  },
  {
    badgeSlug: "season-podium",
    countKey: "podiumFinishCount",
    threshold: 1,
    sourceIdKey: "firstPodiumSeasonId",
    originalUnlockedAtKey: "firstPodiumAt",
    evaluator: "season-podium",
    rankKey: "firstPodiumRank",
  },
  {
    badgeSlug: "season-champion",
    countKey: "championFinishCount",
    threshold: 1,
    sourceIdKey: "firstChampionSeasonId",
    originalUnlockedAtKey: "firstChampionAt",
    evaluator: "season-champion",
    rankKey: "firstChampionRank",
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
  evaluationMode?: BadgeEvaluationMode;
}): Promise<BadgeAwardEvaluationResult> {
  const { data, error } = await supabase
    .from("players")
    .select(PROFILE_SELECT)
    .eq("id", playerId)
    .is("account_closed_at", null)
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
    evaluationMode,
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
  evaluationMode?: BadgeEvaluationMode;
}): Promise<BadgeAwardEvaluationResult> {
  const playerIds = await loadPlayedMatchParticipantPlayerIds(
    supabase,
    matchId
  );

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
  evaluationMode?: BadgeEvaluationMode;
}): Promise<BadgeAwardEvaluationResult> {
  const playerIds = await loadPlayedMatchParticipantPlayerIds(
    supabase,
    matchId
  );
  const livePrestigeResult =
    playerIds.length > 0
      ? mergeEvaluationResults(
          await Promise.all(
            playerIds.map((playerId) =>
              evaluateTournamentPrestigeBadgeAwardsForPlayer({
                playerId,
                supabase,
                evaluationMode,
              })
            )
          )
        )
      : {
          ...EMPTY_EVALUATION_RESULT,
          skippedReasons: ["match_not_played"],
        };

  const tournamentId = await loadCompletedTournamentIdForMatch(supabase, matchId);

  if (!tournamentId) {
    return livePrestigeResult;
  }

  return mergeEvaluationResults([
    livePrestigeResult,
    await evaluateTournamentBadgeAwardsForTournament({
      tournamentId,
      supabase,
      evaluationMode,
    }),
  ]);
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
  evaluationMode?: BadgeEvaluationMode;
}): Promise<BadgeAwardEvaluationResult> {
  const { data, error } = await supabase.rpc(
    "get_player_badge_tournament_authority_participants",
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

  const tournamentResult = mergeEvaluationResults(
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

  return mergeEvaluationResults([
    tournamentResult,
    await evaluateSeasonBadgeAwardsForTournament({
      tournamentId,
      supabase,
      evaluationMode,
    }),
  ]);
}

export async function evaluateTournamentBadgeAwardsForPlayer({
  playerId,
  supabase = createSupabaseAdminClient(),
  evaluationMode = "live",
}: {
  playerId: string;
  supabase?: BadgeAuthorityClient;
  evaluationMode?: BadgeEvaluationMode;
}): Promise<BadgeAwardEvaluationResult> {
  return mergeEvaluationResults([
    await evaluateBracketProgressionBadgeAwardsForPlayer({
      playerId,
      supabase,
      evaluationMode,
    }),
    await evaluateTournamentCountBadgeAwardsForPlayer({
      playerId,
      supabase,
      evaluationMode,
    }),
    await evaluateTournamentPrestigeBadgeAwardsForPlayer({
      playerId,
      supabase,
      evaluationMode,
    }),
    await evaluateFlawlessCampaignBadgeAwardsForPlayer({
      playerId,
      supabase,
      evaluationMode,
    }),
  ]);
}

export async function evaluateFlawlessCampaignBadgeAwardsForPlayer({
  playerId,
  supabase = createSupabaseAdminClient(),
  evaluationMode = "live",
}: {
  playerId: string;
  supabase?: BadgeAuthorityClient;
  evaluationMode?: BadgeEvaluationMode;
}): Promise<BadgeAwardEvaluationResult> {
  const summary = await loadFlawlessCampaignBadgeSummary(supabase, playerId);
  const evidence = summary?.[0];

  if (!evidence) {
    return {
      ...EMPTY_EVALUATION_RESULT,
      evaluatedSlugs: ["flawless-campaign"],
      skippedReasons: ["flawless_campaign_evidence_unavailable"],
    };
  }

  // Ownership must never be granted for an all-bye or all-no-show title.
  // The database RPC enforces this too, but retaining the runtime guard keeps
  // the locked product rule explicit at the final award boundary.
  if (evidence.playedSegmentCount < 1 || evidence.verifiedGameCount < 1) {
    return {
      ...EMPTY_EVALUATION_RESULT,
      evaluatedSlugs: ["flawless-campaign"],
      skippedReasons: ["flawless_campaign_played_series_required"],
    };
  }

  const created = await persistBadgeAward(supabase, {
    playerId,
    badgeSlug: "flawless-campaign",
    sourceType: "tournament",
    sourceId: evidence.tournamentId,
    originalUnlockedAt: evidence.firstCompletedAt,
    evaluationMode,
    sourceMetadata: {
      evaluator: "flawless-campaign",
      evaluationMode,
      tournamentId: evidence.tournamentId,
      registrationId: evidence.registrationId,
      expectedPathLength: evidence.expectedPathSegmentCount,
      playedSegmentCount: evidence.playedSegmentCount,
      automaticByeCount: evidence.automaticByeCount,
      opponentNoShowCount: evidence.opponentNoShowCount,
      verifiedGameCount: evidence.verifiedGameCount,
      originalUnlockedAtBasis: "tournament_first_completed_at",
    },
  });

  return {
    createdCount: created ? 1 : 0,
    createdSlugs: created ? ["flawless-campaign"] : [],
    evaluatedSlugs: ["flawless-campaign"],
    skippedReasons: created ? [] : ["award_already_exists"],
  };
}

async function evaluateBracketProgressionBadgeAwardsForPlayer({
  playerId,
  supabase,
  evaluationMode,
}: {
  playerId: string;
  supabase: BadgeAuthorityClient;
  evaluationMode: BadgeEvaluationMode;
}): Promise<BadgeAwardEvaluationResult> {
  const summary = await loadTournamentBracketProgressionSummary(
    supabase,
    playerId
  );

  if (!summary) {
    return {
      ...EMPTY_EVALUATION_RESULT,
      evaluatedSlugs: ["rising-through-the-ranks"],
      skippedReasons: ["bracket_progression_summary_unavailable"],
    };
  }

  if (
    !summary.originalBracket ||
    !summary.originalTournamentId ||
    !summary.higherBracket ||
    !summary.higherTournamentId
  ) {
    return {
      ...EMPTY_EVALUATION_RESULT,
      evaluatedSlugs: ["rising-through-the-ranks"],
      skippedReasons: ["higher_bracket_threshold_not_met"],
    };
  }

  const created = await persistBadgeAward(supabase, {
    playerId,
    badgeSlug: "rising-through-the-ranks",
    sourceType: "tournament",
    sourceId: summary.higherTournamentId,
    originalUnlockedAt: summary.higherCompletedAt,
    evaluationMode,
    sourceMetadata: {
      evaluator: "bracket-progression",
      evaluationMode,
      originalBracket: summary.originalBracket,
      higherBracket: summary.higherBracket,
      originalTournamentId: summary.originalTournamentId,
      thresholdTournamentId: summary.higherTournamentId,
      originalUnlockedAtBasis: summary.higherCompletedAt
        ? "higher_tournament_first_completed_at"
        : "unavailable",
    },
  });

  return {
    createdCount: created ? 1 : 0,
    createdSlugs: created ? ["rising-through-the-ranks"] : [],
    evaluatedSlugs: ["rising-through-the-ranks"],
    skippedReasons: created ? [] : ["award_already_exists"],
  };
}

async function evaluateTournamentCountBadgeAwardsForPlayer({
  playerId,
  supabase,
  evaluationMode,
}: {
  playerId: string;
  supabase: BadgeAuthorityClient;
  evaluationMode: BadgeEvaluationMode;
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
      evaluationMode,
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

export async function evaluateTournamentPrestigeBadgeAwardsForPlayer({
  playerId,
  supabase = createSupabaseAdminClient(),
  evaluationMode = "live",
}: {
  playerId: string;
  supabase?: BadgeAuthorityClient;
  evaluationMode?: BadgeEvaluationMode;
}): Promise<BadgeAwardEvaluationResult> {
  const summary = await loadTournamentPrestigeBadgeSummary(supabase, playerId);
  if (!summary) {
    return {
      ...EMPTY_EVALUATION_RESULT,
      evaluatedSlugs: TOURNAMENT_PRESTIGE_THRESHOLDS.map(
        (threshold) => threshold.badgeSlug
      ),
      skippedReasons: ["tournament_prestige_summary_unavailable"],
    };
  }

  const createdSlugs: ProductionBadgeAuthoritySlug[] = [];
  const skippedReasons: string[] = [];

  for (const threshold of TOURNAMENT_PRESTIGE_THRESHOLDS) {
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
      sourceType: threshold.sourceType ?? "tournament",
      sourceId,
      originalUnlockedAt,
      evaluationMode,
      sourceMetadata: {
        evaluator: threshold.evaluator,
        evaluationMode,
        threshold: threshold.threshold,
        qualifyingCount,
        bracketType: threshold.bracketType ?? null,
        eventType: threshold.eventType ?? null,
        originalUnlockedAtBasis: originalUnlockedAt
          ? threshold.sourceType === "match"
            ? "match_official_result_decided_at"
            : "tournament_first_completed_at"
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
    evaluatedSlugs: TOURNAMENT_PRESTIGE_THRESHOLDS.map(
      (threshold) => threshold.badgeSlug
    ),
    skippedReasons,
  };
}

export async function evaluateSeasonBadgeAwardsForTournament({
  tournamentId,
  supabase = createSupabaseAdminClient(),
  evaluationMode = "live",
}: {
  tournamentId: string;
  supabase?: BadgeAuthorityClient;
  evaluationMode?: BadgeEvaluationMode;
}): Promise<BadgeAwardEvaluationResult> {
  const seasonId = await loadFinalizedSeasonIdForTournament(
    supabase,
    tournamentId
  );

  if (!seasonId) {
    return {
      ...EMPTY_EVALUATION_RESULT,
      skippedReasons: ["season_not_finalized"],
    };
  }

  return evaluateSeasonBadgeAwardsForSeason({
    seasonId,
    supabase,
    evaluationMode,
  });
}

export async function evaluateSeasonBadgeAwardsForSeason({
  seasonId,
  supabase = createSupabaseAdminClient(),
  evaluationMode = "live",
}: {
  seasonId: string;
  supabase?: BadgeAuthorityClient;
  evaluationMode?: BadgeEvaluationMode;
}): Promise<BadgeAwardEvaluationResult> {
  const playerIds = await loadSeasonBadgeParticipantPlayerIds(
    supabase,
    seasonId
  );

  if (playerIds.length === 0) {
    return {
      ...EMPTY_EVALUATION_RESULT,
      skippedReasons: ["season_not_finalized_or_no_participants"],
    };
  }

  return mergeEvaluationResults(
    await Promise.all(
      playerIds.map((playerId) =>
        evaluateSeasonBadgeAwardsForPlayer({
          playerId,
          supabase,
          evaluationMode,
        })
      )
    )
  );
}

export async function evaluateSeasonBadgeAwardsForPlayer({
  playerId,
  supabase = createSupabaseAdminClient(),
  evaluationMode = "live",
}: {
  playerId: string;
  supabase?: BadgeAuthorityClient;
  evaluationMode?: BadgeEvaluationMode;
}): Promise<BadgeAwardEvaluationResult> {
  const summary = await loadSeasonBadgeSummary(supabase, playerId);
  if (!summary) {
    return {
      ...EMPTY_EVALUATION_RESULT,
      evaluatedSlugs: SEASON_THRESHOLDS.map((threshold) => threshold.badgeSlug),
      skippedReasons: ["season_summary_unavailable"],
    };
  }

  const createdSlugs: ProductionBadgeAuthoritySlug[] = [];
  const skippedReasons: string[] = [];

  for (const threshold of SEASON_THRESHOLDS) {
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
      sourceType: "season",
      sourceId,
      originalUnlockedAt,
      evaluationMode,
      sourceMetadata: {
        evaluator: threshold.evaluator,
        evaluationMode,
        threshold: threshold.threshold,
        qualifyingCount,
        officialRank: threshold.rankKey ? summary[threshold.rankKey] : null,
        thresholdTournamentId:
          threshold.badgeSlug === "season-campaigner"
            ? summary.firstSeasonCampaignerThresholdTournamentId
            : null,
        qualifyingTournamentCount:
          threshold.badgeSlug === "season-campaigner"
            ? summary.firstSeasonCampaignerTournamentCount
            : null,
        originalUnlockedAtBasis:
          threshold.badgeSlug === "season-campaigner"
            ? "fourth_qualifying_tournament_first_completed_at"
            : "season_finalized_at",
      },
    });

    if (created) {
      createdSlugs.push(threshold.badgeSlug);
    }
  }

  return {
    createdCount: createdSlugs.length,
    createdSlugs,
    evaluatedSlugs: SEASON_THRESHOLDS.map((threshold) => threshold.badgeSlug),
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
  evaluationMode?: BadgeEvaluationMode;
}): Promise<BadgeAwardEvaluationResult> {
  return mergeEvaluationResults([
    await evaluateMatchCountBadgeAwardsForPlayer({
      playerId,
      supabase,
      evaluationMode,
    }),
    await evaluateReliableCompetitorBadgeAwardsForPlayer({
      playerId,
      supabase,
      evaluationMode,
    }),
    await evaluateMatchExcellenceBadgeAwardsForPlayer({
      playerId,
      supabase,
      evaluationMode,
    }),
    await evaluateComebackCommanderBadgeAwardsForPlayer({
      playerId,
      supabase,
      evaluationMode,
    }),
  ]);
}

export async function evaluateReliableCompetitorBadgeAwardsForPlayer({
  playerId,
  supabase = createSupabaseAdminClient(),
  evaluationMode = "live",
}: {
  playerId: string;
  supabase?: BadgeAuthorityClient;
  evaluationMode?: BadgeEvaluationMode;
}): Promise<BadgeAwardEvaluationResult> {
  const summary = await loadReliableCompetitorBadgeSummary(supabase, playerId);
  if (!summary) {
    return {
      ...EMPTY_EVALUATION_RESULT,
      evaluatedSlugs: ["reliable-competitor"],
      skippedReasons: ["reliable_competitor_summary_unavailable"],
    };
  }

  if (summary.bestRun < 10) {
    return {
      ...EMPTY_EVALUATION_RESULT,
      evaluatedSlugs: ["reliable-competitor"],
      skippedReasons: ["reliable-competitor_threshold_not_met"],
    };
  }

  if (!summary.tenthMatchId || !summary.tenthAt) {
    return {
      ...EMPTY_EVALUATION_RESULT,
      evaluatedSlugs: ["reliable-competitor"],
      skippedReasons: ["reliable_competitor_source_missing"],
    };
  }

  const created = await persistBadgeAward(supabase, {
    playerId,
    badgeSlug: "reliable-competitor",
    sourceType: "match",
    sourceId: summary.tenthMatchId,
    originalUnlockedAt: summary.tenthAt,
    evaluationMode,
    sourceMetadata: {
      evaluator: "reliable-competitor",
      evaluationMode,
      threshold: 10,
      runLength: summary.bestRun,
      originalUnlockedAtBasis: "participant_outcome_finalized_at",
    },
  });

  return {
    createdCount: created ? 1 : 0,
    createdSlugs: created ? ["reliable-competitor"] : [],
    evaluatedSlugs: ["reliable-competitor"],
    skippedReasons: created ? [] : ["award_already_exists"],
  };
}

export async function evaluateComebackCommanderBadgeAwardsForPlayer({
  playerId,
  supabase = createSupabaseAdminClient(),
  evaluationMode = "live",
}: {
  playerId: string;
  supabase?: BadgeAuthorityClient;
  evaluationMode?: BadgeEvaluationMode;
}): Promise<BadgeAwardEvaluationResult> {
  const summary = await loadComebackCommanderBadgeSummary(supabase, playerId);
  const evidence = summary?.[0];

  if (!evidence) {
    return {
      ...EMPTY_EVALUATION_RESULT,
      evaluatedSlugs: ["comeback-commander"],
      skippedReasons: ["comeback_commander_evidence_unavailable"],
    };
  }

  const created = await persistBadgeAward(supabase, {
    playerId,
    badgeSlug: "comeback-commander",
    sourceType: "match",
    sourceId: evidence.matchId,
    originalUnlockedAt: evidence.finalizedAt,
    evaluationMode,
    sourceMetadata: {
      evaluator: "comeback-commander",
      evaluationMode,
      game1WinnerRegistrationId: evidence.game1WinnerRegistrationId,
      seriesWinnerRegistrationId: evidence.seriesWinnerRegistrationId,
      seriesBestOf: evidence.seriesBestOf,
      finalizedGameCount: evidence.finalizedGameCount,
      originalUnlockedAtBasis: "official_series_result_decided_at",
    },
  });

  return {
    createdCount: created ? 1 : 0,
    createdSlugs: created ? ["comeback-commander"] : [],
    evaluatedSlugs: ["comeback-commander"],
    skippedReasons: created ? [] : ["award_already_exists"],
  };
}

async function evaluateMatchCountBadgeAwardsForPlayer({
  playerId,
  supabase,
  evaluationMode,
}: {
  playerId: string;
  supabase: BadgeAuthorityClient;
  evaluationMode: BadgeEvaluationMode;
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
      evaluationMode,
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

export async function evaluateMatchExcellenceBadgeAwardsForPlayer({
  playerId,
  supabase = createSupabaseAdminClient(),
  evaluationMode = "live",
}: {
  playerId: string;
  supabase?: BadgeAuthorityClient;
  evaluationMode?: BadgeEvaluationMode;
}): Promise<BadgeAwardEvaluationResult> {
  const summary = await loadMatchExcellenceBadgeSummary(supabase, playerId);
  if (!summary) {
    return {
      ...EMPTY_EVALUATION_RESULT,
      evaluatedSlugs: MATCH_EXCELLENCE_THRESHOLDS.map(
        (threshold) => threshold.badgeSlug
      ),
      skippedReasons: ["match_excellence_summary_unavailable"],
    };
  }

  const createdSlugs: ProductionBadgeAuthoritySlug[] = [];
  const skippedReasons: string[] = [];

  for (const threshold of MATCH_EXCELLENCE_THRESHOLDS) {
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

    if (threshold.evaluator === "win-streak" && !originalUnlockedAt) {
      skippedReasons.push(`${threshold.badgeSlug}_timestamp_missing`);
      continue;
    }

    const created = await persistBadgeAward(supabase, {
      playerId,
      badgeSlug: threshold.badgeSlug,
      sourceType: "match",
      sourceId,
      originalUnlockedAt,
      evaluationMode,
      sourceMetadata: {
        evaluator: threshold.evaluator,
        evaluationMode,
        threshold: threshold.threshold,
        qualifyingCount,
        upsetEloDelta: threshold.upsetEloDeltaKey
          ? summary[threshold.upsetEloDeltaKey]
          : null,
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
    evaluatedSlugs: MATCH_EXCELLENCE_THRESHOLDS.map(
      (threshold) => threshold.badgeSlug
    ),
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
  const candidates = await loadBackfillPlayerIds(supabase, playerIds);
  const badgeCounts = Object.fromEntries(
    PRODUCTION_BADGE_AUTHORITY_SLUGS.map((slug) => [slug, 0])
  ) as Record<ProductionBadgeAuthoritySlug, number>;
  const errors: BadgeBackfillResult["errors"] = [];

  for (const playerId of candidates) {
    try {
      const result = await evaluateAllBadgeAwardsForPlayer({
        playerId,
        supabase,
        evaluationMode: "backfill",
      });

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

export async function evaluateAllBadgeAwardsForPlayer({
  playerId,
  supabase = createSupabaseAdminClient(),
  evaluationMode = "live",
}: {
  playerId: string;
  supabase?: BadgeAuthorityClient;
  evaluationMode?: BadgeEvaluationMode;
}): Promise<BadgeAwardEvaluationResult> {
  if (!(await isOpenBadgePlayer(supabase, playerId))) {
    return {
      ...EMPTY_EVALUATION_RESULT,
      evaluatedSlugs: [...PRODUCTION_BADGE_AUTHORITY_SLUGS],
      skippedReasons: ["player_closed_or_unavailable"],
    };
  }

  const result = mergeEvaluationResults([
    await evaluateProfileBadgeAwards({
      playerId,
      supabase,
      evaluationMode,
    }),
    await evaluateMatchBadgeAwardsForPlayer({
      playerId,
      supabase,
      evaluationMode,
    }),
    await evaluateTournamentBadgeAwardsForPlayer({
      playerId,
      supabase,
      evaluationMode,
    }),
    await evaluateSeasonBadgeAwardsForPlayer({
      playerId,
      supabase,
      evaluationMode,
    }),
  ]);

  if (evaluationMode === "reconciliation") {
    try {
      const notificationResult =
        await reconcileBadgeUnlockedNotificationsForPlayer(playerId);

      if (!notificationResult.succeeded) {
        throw new BadgeAuthorityError(
          notificationResult.errorCode,
          "Badge notification reconciliation is incomplete."
        );
      }
    } catch (error) {
      if (error instanceof BadgeAuthorityError) {
        throw error;
      }

      throw new BadgeAuthorityError(
        "BADGE_NOTIFICATION_RECONCILIATION_FAILED",
        "Badge notification reconciliation failed unexpectedly."
      );
    }
  }

  return result;
}

async function loadBackfillPlayerIds(
  supabase: BadgeAuthorityClient,
  requestedPlayerIds?: readonly string[]
) {
  const uniqueRequestedIds = requestedPlayerIds
    ? [...new Set(requestedPlayerIds.filter((value) => value.length > 0))]
    : null;

  if (uniqueRequestedIds?.length === 0) {
    return [];
  }

  let query = supabase
    .from("players")
    .select("id")
    .is("account_closed_at", null);

  query = uniqueRequestedIds
    ? query.in("id", uniqueRequestedIds)
    : query.order("created_at", { ascending: true });

  const { data, error } = await query;

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

async function loadReliableCompetitorBadgeSummary(
  supabase: BadgeAuthorityClient,
  playerId: string
) {
  const { data, error } = await supabase.rpc(
    "get_player_badge_reliable_competitor_summary",
    {
      p_player_id: playerId,
    }
  );

  if (error) {
    throw new BadgeAuthorityError(
      "RELIABLE_COMPETITOR_SUMMARY_LOAD_FAILED",
      "Badge reliability evaluation could not load participant authority."
    );
  }

  const row = rowsOf<ReliableCompetitorSummaryRow>(data)[0];
  if (!row) {
    return null;
  }

  return {
    bestRun: integerOrZero(row.best_run),
    tenthMatchId: stringOrNull(row.tenth_match_id),
    tenthAt: isoOrNull(row.tenth_at),
  };
}

async function loadComebackCommanderBadgeSummary(
  supabase: BadgeAuthorityClient,
  playerId: string
) {
  const { data, error } = await supabase.rpc(
    "get_player_badge_comeback_commander_summary",
    {
      p_player_id: playerId,
    }
  );

  if (error) {
    throw new BadgeAuthorityError(
      "COMEBACK_COMMANDER_SUMMARY_LOAD_FAILED",
      "Badge comeback evaluation could not load durable game authority."
    );
  }

  return rowsOf<ComebackCommanderSummaryRow>(data)
    .map((row) => ({
      matchId: stringOrNull(row.match_id),
      game1WinnerRegistrationId: stringOrNull(
        row.game1_winner_registration_id
      ),
      seriesWinnerRegistrationId: stringOrNull(
        row.series_winner_registration_id
      ),
      seriesBestOf: integerOrNull(row.series_best_of),
      finalizedGameCount: integerOrNull(row.finalized_game_count),
      finalizedAt: isoOrNull(row.finalized_at),
    }))
    .filter(
      (row): row is {
        matchId: string;
        game1WinnerRegistrationId: string;
        seriesWinnerRegistrationId: string;
        seriesBestOf: number;
        finalizedGameCount: number;
        finalizedAt: string;
      } =>
        row.matchId !== null &&
        row.game1WinnerRegistrationId !== null &&
        row.seriesWinnerRegistrationId !== null &&
        row.seriesBestOf !== null &&
        row.finalizedGameCount !== null &&
        row.finalizedAt !== null
    );
}

async function loadMatchExcellenceBadgeSummary(
  supabase: BadgeAuthorityClient,
  playerId: string
) {
  const { data, error } = await supabase.rpc(
    "get_player_badge_match_excellence_summary",
    {
      p_player_id: playerId,
    }
  );

  if (error) {
    throw new BadgeAuthorityError(
      "MATCH_EXCELLENCE_SUMMARY_LOAD_FAILED",
      "Badge match evaluation could not load the match excellence summary."
    );
  }

  const row = rowsOf<MatchExcellenceSummaryRow>(data)[0];
  if (!row) {
    return null;
  }

  return {
    bestWinStreak: integerOrZero(row.best_win_streak),
    thirdStreakMatchId: stringOrNull(row.third_streak_match_id),
    thirdStreakAt: isoOrNull(row.third_streak_at),
    fifthStreakMatchId: stringOrNull(row.fifth_streak_match_id),
    fifthStreakAt: isoOrNull(row.fifth_streak_at),
    cleanSweepCount: integerOrZero(row.clean_sweep_count),
    firstCleanSweepMatchId: stringOrNull(row.first_clean_sweep_match_id),
    firstCleanSweepAt: isoOrNull(row.first_clean_sweep_at),
    upsetWinCount: integerOrZero(row.upset_win_count),
    firstUpsetMatchId: stringOrNull(row.first_upset_match_id),
    firstUpsetAt: isoOrNull(row.first_upset_at),
    firstUpsetEloDelta: integerOrNull(row.first_upset_elo_delta),
    thirdUpsetMatchId: stringOrNull(row.third_upset_match_id),
    thirdUpsetAt: isoOrNull(row.third_upset_at),
    thirdUpsetEloDelta: integerOrNull(row.third_upset_elo_delta),
  };
}

async function loadPlayedMatchParticipantPlayerIds(
  supabase: BadgeAuthorityClient,
  matchId: string
) {
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

  return [
    ...new Set(
      rowsOf<MatchBadgeParticipantRow>(data)
        .map((row) => stringOrNull(row.player_id))
        .filter((value): value is string => value !== null)
    ),
  ];
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

async function loadTournamentBracketProgressionSummary(
  supabase: BadgeAuthorityClient,
  playerId: string
) {
  const { data, error } = await supabase.rpc(
    "get_player_badge_bracket_progression_summary",
    {
      p_player_id: playerId,
    }
  );

  if (error) {
    throw new BadgeAuthorityError(
      "BRACKET_PROGRESSION_SUMMARY_LOAD_FAILED",
      "Badge bracket progression evaluation could not load the participation summary."
    );
  }

  const row = rowsOf<TournamentBracketProgressionSummaryRow>(data)[0];
  if (!row) {
    return null;
  }

  return {
    originalBracket: stringOrNull(row.original_bracket),
    originalTournamentId: stringOrNull(row.original_tournament_id),
    originalCompletedAt: isoOrNull(row.original_completed_at),
    higherBracket: stringOrNull(row.higher_bracket),
    higherTournamentId: stringOrNull(row.higher_tournament_id),
    higherCompletedAt: isoOrNull(row.higher_completed_at),
  };
}

async function loadTournamentPrestigeBadgeSummary(
  supabase: BadgeAuthorityClient,
  playerId: string
) {
  const { data, error } = await supabase.rpc(
    "get_player_badge_tournament_prestige_summary",
    {
      p_player_id: playerId,
    }
  );

  if (error) {
    throw new BadgeAuthorityError(
      "TOURNAMENT_PRESTIGE_SUMMARY_LOAD_FAILED",
      "Badge tournament evaluation could not load the tournament prestige summary."
    );
  }

  const row = rowsOf<TournamentPrestigeSummaryRow>(data)[0];
  if (!row) {
    return null;
  }

  return {
    playedAdvanceWinCount: integerOrZero(row.played_advance_win_count),
    firstAdvanceMatchId: stringOrNull(row.first_advance_match_id),
    firstAdvanceAt: isoOrNull(row.first_advance_at),
    semifinalistCount: integerOrZero(row.semifinalist_count),
    firstSemifinalTournamentId: stringOrNull(
      row.first_semifinal_tournament_id
    ),
    firstSemifinalAt: isoOrNull(row.first_semifinal_at),
    finalistCount: integerOrZero(row.finalist_count),
    firstFinalistTournamentId: stringOrNull(row.first_finalist_tournament_id),
    firstFinalistAt: isoOrNull(row.first_finalist_at),
    academyChampionshipCount: integerOrZero(
      row.academy_championship_count
    ),
    firstAcademyChampionshipTournamentId: stringOrNull(
      row.first_academy_championship_tournament_id
    ),
    firstAcademyChampionshipAt: isoOrNull(
      row.first_academy_championship_at
    ),
    challengeChampionshipCount: integerOrZero(
      row.challenge_championship_count
    ),
    firstChallengeChampionshipTournamentId: stringOrNull(
      row.first_challenge_championship_tournament_id
    ),
    firstChallengeChampionshipAt: isoOrNull(
      row.first_challenge_championship_at
    ),
    mainChampionshipCount: integerOrZero(row.main_championship_count),
    firstMainChampionshipTournamentId: stringOrNull(
      row.first_main_championship_tournament_id
    ),
    firstMainChampionshipAt: isoOrNull(row.first_main_championship_at),
    championshipCount: integerOrZero(row.championship_count),
    secondChampionshipTournamentId: stringOrNull(
      row.second_championship_tournament_id
    ),
    secondChampionshipAt: isoOrNull(row.second_championship_at),
    tripleCrownBracketCount: integerOrZero(row.triple_crown_bracket_count),
    tripleCrownTournamentId: stringOrNull(row.triple_crown_tournament_id),
    tripleCrownAt: isoOrNull(row.triple_crown_at),
  };
}

async function loadFlawlessCampaignBadgeSummary(
  supabase: BadgeAuthorityClient,
  playerId: string
) {
  const { data, error } = await supabase.rpc(
    "get_player_badge_flawless_campaign_summary",
    {
      p_player_id: playerId,
    }
  );

  if (error) {
    throw new BadgeAuthorityError(
      "FLAWLESS_CAMPAIGN_SUMMARY_LOAD_FAILED",
      "Badge tournament evaluation could not load flawless campaign authority."
    );
  }

  return rowsOf<FlawlessCampaignSummaryRow>(data)
    .map((row) => ({
      tournamentId: stringOrNull(row.tournament_id),
      registrationId: stringOrNull(row.registration_id),
      firstCompletedAt: isoOrNull(row.first_completed_at),
      expectedPathSegmentCount: integerOrZero(
        row.expected_path_segment_count
      ),
      playedSegmentCount: integerOrZero(row.played_segment_count),
      automaticByeCount: integerOrZero(row.automatic_bye_count),
      opponentNoShowCount: integerOrZero(row.opponent_no_show_count),
      verifiedGameCount: integerOrZero(row.verified_game_count),
    }))
    .filter(
      (row): row is typeof row & {
        tournamentId: string;
      } => row.tournamentId !== null
    );
}

async function loadFinalizedSeasonIdForTournament(
  supabase: BadgeAuthorityClient,
  tournamentId: string
) {
  const { data, error } = await supabase.rpc(
    "get_player_badge_finalized_season_for_tournament",
    {
      p_tournament_id: tournamentId,
    }
  );

  if (error) {
    throw new BadgeAuthorityError(
      "TOURNAMENT_SEASON_LOAD_FAILED",
      "Badge season evaluation could not load the tournament season."
    );
  }

  return stringOrNull(
    rowsOf<SeasonBadgeForTournamentRow>(data)[0]?.season_id
  );
}

async function loadSeasonBadgeParticipantPlayerIds(
  supabase: BadgeAuthorityClient,
  seasonId: string
) {
  const { data, error } = await supabase.rpc(
    "get_player_badge_season_authority_participants",
    {
      p_season_id: seasonId,
    }
  );

  if (error) {
    throw new BadgeAuthorityError(
      "SEASON_PARTICIPANTS_LOAD_FAILED",
      "Badge season evaluation could not load participants."
    );
  }

  return [
    ...new Set(
      rowsOf<SeasonBadgeParticipantRow>(data)
        .map((row) => stringOrNull(row.player_id))
        .filter((value): value is string => value !== null)
    ),
  ];
}

async function loadSeasonBadgeSummary(
  supabase: BadgeAuthorityClient,
  playerId: string
) {
  const { data, error } = await supabase.rpc(
    "get_player_badge_season_summary",
    {
      p_player_id: playerId,
    }
  );

  if (error) {
    throw new BadgeAuthorityError(
      "SEASON_SUMMARY_LOAD_FAILED",
      "Badge season evaluation could not load the season summary."
    );
  }

  const row = rowsOf<SeasonBadgeSummaryRow>(data)[0];
  if (!row) {
    return null;
  }

  return {
    seasonCampaignerCount: integerOrZero(row.season_campaigner_count),
    firstSeasonCampaignerSeasonId: stringOrNull(
      row.first_season_campaigner_season_id
    ),
    firstSeasonCampaignerAt: isoOrNull(row.first_season_campaigner_at),
    firstSeasonCampaignerThresholdTournamentId: stringOrNull(
      row.first_season_campaigner_threshold_tournament_id
    ),
    firstSeasonCampaignerTournamentCount: integerOrZero(
      row.first_season_campaigner_tournament_count
    ),
    podiumFinishCount: integerOrZero(row.podium_finish_count),
    firstPodiumSeasonId: stringOrNull(row.first_podium_season_id),
    firstPodiumAt: isoOrNull(row.first_podium_at),
    firstPodiumRank: integerOrNull(row.first_podium_rank),
    championFinishCount: integerOrZero(row.champion_finish_count),
    firstChampionSeasonId: stringOrNull(row.first_champion_season_id),
    firstChampionAt: isoOrNull(row.first_champion_at),
    firstChampionRank: integerOrNull(row.first_champion_rank),
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
  // Public evaluator entry points can be called directly after a current
  // platform commit. Keep the account-closure boundary at the final shared
  // ownership write as well as in reconciliation/backfill discovery.
  if (!(await isOpenBadgePlayer(supabase, input.playerId))) {
    return false;
  }

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

  const createdAward = firstRecord(data);
  if (!createdAward) {
    return false;
  }

  const awardId = stringOrNull(createdAward.id);
  if (!awardId) {
    throw new BadgeAuthorityError(
      "AWARD_RESULT_INVALID",
      "Badge award persistence returned an invalid result."
    );
  }

  if (input.evaluationMode !== "backfill") {
    let notificationCreated = false;

    try {
      notificationCreated = await createBadgeUnlockedNotification({
        awardId,
        playerId: input.playerId,
        badgeSlug: input.badgeSlug,
      });
    } catch {
      // Ownership is already committed. The caller will enqueue bounded
      // reconciliation instead of rolling back the valid core operation.
    }

    if (!notificationCreated) {
      throw new BadgeAuthorityError(
        "AWARD_NOTIFICATION_PENDING",
        "Badge notification requires reconciliation."
      );
    }
  }

  return true;
}

function isIronCladRecruitQualified(player: {
  account_closed_at: string | null;
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
    player.account_closed_at === null &&
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
    account_closed_at: stringOrNull(row.account_closed_at),
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

async function isOpenBadgePlayer(
  supabase: BadgeAuthorityClient,
  playerId: string
) {
  const { data, error } = await supabase
    .from("players")
    .select("id, account_closed_at")
    .eq("id", playerId)
    .maybeSingle();

  if (error) {
    throw new BadgeAuthorityError(
      "PLAYER_STATUS_LOAD_FAILED",
      "Badge evaluation could not verify the player account status."
    );
  }

  if (data === null) {
    return false;
  }

  if (!isRecord(data) || Array.isArray(data)) {
    throw new BadgeAuthorityError(
      "PLAYER_STATUS_RESULT_INVALID",
      "Badge evaluation received an invalid player account status."
    );
  }

  const resolvedPlayerId = stringOrNull(data.id);
  const accountClosedAt = data.account_closed_at;

  if (
    resolvedPlayerId !== playerId ||
    (accountClosedAt !== null && isoOrNull(accountClosedAt) === null)
  ) {
    throw new BadgeAuthorityError(
      "PLAYER_STATUS_RESULT_INVALID",
      "Badge evaluation received an invalid player account status."
    );
  }

  return accountClosedAt === null;
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
