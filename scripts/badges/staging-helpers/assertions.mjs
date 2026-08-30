import {
  createFixturePlayer,
  expectAward,
  expectedAwardsForPlayer,
} from "./fixtures.mjs";
import {
  recordActualAward,
  recordCorrectionAssertion,
  recordIdempotencyAssertion,
  recordNegativeAssertion,
  recordScenario,
  recordSecurityAssertion,
  recordUnexpectedAwards,
} from "./manifest.mjs";
import { assertMutationGateOpen } from "./project-guard.mjs";
import {
  loadMatch,
  loadMatchAuthority,
  resetMatch,
  scoreForWinner,
  submitAndConfirmMatchResult,
  submitPerGameReportGroupAndConfirm,
  voidTournament,
} from "./matches.mjs";
import {
  createAndPlayTournament,
  createTournamentDivision,
  gameWinnersForScore,
  loadGeneratedMatches,
  loadTournament,
  recalculateTournament,
} from "./tournament.mjs";
import {
  loadSeason,
  loadSeasonForTournament,
  loadSeasonStandings,
  recalculateSeason,
} from "./seasons.mjs";
import {
  evaluateProductionBadges,
  evaluatorTouchedSlug,
} from "./production-evaluator.mjs";
import {
  FLAWLESS_AUTOMATIC_BYE_PHASE_ONE,
  FLAWLESS_AUTOMATIC_BYE_SCENARIO,
  runFlawlessAutomaticByePhaseOne,
  runFlawlessAutomaticByePhaseTwo,
} from "./flawless-campaign.mjs";

export const COVERAGE_CLASSIFICATIONS = Object.freeze([
  "REAL E2E",
  "PARTIAL",
  "SIMULATED",
  "BROKEN",
]);

const BADGE_RUNTIME_METADATA = Object.freeze({
  "flawless-campaign": {
    classification: "REAL E2E",
    limitations: [],
    positiveCases: [
      "flawless-clean-champion-positive",
      "flawless-no-show-positive",
      FLAWLESS_AUTOMATIC_BYE_SCENARIO,
    ],
    negativeCases: [
      "flawless-one-game-loss",
      "flawless-admin-default",
      "flawless-incomplete-championship-path",
      "flawless-reset-invalidated-evidence",
      "flawless-void-invalidated-evidence",
    ],
  },
});

export const BADGE_SCENARIOS = Object.freeze([
  row(1, "IronClad Recruit", "ironclad-recruit", "PROFILE", "profile-positive", "profile-negative", "evaluateProfileBadgeAwards", "players trigger + profile row"),
  row(2, "First Deployment", "first-deployment", "MATCH", "first-deployment-positive", "zero-played-matches", "evaluateMatchBadgeAwardsForPlayer", "match participant authority"),
  row(3, "First Victory", "first-victory", "MATCH", "first-victory-positive", "played-loss", "evaluateMatchBadgeAwardsForReportGroup", "match participant authority"),
  row(4, "Battle Tested", "battle-tested", "MATCH", "battle-tested-exact", "nine-victories", "evaluateMatchBadgeAwardsForPlayer", "match threshold RPC"),
  row(5, "Rising Through the Ranks", "rising-through-the-ranks", "TOURNAMENT", "rising-through-ranks-positive", "same-bracket-history", "evaluateTournamentBadgeAwardsForPlayer", "tournament bracket progression RPC"),
  row(6, "First Campaign", "first-campaign", "TOURNAMENT", "first-campaign-exact", "launched-incomplete-tournament", "evaluateTournamentBadgeAwardsForTournament", "leaderboard participation events"),
  row(7, "Iron Regular", "iron-regular", "TOURNAMENT", "iron-regular-exact", "two-completed-tournaments", "evaluateTournamentBadgeAwardsForPlayer", "tournament count RPC"),
  row(8, "Tournament Veteran", "tournament-veteran", "TOURNAMENT", "tournament-veteran-exact", "nine-completed-tournaments", "evaluateTournamentBadgeAwardsForPlayer", "tournament count RPC"),
  row(9, "Season Campaigner", "season-campaigner", "SEASON", "career-positive", "active-season-under-threshold", "evaluateSeasonBadgeAwardsForSeason", "season recalculation tables"),
  row(10, "Reliable Competitor", "reliable-competitor", "MATCH", "reliable-competitor-exact", "nine-victories", "evaluateReliableCompetitorBadgeAwardsForPlayer", "participant outcome authority"),
  row(11, "Five Victories", "five-victories", "MATCH", "five-victories-exact", "four-victories", "evaluateMatchBadgeAwardsForPlayer", "match threshold RPC"),
  row(12, "Ten Victories", "ten-victories", "MATCH", "ten-victories-exact", "nine-victories", "evaluateMatchBadgeAwardsForPlayer", "match threshold RPC"),
  row(13, "Twenty-Five Victories", "twenty-five-victories", "MATCH", "twenty-five-victories-exact", "twenty-four-victories", "evaluateMatchBadgeAwardsForPlayer", "match threshold RPC"),
  row(14, "Iron Streak", "iron-streak", "MATCH", "iron-streak-exact", "two-win-streak", "evaluateMatchExcellenceBadgeAwardsForPlayer", "match excellence RPC"),
  row(15, "Unbroken", "unbroken", "MATCH", "unbroken-exact", "four-win-streak-then-loss", "evaluateMatchExcellenceBadgeAwardsForPlayer", "match excellence RPC"),
  row(16, "Clean Sweep", "clean-sweep", "MATCH", "clean-sweep-bo3-positive", "clean-sweep-2-1", "evaluateMatchExcellenceBadgeAwardsForPlayer", "game result authority"),
  row(17, "Comeback Commander", "comeback-commander", "MATCH", "comeback-positive", "comeback-no-game1-loss", "evaluateComebackCommanderBadgeAwardsForPlayer", "game result authority"),
  row(18, "Giant Slayer", "giant-slayer", "MATCH", "giant-positive", "giant-plus-199", "evaluateMatchExcellenceBadgeAwardsForPlayer", "registration ELO snapshots"),
  row(19, "Giant Hunter", "giant-hunter", "MATCH", "giant-positive", "giant-two-upsets", "evaluateMatchExcellenceBadgeAwardsForPlayer", "registration ELO snapshots"),
  row(20, "Flawless Campaign", "flawless-campaign", "CHAMPIONSHIP", "flawless-clean-champion-positive", "flawless-one-game-loss", "evaluateFlawlessCampaignBadgeAwardsForPlayer", "championship path + game authority"),
  row(21, "First Advance", "first-advance", "CHAMPIONSHIP", "career-positive", "first-round-exit", "evaluateTournamentPrestigeBadgeAwardsForPlayer", "leaderboard point events"),
  row(22, "Semifinalist", "semifinalist", "CHAMPIONSHIP", "career-positive", "first-round-exit", "evaluateTournamentPrestigeBadgeAwardsForPlayer", "leaderboard point events"),
  row(23, "Finalist", "finalist", "CHAMPIONSHIP", "career-positive", "semifinal-exit", "evaluateTournamentPrestigeBadgeAwardsForPlayer", "leaderboard point events"),
  row(24, "Academy Champion", "academy-champion", "CHAMPIONSHIP", "career-positive", "academy-finalist-loss", "evaluateTournamentPrestigeBadgeAwardsForPlayer", "tournament_win event"),
  row(25, "Challenge Champion", "challenge-champion", "CHAMPIONSHIP", "career-positive", "challenge-finalist-loss", "evaluateTournamentPrestigeBadgeAwardsForPlayer", "tournament_win event"),
  row(26, "Elite Champion", "elite-champion", "CHAMPIONSHIP", "career-positive", "main-finalist-loss", "evaluateTournamentPrestigeBadgeAwardsForPlayer", "tournament_win event"),
  row(27, "Double Champion", "double-champion", "CHAMPIONSHIP", "career-positive", "one-championship", "evaluateTournamentPrestigeBadgeAwardsForPlayer", "tournament_win event"),
  row(28, "Triple Crown", "triple-crown", "CHAMPIONSHIP", "career-positive", "two-bracket-championships", "evaluateTournamentPrestigeBadgeAwardsForPlayer", "tournament_win event"),
  row(29, "Season Podium", "season-podium", "SEASON", "career-positive", "season-rank-four", "evaluateSeasonBadgeAwardsForPlayer", "finalized season stats"),
  row(30, "Season Champion", "season-champion", "SEASON", "career-positive", "season-rank-two", "evaluateSeasonBadgeAwardsForPlayer", "season champion authority"),
]);

const CAREER_POSITIVE_BADGES = Object.freeze([
  "ironclad-recruit",
  "first-deployment",
  "first-victory",
  "battle-tested",
  "rising-through-the-ranks",
  "first-campaign",
  "iron-regular",
  "tournament-veteran",
  "season-campaigner",
  "reliable-competitor",
  "five-victories",
  "ten-victories",
  "twenty-five-victories",
  "iron-streak",
  "unbroken",
  "clean-sweep",
  "flawless-campaign",
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
]);

export function printScenarioPlan() {
  console.log("Planned badge scenarios:");
  for (const scenario of BADGE_SCENARIOS) {
    console.log(
      `${String(scenario.number).padStart(2, "0")} ${scenario.name.padEnd(26)} + ${scenario.positive}; - ${scenario.negative}`
    );
  }
  console.log("");
  console.log(`Expected canonical badge fixtures: ${BADGE_SCENARIOS.length}`);
  console.log("Planned mutation phases when --apply is supplied:");
  console.log("- fixture identities and legal registration prerequisites");
  console.log("- tournament creation, registration review, bracket generation, map pools, launch");
  console.log("- production result report groups, no-shows, admin results, resets, voids");
  console.log("- leaderboard tournament and season recalculation");
  console.log("- real production badge evaluator exports from lib/badges/authority.ts");
  console.log("- independent player_badge_awards reads for assertions");
  console.log("");
}

export async function runAppliedBadgeScenarioSuite(ctx) {
  assertMutationGateOpen(ctx);

  const report = createRunReport();

  assertScenarioRegistryComplete();

  await runProfileScenarios(ctx, report);
  await runPositiveBoundaryScenarios(ctx, report);
  const career = await runCareerScenario(ctx, report);
  await runMatchBoundaryScenarios(ctx, report);
  await runTournamentBoundaryScenarios(ctx, report);
  await runSeasonBoundaryScenarios(ctx, report, career);
  await runFlawlessBoundaryScenarios(ctx, report, career);
  await runFlawlessIncompletePathScenario(ctx, report);
  await runFlawlessResetInvalidationScenario(ctx, report);
  await runFlawlessVoidInvalidationScenario(ctx, report);
  await runIdempotencyAssertions(ctx, report, career);
  await runCorrectionAssertions(ctx, report);
  await runSecurityAssertions(ctx, report);
  await assertNoDuplicateAwards(ctx, report);
  await assertNoUnexpectedAwards(ctx, report);
  assertAllRowsCovered(report);
  assertNoKnownLimitations(report);

  report.overall = "PASS";
  return report;
}

export function createRunReport() {
  return {
    badgeResults: BADGE_SCENARIOS.map((scenario) => ({
      ...scenario,
      positiveStatus: "PENDING",
      negativeStatus: "PENDING",
      status: "PENDING",
    })),
    positivePass: 0,
    positiveTotal: 0,
    negativePass: 0,
    negativeTotal: 0,
    idempotency: "PENDING",
    corrections: "PENDING",
    security: "PENDING",
    duplicateAwards: "PENDING",
    unexpectedAwards: 0,
    limitations: [],
    overall: "PENDING",
  };
}

export function printHumanReport({ targetContext, runMarker, report }) {
  console.log("BADGE STAGING E2E");
  console.log("=================");
  console.log("");
  console.log("Environment:");
  console.log(targetContext.project.name);
  console.log("");
  console.log("Project:");
  console.log(targetContext.project.ref);
  console.log("");
  console.log("Run:");
  console.log(runMarker);
  console.log("");
  console.log("BADGES");
  for (const badge of report.badgeResults) {
    console.log(
      `${String(badge.number).padStart(2, "0")} ${badge.name.padEnd(24)} ${badge.status}`
    );
  }
  console.log("");
  console.log(`Positive badge assertions: ${report.positivePass}/${report.positiveTotal}`);
  console.log(`Negative badge assertions: ${report.negativePass}/${report.negativeTotal}`);
  console.log("");
  console.log(`Idempotency: ${report.idempotency}`);
  console.log(`Corrections: ${report.corrections}`);
  console.log(`Security: ${report.security}`);
  console.log(`Duplicate awards: ${report.duplicateAwards}`);
  console.log("");
  console.log(`Unexpected awards: ${report.unexpectedAwards}`);
  if (report.limitations.length > 0) {
    console.log("");
    console.log("LIMITATIONS");
    for (const limitation of report.limitations) {
      console.log(`- ${limitation}`);
    }
  }
  console.log("");
  console.log("Overall:");
  console.log(report.overall);
}

async function runProfileScenarios(ctx, report) {
  const positive = await createFixturePlayer(ctx, {
    label: "profile-positive",
    expectProfileCompleted: true,
  });
  await assertNoPreexistingAward(ctx, positive.id, "ironclad-recruit", "profile-positive");
  await evaluateProductionBadges(ctx, {
    kind: "profile",
    playerId: positive.id,
    scenario: "profile-positive",
  });
  expectAward(ctx, positive.id, "ironclad-recruit", "profile-positive");
  await assertBadgeAward(ctx, report, {
    playerId: positive.id,
    badgeSlug: "ironclad-recruit",
    expected: true,
    scenario: "profile-positive",
  });

  const negative = await createFixturePlayer(ctx, {
    label: "profile-negative",
    avatarUrl: null,
    verified: false,
    expectProfileCompleted: false,
  });
  await assertNoPreexistingAward(ctx, negative.id, "ironclad-recruit", "profile-negative");
  await evaluateProductionBadges(ctx, {
    kind: "profile",
    playerId: negative.id,
    scenario: "profile-negative",
  });
  await assertBadgeAward(ctx, report, {
    playerId: negative.id,
    badgeSlug: "ironclad-recruit",
    expected: false,
    scenario: "profile-negative",
  });
}

async function runPositiveBoundaryScenarios(ctx, report) {
  await runMatchPositiveBoundaries(ctx, report);
  await runTournamentPositiveBoundaries(ctx, report);
  await runCleanSweepPositiveBoundaries(ctx, report);
}

async function runMatchPositiveBoundaries(ctx, report) {
  const firstWin = await createFixturePlayer(ctx, {
    label: "first-deployment-positive",
    bracketName: "Challenge",
  });
  await assertNoPreexistingAwards(
    ctx,
    firstWin.id,
    ["first-deployment", "first-victory"],
    "first-deployment-positive"
  );
  await playFirstMatchOnly(ctx, {
    label: "first-deployment-positive",
    players: [firstWin],
    winnerIndex: 0,
    scenario: "first-deployment-positive",
  });
  allowExpectedAwards(ctx, firstWin.id, [
    "first-deployment",
    "first-victory",
    "clean-sweep",
  ], "first-deployment-positive-side-effects");
  await assertBadgeAward(ctx, report, {
    playerId: firstWin.id,
    badgeSlug: "first-deployment",
    expected: true,
    scenario: "first-deployment-positive",
  });
  await evaluateProductionBadges(ctx, {
    kind: "player",
    playerId: firstWin.id,
    scenario: "first-victory-positive",
  });
  await assertBadgeAward(ctx, report, {
    playerId: firstWin.id,
    badgeSlug: "first-victory",
    expected: true,
    scenario: "first-victory-positive",
  });

  const fiveWins = await createFixturePlayer(ctx, {
    label: "five-victories-exact",
    bracketName: "Challenge",
  });
  await assertNoPreexistingAward(
    ctx,
    fiveWins.id,
    "five-victories",
    "five-victories-exact"
  );
  await playExactWins(ctx, fiveWins, 5, "five-victories-exact");
  allowExpectedAwards(ctx, fiveWins.id, [
    "first-deployment",
    "first-victory",
    "first-campaign",
    "five-victories",
    "iron-streak",
    "clean-sweep",
    "flawless-campaign",
    "first-advance",
    "semifinalist",
    "finalist",
    "challenge-champion",
  ], "five-victories-exact-side-effects");
  await assertBadgeAward(ctx, report, {
    playerId: fiveWins.id,
    badgeSlug: "five-victories",
    expected: true,
    scenario: "five-victories-exact",
  });

  const tenWins = await createFixturePlayer(ctx, {
    label: "ten-victories-exact",
    bracketName: "Challenge",
  });
  await assertNoPreexistingAwards(
    ctx,
    tenWins.id,
    ["battle-tested", "ten-victories", "reliable-competitor"],
    "ten-victories-exact"
  );
  await playExactWins(ctx, tenWins, 10, "ten-victories-exact");
  allowExpectedAwards(ctx, tenWins.id, [
    "first-deployment",
    "first-victory",
    "battle-tested",
    "first-campaign",
    "iron-regular",
    "reliable-competitor",
    "five-victories",
    "ten-victories",
    "iron-streak",
    "unbroken",
    "clean-sweep",
    "challenge-champion",
    "double-champion",
    "flawless-campaign",
    "first-advance",
    "semifinalist",
    "finalist",
  ], "ten-victories-exact-side-effects");
  await evaluateProductionBadges(ctx, {
    kind: "player",
    playerId: tenWins.id,
    scenario: "battle-tested-exact",
  });
  await assertBadgeAward(ctx, report, {
    playerId: tenWins.id,
    badgeSlug: "battle-tested",
    expected: true,
    scenario: "battle-tested-exact",
  });
  await assertBadgeAward(ctx, report, {
    playerId: tenWins.id,
    badgeSlug: "ten-victories",
    expected: true,
    scenario: "ten-victories-exact",
  });
  await evaluateProductionBadges(ctx, {
    kind: "player",
    playerId: tenWins.id,
    scenario: "reliable-competitor-exact",
  });
  await assertBadgeAward(ctx, report, {
    playerId: tenWins.id,
    badgeSlug: "reliable-competitor",
    expected: true,
    scenario: "reliable-competitor-exact",
  });

  const twentyFiveWins = await createFixturePlayer(ctx, {
    label: "twenty-five-victories-exact",
    bracketName: "Challenge",
  });
  await assertNoPreexistingAward(
    ctx,
    twentyFiveWins.id,
    "twenty-five-victories",
    "twenty-five-victories-exact"
  );
  await playExactWins(ctx, twentyFiveWins, 25, "twenty-five-victories-exact");
  allowExpectedAwards(ctx, twentyFiveWins.id, [
    "first-deployment",
    "first-victory",
    "battle-tested",
    "first-campaign",
    "iron-regular",
    "reliable-competitor",
    "five-victories",
    "ten-victories",
    "twenty-five-victories",
    "iron-streak",
    "unbroken",
    "clean-sweep",
    "challenge-champion",
    "double-champion",
    "flawless-campaign",
    "first-advance",
    "semifinalist",
    "finalist",
  ], "twenty-five-victories-exact-side-effects");
  await assertBadgeAward(ctx, report, {
    playerId: twentyFiveWins.id,
    badgeSlug: "twenty-five-victories",
    expected: true,
    scenario: "twenty-five-victories-exact",
  });

  const threeWinStreak = await createFixturePlayer(ctx, {
    label: "iron-streak-exact",
    bracketName: "Challenge",
  });
  await assertNoPreexistingAward(
    ctx,
    threeWinStreak.id,
    "iron-streak",
    "iron-streak-exact"
  );
  await playExactWins(ctx, threeWinStreak, 3, "iron-streak-exact");
  allowExpectedAwards(ctx, threeWinStreak.id, [
    "first-deployment",
    "first-victory",
    "first-campaign",
    "iron-streak",
    "clean-sweep",
    "flawless-campaign",
    "first-advance",
    "semifinalist",
    "finalist",
    "challenge-champion",
  ], "iron-streak-exact-side-effects");
  await assertBadgeAward(ctx, report, {
    playerId: threeWinStreak.id,
    badgeSlug: "iron-streak",
    expected: true,
    scenario: "iron-streak-exact",
  });

  const fiveWinStreak = await createFixturePlayer(ctx, {
    label: "unbroken-exact",
    bracketName: "Challenge",
  });
  await assertNoPreexistingAward(
    ctx,
    fiveWinStreak.id,
    "unbroken",
    "unbroken-exact"
  );
  await playExactWins(ctx, fiveWinStreak, 5, "unbroken-exact");
  allowExpectedAwards(ctx, fiveWinStreak.id, [
    "first-deployment",
    "first-victory",
    "first-campaign",
    "five-victories",
    "iron-streak",
    "unbroken",
    "clean-sweep",
    "flawless-campaign",
    "first-advance",
    "semifinalist",
    "finalist",
    "challenge-champion",
  ], "unbroken-exact-side-effects");
  await assertBadgeAward(ctx, report, {
    playerId: fiveWinStreak.id,
    badgeSlug: "unbroken",
    expected: true,
    scenario: "unbroken-exact",
  });
}

async function runTournamentPositiveBoundaries(ctx, report) {
  const firstCampaign = await createFixturePlayer(ctx, {
    label: "first-campaign-exact",
    bracketName: "Challenge",
  });
  await assertNoPreexistingAward(
    ctx,
    firstCampaign.id,
    "first-campaign",
    "first-campaign-exact"
  );
  await createAndPlayTournament(ctx, {
    label: "first-campaign-exact",
    bracketName: "Challenge",
    players: [firstCampaign],
    scenario: "first-campaign-exact",
  });
  allowExpectedAwards(ctx, firstCampaign.id, [
    "first-deployment",
    "first-victory",
    "first-campaign",
    "iron-streak",
    "clean-sweep",
    "flawless-campaign",
    "first-advance",
    "semifinalist",
    "finalist",
    "challenge-champion",
  ], "first-campaign-exact-side-effects");
  await assertBadgeAward(ctx, report, {
    playerId: firstCampaign.id,
    badgeSlug: "first-campaign",
    expected: true,
    scenario: "first-campaign-exact",
  });

  const rising = await createFixturePlayer(ctx, {
    label: "rising-through-ranks-positive",
    bracketName: "Academy",
  });
  await assertNoPreexistingAward(
    ctx,
    rising.id,
    "rising-through-the-ranks",
    "rising-through-ranks-positive"
  );
  await createAndPlayTournament(ctx, {
    label: "rising-through-ranks-positive-academy",
    bracketName: "Academy",
    players: [rising],
    scenario: "rising-through-ranks-positive",
  });
  await createAndPlayTournament(ctx, {
    label: "rising-through-ranks-positive-challenge",
    bracketName: "Challenge",
    players: [rising],
    scenario: "rising-through-ranks-positive",
  });
  allowExpectedAwards(ctx, rising.id, [
    "first-deployment",
    "first-victory",
    "first-campaign",
    "five-victories",
    "iron-streak",
    "unbroken",
    "clean-sweep",
    "academy-champion",
    "challenge-champion",
    "double-champion",
    "rising-through-the-ranks",
    "flawless-campaign",
    "first-advance",
    "semifinalist",
    "finalist",
  ], "rising-through-ranks-positive-side-effects");
  await assertBadgeAward(ctx, report, {
    playerId: rising.id,
    badgeSlug: "rising-through-the-ranks",
    expected: true,
    scenario: "rising-through-ranks-positive",
  });

  const ironRegular = await createFixturePlayer(ctx, {
    label: "iron-regular-exact",
    bracketName: "Challenge",
  });
  await assertNoPreexistingAward(
    ctx,
    ironRegular.id,
    "iron-regular",
    "iron-regular-exact"
  );
  for (let index = 0; index < 3; index += 1) {
    await createAndPlayTournament(ctx, {
      label: `iron-regular-exact-${index + 1}`,
      bracketName: "Challenge",
      players: [ironRegular],
      scenario: "iron-regular-exact",
    });
  }
  allowExpectedAwards(ctx, ironRegular.id, [
    "first-deployment",
    "first-victory",
    "first-campaign",
    "iron-regular",
    "five-victories",
    "iron-streak",
    "unbroken",
    "clean-sweep",
    "challenge-champion",
    "double-champion",
    "flawless-campaign",
    "first-advance",
    "semifinalist",
    "finalist",
  ], "iron-regular-exact-side-effects");
  await assertBadgeAward(ctx, report, {
    playerId: ironRegular.id,
    badgeSlug: "iron-regular",
    expected: true,
    scenario: "iron-regular-exact",
  });

  const veteran = await createFixturePlayer(ctx, {
    label: "tournament-veteran-exact",
    bracketName: "Challenge",
  });
  await assertNoPreexistingAward(
    ctx,
    veteran.id,
    "tournament-veteran",
    "tournament-veteran-exact"
  );
  for (let index = 0; index < 10; index += 1) {
    await createAndPlayTournament(ctx, {
      label: `tournament-veteran-exact-${index + 1}`,
      bracketName: "Challenge",
      players: [veteran],
      scenario: "tournament-veteran-exact",
    });
  }
  allowExpectedAwards(ctx, veteran.id, [
    "first-deployment",
    "first-victory",
    "battle-tested",
    "first-campaign",
    "iron-regular",
    "tournament-veteran",
    "reliable-competitor",
    "five-victories",
    "ten-victories",
    "twenty-five-victories",
    "iron-streak",
    "unbroken",
    "clean-sweep",
    "challenge-champion",
    "double-champion",
    "flawless-campaign",
    "first-advance",
    "semifinalist",
    "finalist",
  ], "tournament-veteran-exact-side-effects");
  await assertBadgeAward(ctx, report, {
    playerId: veteran.id,
    badgeSlug: "tournament-veteran",
    expected: true,
    scenario: "tournament-veteran-exact",
  });
}

async function runCleanSweepPositiveBoundaries(ctx, report) {
  const bo3Player = await createFixturePlayer(ctx, {
    label: "clean-sweep-bo3-positive",
    bracketName: "Challenge",
  });
  await assertNoPreexistingAward(
    ctx,
    bo3Player.id,
    "clean-sweep",
    "clean-sweep-bo3-positive"
  );
  const bo3Division = await createTournamentDivision(ctx, {
    label: "clean-sweep-bo3-positive",
    bracketName: "Challenge",
    players: [bo3Player],
  });
  const bo3Match = await firstPlayableMatch(ctx, bo3Division);
  const bo3Winner = bo3Match.player_one_registration_id;
  const bo3Score = scoreForWinner(bo3Match, bo3Winner, 0);
  await submitPerGameReportGroupAndConfirm(ctx, {
    matchId: bo3Match.id,
    winnerRegistrationId: bo3Winner,
    submittedByRegistrationId: bo3Winner,
    ...bo3Score,
    gameWinners: gameWinnersForScore(bo3Match, bo3Winner, 0),
    scenario: "clean-sweep-bo3-positive",
  });
  await assertCleanSweepSeriesEvidence(ctx, {
    matchId: bo3Match.id,
    winnerRegistrationId: bo3Winner,
    expectedSeriesBestOf: 3,
    expectedFinalizedGameCount: 2,
    scenario: "clean-sweep-bo3-positive-evidence",
  });
  allowExpectedAwards(ctx, bo3Player.id, [
    "first-deployment",
    "first-victory",
    "clean-sweep",
  ], "clean-sweep-bo3-positive-side-effects");
  await assertBadgeAward(ctx, report, {
    playerId: bo3Player.id,
    badgeSlug: "clean-sweep",
    expected: true,
    scenario: "clean-sweep-bo3-positive",
  });

  const bo5Player = await createFixturePlayer(ctx, {
    label: "clean-sweep-bo5-positive",
    bracketName: "Challenge",
  });
  await assertNoPreexistingAward(
    ctx,
    bo5Player.id,
    "clean-sweep",
    "clean-sweep-bo5-positive"
  );
  const bo5Tournament = await createAndPlayTournament(ctx, {
    label: "clean-sweep-bo5-positive",
    bracketName: "Challenge",
    players: [bo5Player],
    scenario: "clean-sweep-bo5-positive",
    matchPlan: ({ match }) => {
      if (!participantInMatch(match, bo5Player)) return {};
      const playerRegistrationId = registrationIdForPlayer(match, bo5Player);
      const isFinal =
        String(first(match.bracket_rounds)?.name ?? "").toLowerCase() ===
        "grand final";
      if (!isFinal) {
        return { winnerRegistrationId: playerRegistrationId };
      }
      return {
        mode: "per-game",
        winnerRegistrationId: playerRegistrationId,
        loserScore: 0,
        gameWinners: gameWinnersForScore(match, playerRegistrationId, 0),
      };
    },
  });
  const bo5MatchId = await findCompletedMatchWithSeriesBestOf(
    ctx,
    bo5Tournament.completedMatches,
    5,
    "clean-sweep-bo5-positive"
  );
  await assertCleanSweepSeriesEvidence(ctx, {
    matchId: bo5MatchId,
    winnerRegistrationId: bo5Tournament.championRegistrationId,
    expectedSeriesBestOf: 5,
    expectedFinalizedGameCount: 3,
    scenario: "clean-sweep-bo5-positive-evidence",
  });
  allowExpectedAwards(ctx, bo5Player.id, [
    "first-deployment",
    "first-victory",
    "first-campaign",
    "iron-streak",
    "clean-sweep",
    "flawless-campaign",
    "first-advance",
    "semifinalist",
    "finalist",
    "challenge-champion",
  ], "clean-sweep-bo5-positive-side-effects");
  await assertBadgeAward(ctx, report, {
    playerId: bo5Player.id,
    badgeSlug: "clean-sweep",
    expected: true,
    scenario: "clean-sweep-bo5-positive",
    coverage: false,
  });
}

async function runCareerScenario(ctx, report) {
  const player = await createFixturePlayer(ctx, {
    label: "career-positive",
    bracketName: "Academy",
  });
  const tournaments = [];
  const bracketPlan = [
    "Academy",
    "Challenge",
    "Main",
    "Main",
    "Main",
    "Main",
    "Main",
    "Main",
    "Main",
    "Main",
  ];

  await assertNoPreexistingAwards(
    ctx,
    player.id,
    CAREER_POSITIVE_BADGES,
    "career-positive"
  );
  await evaluateProductionBadges(ctx, {
    kind: "profile",
    playerId: player.id,
    scenario: "career-positive",
  });

  for (const [index, bracketName] of bracketPlan.entries()) {
    const scenario = `career-positive-${index + 1}-${bracketName}`;
    const tournament = await createAndPlayTournament(ctx, {
      label: scenario,
      bracketName,
      players: [player],
      scenario: "career-positive",
    });
    tournaments.push(tournament);
  }

  const latestMain = tournaments.findLast(
    (entry) => entry.bracketName === "Main"
  );
  const seasonId = latestMain
    ? await loadSeasonForTournament(ctx, latestMain.tournament.id)
    : null;
  if (!seasonId) {
    throw new Error("Career scenario did not create a season membership.");
  }
  await recalculateSeason(ctx, seasonId);
  const season = await loadSeason(ctx, seasonId);
  if (!season.finalized_at || season.under_review_at) {
    throw new Error(
      `Career season is not finalized and clear: finalized_at=${season.finalized_at}, under_review_at=${season.under_review_at}`
    );
  }

  await evaluateProductionBadges(ctx, {
    kind: "season",
    seasonId,
    scenario: "career-positive",
  });

  allowExpectedAwards(ctx, player.id, CAREER_POSITIVE_BADGES, "career-positive");
  await assertPositiveSet(ctx, report, player.id, CAREER_POSITIVE_BADGES, "career-positive");

  recordScenario(ctx.manifest, "career-positive", {
    playerId: player.id,
    tournamentIds: tournaments.map((entry) => entry.tournament.id),
    seasonId,
  });

  return { player, tournaments, seasonId };
}

async function runMatchBoundaryScenarios(ctx, report) {
  await runZeroAndLossNegatives(ctx, report);
  await runVictoryThresholdNegatives(ctx, report);
  await runStreakNegatives(ctx, report);
  await runCleanSweepAndComebackBoundaries(ctx, report);
  await runGiantBoundaries(ctx, report);
}

async function runZeroAndLossNegatives(ctx, report) {
  const zero = await createFixturePlayer(ctx, {
    label: "zero-played-matches",
  });
  await assertNoPreexistingAward(ctx, zero.id, "first-deployment", "zero-played-matches");
  await evaluateProductionBadges(ctx, {
    kind: "player",
    playerId: zero.id,
    scenario: "zero-played-matches",
  });
  expectAward(ctx, zero.id, "ironclad-recruit", "zero-played-matches-side-effect");
  await assertBadgeAward(ctx, report, {
    playerId: zero.id,
    badgeSlug: "first-deployment",
    expected: false,
    scenario: "zero-played-matches",
  });

  const loser = await createFixturePlayer(ctx, {
    label: "played-loss",
    bracketName: "Challenge",
  });
  await assertNoPreexistingAward(ctx, loser.id, "first-victory", "played-loss");
  const loss = await playFirstMatchOnly(ctx, {
    label: "played-loss",
    players: [loser],
    winnerIndex: 1,
    scenario: "played-loss",
  });
  await evaluateProductionBadges(ctx, {
    kind: "match",
    matchId: loss.match.id,
    scenario: "played-loss",
  });
  expectAward(ctx, loser.id, "first-deployment", "played-loss-side-effect");
  await assertBadgeAward(ctx, report, {
    playerId: loser.id,
    badgeSlug: "first-victory",
    expected: false,
    scenario: "played-loss",
  });
}

async function runVictoryThresholdNegatives(ctx, report) {
  const fourWins = await createFixturePlayer(ctx, {
    label: "four-victories",
    bracketName: "Challenge",
  });
  await assertNoPreexistingAward(ctx, fourWins.id, "five-victories", "four-victories");
  await playExactWins(ctx, fourWins, 4, "four-victories");
  allowExpectedAwards(ctx, fourWins.id, [
    "first-deployment",
    "first-victory",
    "first-campaign",
    "iron-streak",
    "clean-sweep",
    "flawless-campaign",
    "first-advance",
    "semifinalist",
    "finalist",
    "challenge-champion",
  ], "four-victories-side-effects");
  await assertBadgeAward(ctx, report, {
    playerId: fourWins.id,
    badgeSlug: "five-victories",
    expected: false,
    scenario: "four-victories",
  });

  const nineWins = await createFixturePlayer(ctx, {
    label: "nine-victories",
    bracketName: "Challenge",
  });
  await assertNoPreexistingAwards(
    ctx,
    nineWins.id,
    ["battle-tested", "ten-victories", "reliable-competitor"],
    "nine-victories"
  );
  await playExactWins(ctx, nineWins, 9, "nine-victories");
  allowExpectedAwards(ctx, nineWins.id, [
    "first-deployment",
    "first-victory",
    "first-campaign",
    "iron-regular",
    "five-victories",
    "iron-streak",
    "unbroken",
    "clean-sweep",
    "challenge-champion",
    "double-champion",
    "flawless-campaign",
    "first-advance",
    "semifinalist",
    "finalist",
  ], "nine-victories-side-effects");
  for (const slug of ["battle-tested", "ten-victories", "reliable-competitor"]) {
    await assertBadgeAward(ctx, report, {
      playerId: nineWins.id,
      badgeSlug: slug,
      expected: false,
      scenario: "nine-victories",
    });
  }

  const twentyFourWins = await createFixturePlayer(ctx, {
    label: "twenty-four-victories",
    bracketName: "Challenge",
  });
  await assertNoPreexistingAward(
    ctx,
    twentyFourWins.id,
    "twenty-five-victories",
    "twenty-four-victories"
  );
  await playExactWins(ctx, twentyFourWins, 24, "twenty-four-victories");
  allowExpectedAwards(ctx, twentyFourWins.id, [
    "first-deployment",
    "first-victory",
    "battle-tested",
    "first-campaign",
    "iron-regular",
    "reliable-competitor",
    "five-victories",
    "ten-victories",
    "iron-streak",
    "unbroken",
    "clean-sweep",
    "challenge-champion",
    "double-champion",
    "flawless-campaign",
    "first-advance",
    "semifinalist",
    "finalist",
  ], "twenty-four-victories-side-effects");
  await assertBadgeAward(ctx, report, {
    playerId: twentyFourWins.id,
    badgeSlug: "twenty-five-victories",
    expected: false,
    scenario: "twenty-four-victories",
  });
}

async function runStreakNegatives(ctx, report) {
  const twoWins = await createFixturePlayer(ctx, {
    label: "two-win-streak",
    bracketName: "Challenge",
  });
  await assertNoPreexistingAward(ctx, twoWins.id, "iron-streak", "two-win-streak");
  await playExactWins(ctx, twoWins, 2, "two-win-streak");
  allowExpectedAwards(ctx, twoWins.id, [
    "first-deployment",
    "first-victory",
    "clean-sweep",
  ], "two-win-streak-side-effects");
  await assertBadgeAward(ctx, report, {
    playerId: twoWins.id,
    badgeSlug: "iron-streak",
    expected: false,
    scenario: "two-win-streak",
  });

  const fourThenLoss = await createFixturePlayer(ctx, {
    label: "four-win-streak-then-loss",
    bracketName: "Challenge",
  });
  await assertNoPreexistingAward(
    ctx,
    fourThenLoss.id,
    "unbroken",
    "four-win-streak-then-loss"
  );
  await playExactWins(ctx, fourThenLoss, 4, "four-win-streak-then-loss");
  await playFirstMatchOnly(ctx, {
    label: "four-win-streak-then-loss-reset",
    players: [fourThenLoss],
    winnerIndex: 1,
    scenario: "four-win-streak-then-loss",
  });
  allowExpectedAwards(ctx, fourThenLoss.id, [
    "first-deployment",
    "first-victory",
    "first-campaign",
    "iron-streak",
    "clean-sweep",
    "flawless-campaign",
    "first-advance",
    "semifinalist",
    "finalist",
    "challenge-champion",
  ], "four-win-streak-then-loss-side-effects");
  await assertBadgeAward(ctx, report, {
    playerId: fourThenLoss.id,
    badgeSlug: "unbroken",
    expected: false,
    scenario: "four-win-streak-then-loss",
  });
}

async function runCleanSweepAndComebackBoundaries(ctx, report) {
  const comeback = await createFixturePlayer(ctx, {
    label: "comeback-positive",
    bracketName: "Challenge",
  });
  await assertNoPreexistingAward(
    ctx,
    comeback.id,
    "comeback-commander",
    "comeback-positive"
  );
  const comebackDivision = await createTournamentDivision(ctx, {
    label: "comeback-positive",
    bracketName: "Challenge",
    players: [comeback],
  });
  const comebackMatch = await firstPlayableMatch(ctx, comebackDivision);
  const comebackWinner = comebackMatch.player_one_registration_id;
  const comebackLoser = comebackMatch.player_two_registration_id;
  const comebackScore = scoreForWinner(comebackMatch, comebackWinner, 1);
  await submitPerGameReportGroupAndConfirm(ctx, {
    matchId: comebackMatch.id,
    winnerRegistrationId: comebackWinner,
    submittedByRegistrationId: comebackWinner,
    ...comebackScore,
    gameWinners: [comebackLoser, comebackWinner, comebackWinner],
    scenario: "comeback-positive",
  });
  await assertComebackGameOrderEvidence(ctx, {
    matchId: comebackMatch.id,
    seriesWinnerRegistrationId: comebackWinner,
    expectedGameOneLoss: true,
    scenario: "comeback-positive-game-order",
  });
  allowExpectedAwards(ctx, comeback.id, [
    "first-deployment",
    "first-victory",
    "comeback-commander",
  ], "comeback-positive");
  await assertBadgeAward(ctx, report, {
    playerId: comeback.id,
    badgeSlug: "comeback-commander",
    expected: true,
    scenario: "comeback-positive",
  });

  const noGameOneLoss = await createFixturePlayer(ctx, {
    label: "comeback-no-game1-loss",
    bracketName: "Challenge",
  });
  await assertNoPreexistingAward(
    ctx,
    noGameOneLoss.id,
    "comeback-commander",
    "comeback-no-game1-loss"
  );
  const noGameOneDivision = await createTournamentDivision(ctx, {
    label: "comeback-no-game1-loss",
    bracketName: "Challenge",
    players: [noGameOneLoss],
  });
  const noGameOneMatch = await firstPlayableMatch(ctx, noGameOneDivision);
  const noGameOneWinner = noGameOneMatch.player_one_registration_id;
  const noGameOneLoser = noGameOneMatch.player_two_registration_id;
  const noGameOneScore = scoreForWinner(noGameOneMatch, noGameOneWinner, 1);
  await submitPerGameReportGroupAndConfirm(ctx, {
    matchId: noGameOneMatch.id,
    winnerRegistrationId: noGameOneWinner,
    submittedByRegistrationId: noGameOneWinner,
    ...noGameOneScore,
    gameWinners: [noGameOneWinner, noGameOneLoser, noGameOneWinner],
    scenario: "comeback-no-game1-loss",
  });
  await assertComebackGameOrderEvidence(ctx, {
    matchId: noGameOneMatch.id,
    seriesWinnerRegistrationId: noGameOneWinner,
    expectedGameOneLoss: false,
    scenario: "comeback-no-game1-loss-game-order",
  });
  await evaluateProductionBadges(ctx, {
    kind: "match",
    matchId: noGameOneMatch.id,
    scenario: "comeback-no-game1-loss",
  });
  allowExpectedAwards(ctx, noGameOneLoss.id, [
    "first-deployment",
    "first-victory",
  ], "comeback-no-game1-loss-side-effects");
  await assertBadgeAward(ctx, report, {
    playerId: noGameOneLoss.id,
    badgeSlug: "comeback-commander",
    expected: false,
    scenario: "comeback-no-game1-loss",
  });

  const cleanSweepNegative = await createFixturePlayer(ctx, {
    label: "clean-sweep-2-1",
    bracketName: "Challenge",
  });
  await assertNoPreexistingAward(
    ctx,
    cleanSweepNegative.id,
    "clean-sweep",
    "clean-sweep-2-1"
  );
  const cleanDivision = await createTournamentDivision(ctx, {
    label: "clean-sweep-2-1",
    bracketName: "Challenge",
    players: [cleanSweepNegative],
  });
  const cleanMatch = await firstPlayableMatch(ctx, cleanDivision);
  const cleanWinner = cleanMatch.player_one_registration_id;
  const cleanLoser = cleanMatch.player_two_registration_id;
  const cleanScore = scoreForWinner(cleanMatch, cleanWinner, 1);
  await submitPerGameReportGroupAndConfirm(ctx, {
    matchId: cleanMatch.id,
    winnerRegistrationId: cleanWinner,
    submittedByRegistrationId: cleanWinner,
    ...cleanScore,
    gameWinners: [cleanWinner, cleanLoser, cleanWinner],
    scenario: "clean-sweep-2-1",
  });
  await assertCleanSweepBrokenSeriesEvidence(ctx, {
    matchId: cleanMatch.id,
    winnerRegistrationId: cleanWinner,
    expectedSeriesBestOf: 3,
    expectedFinalizedGameCount: 3,
    scenario: "clean-sweep-2-1-evidence",
  });
  allowExpectedAwards(ctx, cleanSweepNegative.id, [
    "first-deployment",
    "first-victory",
  ], "clean-sweep-2-1-side-effects");
  await assertBadgeAward(ctx, report, {
    playerId: cleanSweepNegative.id,
    badgeSlug: "clean-sweep",
    expected: false,
    scenario: "clean-sweep-2-1",
  });
}

async function runGiantBoundaries(ctx, report) {
  const giant = await createFixturePlayer(ctx, {
    label: "giant-positive",
    elo: 1100,
  });
  await assertNoPreexistingAwards(
    ctx,
    giant.id,
    ["giant-slayer", "giant-hunter"],
    "giant-positive"
  );
  for (let index = 0; index < 3; index += 1) {
    const opponent = await createFixturePlayer(ctx, {
      label: `giant-positive-opponent-${index + 1}`,
      elo: 1300 + index,
    });
    await playFirstMatchOnly(ctx, {
      label: `giant-positive-${index + 1}`,
      players: [giant, opponent],
      preservePlayerElo: true,
      winnerIndex: 0,
      scenario: "giant-positive",
    });
  }
  allowExpectedAwards(ctx, giant.id, [
    "first-deployment",
    "first-victory",
    "iron-streak",
    "clean-sweep",
    "giant-slayer",
    "giant-hunter",
  ], "giant-positive");
  await assertBadgeAward(ctx, report, {
    playerId: giant.id,
    badgeSlug: "giant-slayer",
    expected: true,
    scenario: "giant-positive",
  });
  await assertBadgeAward(ctx, report, {
    playerId: giant.id,
    badgeSlug: "giant-hunter",
    expected: true,
    scenario: "giant-positive",
  });

  const plus199 = await createFixturePlayer(ctx, {
    label: "giant-plus-199",
    elo: 1100,
  });
  await assertNoPreexistingAward(ctx, plus199.id, "giant-slayer", "giant-plus-199");
  const plus199Opponent = await createFixturePlayer(ctx, {
    label: "giant-plus-199-opponent",
    elo: 1299,
  });
  await playFirstMatchOnly(ctx, {
    label: "giant-plus-199",
    players: [plus199, plus199Opponent],
    preservePlayerElo: true,
    winnerIndex: 0,
    scenario: "giant-plus-199",
  });
  allowExpectedAwards(ctx, plus199.id, [
    "first-deployment",
    "first-victory",
    "clean-sweep",
  ], "giant-plus-199-side-effects");
  await assertBadgeAward(ctx, report, {
    playerId: plus199.id,
    badgeSlug: "giant-slayer",
    expected: false,
    scenario: "giant-plus-199",
  });

  const twoUpsets = await createFixturePlayer(ctx, {
    label: "giant-two-upsets",
    elo: 1100,
  });
  await assertNoPreexistingAward(ctx, twoUpsets.id, "giant-hunter", "giant-two-upsets");
  for (let index = 0; index < 2; index += 1) {
    const opponent = await createFixturePlayer(ctx, {
      label: `giant-two-upsets-opponent-${index + 1}`,
      elo: 1300 + index,
    });
    await playFirstMatchOnly(ctx, {
      label: `giant-two-upsets-${index + 1}`,
      players: [twoUpsets, opponent],
      preservePlayerElo: true,
      winnerIndex: 0,
      scenario: "giant-two-upsets",
    });
  }
  allowExpectedAwards(ctx, twoUpsets.id, [
    "first-deployment",
    "first-victory",
    "clean-sweep",
    "giant-slayer",
  ], "giant-two-upsets-side-effects");
  await assertBadgeAward(ctx, report, {
    playerId: twoUpsets.id,
    badgeSlug: "giant-hunter",
    expected: false,
    scenario: "giant-two-upsets",
  });
}

async function runTournamentBoundaryScenarios(ctx, report) {
  const sameBracket = await createFixturePlayer(ctx, {
    label: "same-bracket-history",
    bracketName: "Challenge",
  });
  await assertNoPreexistingAward(
    ctx,
    sameBracket.id,
    "rising-through-the-ranks",
    "same-bracket-history"
  );
  await createAndPlayTournament(ctx, {
    label: "same-bracket-history-1",
    bracketName: "Challenge",
    players: [sameBracket],
    scenario: "same-bracket-history",
  });
  await createAndPlayTournament(ctx, {
    label: "same-bracket-history-2",
    bracketName: "Challenge",
    players: [sameBracket],
    scenario: "same-bracket-history",
  });
  allowExpectedAwards(ctx, sameBracket.id, [
    "first-deployment",
    "first-victory",
    "first-campaign",
    "five-victories",
    "iron-streak",
    "unbroken",
    "clean-sweep",
    "flawless-campaign",
    "first-advance",
    "semifinalist",
    "finalist",
    "challenge-champion",
    "double-champion",
  ], "same-bracket-history-side-effects");
  await assertBadgeAward(ctx, report, {
    playerId: sameBracket.id,
    badgeSlug: "rising-through-the-ranks",
    expected: false,
    scenario: "same-bracket-history",
  });

  const incomplete = await createFixturePlayer(ctx, {
    label: "launched-incomplete-tournament",
    bracketName: "Challenge",
  });
  await assertNoPreexistingAward(
    ctx,
    incomplete.id,
    "first-campaign",
    "launched-incomplete-tournament"
  );
  const incompleteDivision = await createTournamentDivision(ctx, {
    label: "launched-incomplete-tournament",
    bracketName: "Challenge",
    players: [incomplete],
  });
  await evaluateProductionBadges(ctx, {
    kind: "tournament",
    tournamentId: incompleteDivision.tournament.id,
    scenario: "launched-incomplete-tournament",
  });
  await assertBadgeAward(ctx, report, {
    playerId: incomplete.id,
    badgeSlug: "first-campaign",
    expected: false,
    scenario: "launched-incomplete-tournament",
  });

  const twoTournaments = await createFixturePlayer(ctx, {
    label: "two-completed-tournaments",
    bracketName: "Challenge",
  });
  await assertNoPreexistingAward(
    ctx,
    twoTournaments.id,
    "iron-regular",
    "two-completed-tournaments"
  );
  for (let index = 0; index < 2; index += 1) {
    await createAndPlayTournament(ctx, {
      label: `two-completed-tournaments-${index + 1}`,
      bracketName: "Challenge",
      players: [twoTournaments],
      scenario: "two-completed-tournaments",
    });
  }
  allowExpectedAwards(ctx, twoTournaments.id, [
    "first-deployment",
    "first-victory",
    "first-campaign",
    "five-victories",
    "iron-streak",
    "unbroken",
    "clean-sweep",
    "flawless-campaign",
    "first-advance",
    "semifinalist",
    "finalist",
    "challenge-champion",
    "double-champion",
  ], "two-completed-tournaments-side-effects");
  await assertBadgeAward(ctx, report, {
    playerId: twoTournaments.id,
    badgeSlug: "iron-regular",
    expected: false,
    scenario: "two-completed-tournaments",
  });

  const nineTournaments = await createFixturePlayer(ctx, {
    label: "nine-completed-tournaments",
    bracketName: "Challenge",
  });
  await assertNoPreexistingAward(
    ctx,
    nineTournaments.id,
    "tournament-veteran",
    "nine-completed-tournaments"
  );
  for (let index = 0; index < 9; index += 1) {
    await createAndPlayTournament(ctx, {
      label: `nine-completed-tournaments-${index + 1}`,
      bracketName: "Challenge",
      players: [nineTournaments],
      scenario: "nine-completed-tournaments",
    });
  }
  allowExpectedAwards(ctx, nineTournaments.id, [
    "first-deployment",
    "first-victory",
    "battle-tested",
    "first-campaign",
    "iron-regular",
    "reliable-competitor",
    "five-victories",
    "ten-victories",
    "twenty-five-victories",
    "iron-streak",
    "unbroken",
    "clean-sweep",
    "challenge-champion",
    "double-champion",
    "flawless-campaign",
    "first-advance",
    "semifinalist",
    "finalist",
  ], "nine-completed-tournaments-side-effects");
  await assertBadgeAward(ctx, report, {
    playerId: nineTournaments.id,
    badgeSlug: "tournament-veteran",
    expected: false,
    scenario: "nine-completed-tournaments",
  });

  await runChampionshipBoundaryNegatives(ctx, report);
}

async function runChampionshipBoundaryNegatives(ctx, report) {
  const firstRoundExit = await createFixturePlayer(ctx, {
    label: "first-round-exit",
    bracketName: "Challenge",
  });
  await assertNoPreexistingAwards(
    ctx,
    firstRoundExit.id,
    ["first-advance", "semifinalist"],
    "first-round-exit"
  );
  await createAndPlayTournament(ctx, {
    label: "first-round-exit",
    bracketName: "Challenge",
    players: [firstRoundExit],
    scenario: "first-round-exit",
    matchPlan: ({ match }) =>
      participantInMatch(match, firstRoundExit)
        ? { winnerRegistrationId: otherRegistrationId(match, registrationIdForPlayer(match, firstRoundExit)) }
        : {},
  });
  allowExpectedAwards(ctx, firstRoundExit.id, [
    "first-deployment",
    "first-campaign",
  ], "first-round-exit-side-effects");
  for (const slug of ["first-advance", "semifinalist"]) {
    await assertBadgeAward(ctx, report, {
      playerId: firstRoundExit.id,
      badgeSlug: slug,
      expected: false,
      scenario: "first-round-exit",
    });
  }

  const semifinalExit = await createFixturePlayer(ctx, {
    label: "semifinal-exit",
    bracketName: "Challenge",
  });
  await assertNoPreexistingAward(ctx, semifinalExit.id, "finalist", "semifinal-exit");
  await createAndPlayTournament(ctx, {
    label: "semifinal-exit",
    bracketName: "Challenge",
    players: [semifinalExit],
    scenario: "semifinal-exit",
    matchPlan: ({ match }) => {
      if (!participantInMatch(match, semifinalExit)) return {};
      const targetRegistrationId = registrationIdForPlayer(match, semifinalExit);
      const roundNumber = Number(first(match.bracket_rounds)?.round_number ?? 0);
      return {
        winnerRegistrationId:
          roundNumber === 1
            ? targetRegistrationId
            : otherRegistrationId(match, targetRegistrationId),
      };
    },
  });
  allowExpectedAwards(ctx, semifinalExit.id, [
    "first-deployment",
    "first-victory",
    "first-campaign",
    "clean-sweep",
    "first-advance",
    "semifinalist",
  ], "semifinal-exit-side-effects");
  await assertBadgeAward(ctx, report, {
    playerId: semifinalExit.id,
    badgeSlug: "finalist",
    expected: false,
    scenario: "semifinal-exit",
  });

  for (const [bracketName, badgeSlug, scenario] of [
    ["Academy", "academy-champion", "academy-finalist-loss"],
    ["Challenge", "challenge-champion", "challenge-finalist-loss"],
    ["Main", "elite-champion", "main-finalist-loss"],
  ]) {
    const player = await createFixturePlayer(ctx, {
      label: scenario,
      bracketName,
    });
    await assertNoPreexistingAward(ctx, player.id, badgeSlug, scenario);
    await createFinalistLossTournament(ctx, player, bracketName, scenario);
    allowExpectedAwards(ctx, player.id, [
      "first-deployment",
      "first-victory",
      "first-campaign",
      "five-victories",
      "iron-streak",
      "clean-sweep",
      "first-advance",
      "semifinalist",
      "finalist",
    ], `${scenario}-side-effects`);
    await assertBadgeAward(ctx, report, {
      playerId: player.id,
      badgeSlug,
      expected: false,
      scenario,
    });
  }

  const oneChampionship = await createFixturePlayer(ctx, {
    label: "one-championship",
    bracketName: "Challenge",
  });
  await assertNoPreexistingAward(
    ctx,
    oneChampionship.id,
    "double-champion",
    "one-championship"
  );
  await createAndPlayTournament(ctx, {
    label: "one-championship",
    bracketName: "Challenge",
    players: [oneChampionship],
    scenario: "one-championship",
  });
  allowExpectedAwards(ctx, oneChampionship.id, [
    "first-deployment",
    "first-victory",
    "first-campaign",
    "iron-streak",
    "clean-sweep",
    "flawless-campaign",
    "first-advance",
    "semifinalist",
    "finalist",
    "challenge-champion",
  ], "one-championship-side-effects");
  await assertBadgeAward(ctx, report, {
    playerId: oneChampionship.id,
    badgeSlug: "double-champion",
    expected: false,
    scenario: "one-championship",
  });

  const twoBracketChamp = await createFixturePlayer(ctx, {
    label: "two-bracket-championships",
    bracketName: "Academy",
  });
  await assertNoPreexistingAward(
    ctx,
    twoBracketChamp.id,
    "triple-crown",
    "two-bracket-championships"
  );
  await createAndPlayTournament(ctx, {
    label: "two-bracket-championships-academy",
    bracketName: "Academy",
    players: [twoBracketChamp],
    scenario: "two-bracket-championships",
  });
  await createAndPlayTournament(ctx, {
    label: "two-bracket-championships-challenge",
    bracketName: "Challenge",
    players: [twoBracketChamp],
    scenario: "two-bracket-championships",
  });
  allowExpectedAwards(ctx, twoBracketChamp.id, [
    "first-deployment",
    "first-victory",
    "first-campaign",
    "five-victories",
    "iron-streak",
    "unbroken",
    "clean-sweep",
    "flawless-campaign",
    "first-advance",
    "semifinalist",
    "finalist",
    "academy-champion",
    "challenge-champion",
    "double-champion",
    "rising-through-the-ranks",
  ], "two-bracket-championships-side-effects");
  await assertBadgeAward(ctx, report, {
    playerId: twoBracketChamp.id,
    badgeSlug: "triple-crown",
    expected: false,
    scenario: "two-bracket-championships",
  });
}

async function runSeasonBoundaryScenarios(ctx, report, career) {
  const activeSeason = await createFixturePlayer(ctx, {
    label: "active-season-under-threshold",
    bracketName: "Main",
  });
  await assertNoPreexistingAwards(
    ctx,
    activeSeason.id,
    ["season-campaigner", "season-podium", "season-champion"],
    "active-season-under-threshold"
  );
  const activeTournaments = [];
  for (let index = 0; index < 3; index += 1) {
    activeTournaments.push(await createAndPlayTournament(ctx, {
      label: `active-season-under-threshold-${index + 1}`,
      bracketName: "Main",
      players: [activeSeason],
      scenario: "active-season-under-threshold",
    }));
  }
  const activeSeasonId = await loadSeasonForTournament(
    ctx,
    activeTournaments.at(-1).tournament.id
  );
  if (!activeSeasonId) {
    throw new Error("Active season negative did not create a season membership.");
  }
  await recalculateSeason(ctx, activeSeasonId);
  allowExpectedAwards(ctx, activeSeason.id, [
    "first-deployment",
    "first-victory",
    "first-campaign",
    "iron-regular",
    "five-victories",
    "iron-streak",
    "unbroken",
    "clean-sweep",
    "elite-champion",
    "double-champion",
    "flawless-campaign",
    "first-advance",
    "semifinalist",
    "finalist",
  ], "active-season-under-threshold-side-effects");
  await assertBadgeAward(ctx, report, {
    playerId: activeSeason.id,
    badgeSlug: "season-campaigner",
    expected: false,
    scenario: "active-season-under-threshold",
  });
  await evaluateProductionBadges(ctx, {
    kind: "player",
    playerId: activeSeason.id,
    scenario: "active-season-not-finalized",
  });
  for (const slug of ["season-podium", "season-champion"]) {
    await assertBadgeAward(ctx, report, {
      playerId: activeSeason.id,
      badgeSlug: slug,
      expected: false,
      scenario: "active-season-not-finalized",
      coverage: false,
    });
  }

  const standings = await loadSeasonStandings(ctx, career.seasonId);
  const rankFour = standings.find((row) => Number(row.current_rank) === 4);
  const rankTwo = standings.find((row) => Number(row.current_rank) === 2);

  if (!rankFour?.player_id || !rankTwo?.player_id) {
    throw new Error("Career season did not produce rank 2 and rank 4 standings.");
  }

  await assertNoPreexistingAward(ctx, rankFour.player_id, "season-podium", "season-rank-four");
  await evaluateProductionBadges(ctx, {
    kind: "player",
    playerId: rankFour.player_id,
    scenario: "season-rank-four",
  });
  await assertBadgeAward(ctx, report, {
    playerId: rankFour.player_id,
    badgeSlug: "season-podium",
    expected: false,
    scenario: "season-rank-four",
  });

  await assertNoPreexistingAward(ctx, rankTwo.player_id, "season-champion", "season-rank-two");
  await evaluateProductionBadges(ctx, {
    kind: "player",
    playerId: rankTwo.player_id,
    scenario: "season-rank-two",
  });
  await assertBadgeAward(ctx, report, {
    playerId: rankTwo.player_id,
    badgeSlug: "season-champion",
    expected: false,
    scenario: "season-rank-two",
  });
}

async function runFlawlessBoundaryScenarios(ctx, report, career) {
  const careerTournament = career.tournaments.find(
    (entry) => entry.bracketName === "Challenge"
  ) ?? career.tournaments[0];
  await assertFlawlessEvidence(ctx, {
    playerId: career.player.id,
    registrationId: careerTournament.championRegistrationId,
    tournamentId: careerTournament.tournament.id,
    matchIds: careerTournament.completedMatches,
    scenario: "flawless-positive-evidence",
    expectSummary: true,
  });
  await evaluateProductionBadges(ctx, {
    kind: "player",
    playerId: career.player.id,
    scenario: "flawless-clean-champion-positive",
  });
  await assertBadgeAward(ctx, report, {
    playerId: career.player.id,
    badgeSlug: "flawless-campaign",
    expected: true,
    scenario: "flawless-clean-champion-positive",
  });

  const noShowChampion = await createFixturePlayer(ctx, {
    label: "flawless-no-show-positive",
    bracketName: "Challenge",
  });
  await assertNoPreexistingAward(
    ctx,
    noShowChampion.id,
    "flawless-campaign",
    "flawless-no-show-positive"
  );
  const noShowTournament = await createAndPlayTournament(ctx, {
    label: "flawless-no-show-positive",
    bracketName: "Challenge",
    players: [noShowChampion],
    scenario: "flawless-no-show-positive",
    matchPlan: ({ match, completedMatches }) => {
      if (completedMatches.length === 0 && participantInMatch(match, noShowChampion)) {
        return {
          mode: "no-show",
          winnerRegistrationId: registrationIdForPlayer(match, noShowChampion),
        };
      }
      return {};
    },
  });
  allowExpectedAwards(ctx, noShowChampion.id, [
    "first-deployment",
    "first-victory",
    "first-campaign",
    "five-victories",
    "iron-streak",
    "clean-sweep",
    "flawless-campaign",
    "first-advance",
    "semifinalist",
    "finalist",
    "challenge-champion",
  ], "flawless-no-show-positive-side-effects");
  await assertBadgeAward(ctx, report, {
    playerId: noShowChampion.id,
    badgeSlug: "flawless-campaign",
    expected: true,
    scenario: "flawless-no-show-positive",
  });
  await assertFlawlessEvidence(ctx, {
    playerId: noShowChampion.id,
    registrationId: noShowTournament.championRegistrationId,
    tournamentId: noShowTournament.tournament.id,
    matchIds: noShowTournament.completedMatches,
    scenario: "flawless-no-show-positive-evidence",
    expectSummary: true,
    requireNoShow: true,
  });

  const oneGameLoss = await createFixturePlayer(ctx, {
    label: "flawless-one-game-loss",
    bracketName: "Challenge",
  });
  await assertNoPreexistingAward(
    ctx,
    oneGameLoss.id,
    "flawless-campaign",
    "flawless-one-game-loss"
  );
  await createAndPlayTournament(ctx, {
    label: "flawless-one-game-loss",
    bracketName: "Challenge",
    players: [oneGameLoss],
    scenario: "flawless-one-game-loss",
    matchPlan: ({ match, completedMatches }) => {
      if (completedMatches.length === 0 && participantInMatch(match, oneGameLoss)) {
        const winnerRegistrationId = registrationIdForPlayer(match, oneGameLoss);
        return {
          mode: "per-game",
          winnerRegistrationId,
          loserScore: 1,
          gameWinners: gameWinnersForScore(match, winnerRegistrationId, 1),
        };
      }
      return {};
    },
  });
  allowExpectedAwards(ctx, oneGameLoss.id, [
    "first-deployment",
    "first-victory",
    "first-campaign",
    "five-victories",
    "iron-streak",
    "clean-sweep",
    "first-advance",
    "semifinalist",
    "finalist",
    "challenge-champion",
  ], "flawless-one-game-loss-side-effects");
  await assertBadgeAward(ctx, report, {
    playerId: oneGameLoss.id,
    badgeSlug: "flawless-campaign",
    expected: false,
    scenario: "flawless-one-game-loss",
  });

  const adminDefault = await createFixturePlayer(ctx, {
    label: "flawless-admin-default",
    bracketName: "Challenge",
  });
  await assertNoPreexistingAward(
    ctx,
    adminDefault.id,
    "flawless-campaign",
    "flawless-admin-default"
  );
  await createAndPlayTournament(ctx, {
    label: "flawless-admin-default",
    bracketName: "Challenge",
    players: [adminDefault],
    scenario: "flawless-admin-default",
    matchPlan: ({ match, completedMatches }) => {
      if (completedMatches.length === 0 && participantInMatch(match, adminDefault)) {
        return {
          mode: "admin",
          winnerRegistrationId: registrationIdForPlayer(match, adminDefault),
        };
      }
      return {};
    },
  });
  allowExpectedAwards(ctx, adminDefault.id, [
    "first-deployment",
    "first-victory",
    "first-campaign",
    "five-victories",
    "iron-streak",
    "clean-sweep",
    "first-advance",
    "semifinalist",
    "finalist",
    "challenge-champion",
  ], "flawless-admin-default-side-effects");
  await assertBadgeAward(ctx, report, {
    playerId: adminDefault.id,
    badgeSlug: "flawless-campaign",
    expected: false,
    scenario: "flawless-admin-default",
  });

}

export async function runFlawlessIncompletePathScenario(
  ctx,
  report,
  options = {}
) {
  const runtime = {
    createFixturePlayer,
    playFirstMatchOnly,
    loadTournament,
    assertNoPreexistingAward,
    rpcRows,
    evaluateProductionBadges,
    assertBadgeAward,
    allowExpectedAwards,
    recordCorrectionAssertion,
    ...options.runtime,
  };
  const scenario = "flawless-incomplete-championship-path";
  const player = await runtime.createFixturePlayer(ctx, {
    label: scenario,
    bracketName: "Challenge",
  });
  await runtime.assertNoPreexistingAward(
    ctx,
    player.id,
    "flawless-campaign",
    scenario
  );

  const played = await runtime.playFirstMatchOnly(ctx, {
    label: scenario,
    players: [player],
    winnerIndex: 0,
    scenario,
    evaluateBadges: false,
  });
  const registrationId = registrationIdForPlayer(played.match, player);
  const tournamentId = played.division.tournament.id;
  const [tournament, summaryRows, segments, qualifyingRows] = await Promise.all([
    runtime.loadTournament(ctx, tournamentId),
    runtime.rpcRows(ctx, "get_tournament_championship_path_summary", {
      p_tournament_id: tournamentId,
      p_registration_id: registrationId,
    }),
    runtime.rpcRows(ctx, "get_tournament_championship_path_segments", {
      p_tournament_id: tournamentId,
      p_registration_id: registrationId,
    }),
    runtime.rpcRows(ctx, "get_player_badge_flawless_campaign_summary", {
      p_player_id: player.id,
    }),
  ]);
  const summary = first(summaryRows);
  const relevantSegment = segments.find(
    (segment) => segment.source_match_id === played.match.id
  );
  const incompletePath =
    tournament.status === "in_progress" &&
    relevantSegment?.outcome_kind === "played" &&
    relevantSegment.authority_state === "active" &&
    summary?.completeness_state !== "complete" &&
    !qualifyingRows.some((row) => row.tournament_id === tournamentId);

  runtime.recordCorrectionAssertion(ctx.manifest, {
    scenario,
    playerId: player.id,
    tournamentId,
    registrationId,
    tournamentStatus: tournament.status,
    relevantPathSegmentExists: Boolean(relevantSegment),
    latestPathOutcome: relevantSegment?.outcome_kind ?? null,
    pathCompletenessState: summary?.completeness_state ?? "absent",
    qualifyingFlawlessRows: qualifyingRows.length,
    pass: incompletePath,
  });
  if (!incompletePath) {
    throw new Error(
      "Flawless Campaign incomplete-path authority condition was not established."
    );
  }

  runtime.allowExpectedAwards(
    ctx,
    player.id,
    ["ironclad-recruit", "first-deployment", "first-victory", "clean-sweep"],
    `${scenario}-side-effects`
  );
  await runtime.evaluateProductionBadges(ctx, {
    kind: "player",
    playerId: player.id,
    scenario,
  });
  await runtime.assertBadgeAward(ctx, report, {
    playerId: player.id,
    badgeSlug: "flawless-campaign",
    expected: false,
    scenario,
  });
}

export async function runFlawlessResetInvalidationScenario(
  ctx,
  report,
  options = {}
) {
  const runtime = {
    createFixturePlayer,
    playFirstMatchOnly,
    loadMatchAuthority,
    resetMatch,
    rpcRows,
    assertNoPreexistingAward,
    evaluateProductionBadges,
    assertBadgeAward,
    allowExpectedAwards,
    recordCorrectionAssertion,
    ...options.runtime,
  };
  const scenario = "flawless-reset-invalidated-evidence";
  const player = await runtime.createFixturePlayer(ctx, {
    label: scenario,
    bracketName: "Challenge",
  });
  await runtime.assertNoPreexistingAward(
    ctx,
    player.id,
    "flawless-campaign",
    scenario
  );

  const played = await runtime.playFirstMatchOnly(ctx, {
    label: scenario,
    players: [player],
    winnerIndex: 0,
    scenario,
    evaluateBadges: false,
  });
  const registrationId = registrationIdForPlayer(played.match, player);
  const tournamentId = played.division.tournament.id;
  const [beforeAuthority, beforeSegments] = await Promise.all([
    runtime.loadMatchAuthority(ctx, played.match.id),
    runtime.rpcRows(ctx, "get_tournament_championship_path_segments", {
      p_tournament_id: tournamentId,
      p_registration_id: registrationId,
    }),
  ]);
  const beforeParticipant = latestParticipantAuthorityForRegistration(
    beforeAuthority.participants,
    registrationId
  );
  const beforePath = beforeSegments.find(
    (segment) => segment.source_match_id === played.match.id
  );
  const activeBeforeGames = latestGameAuthorityByNumber(beforeAuthority.games)
    .filter((game) => game.authority_state === "active");
  const relevantPathExisted =
    beforeParticipant?.outcome_kind === "played" &&
    beforePath?.outcome_kind === "played" &&
    beforePath.authority_state === "active" &&
    activeBeforeGames.length > 0;
  if (!relevantPathExisted) {
    throw new Error(
      "Flawless Campaign reset scenario did not establish relevant championship authority."
    );
  }

  await runtime.resetMatch(ctx, played.match.id);
  const [afterAuthority, afterSegments, summaryRows] = await Promise.all([
    runtime.loadMatchAuthority(ctx, played.match.id),
    runtime.rpcRows(ctx, "get_tournament_championship_path_segments", {
      p_tournament_id: tournamentId,
      p_registration_id: registrationId,
    }),
    runtime.rpcRows(ctx, "get_tournament_championship_path_summary", {
      p_tournament_id: tournamentId,
      p_registration_id: registrationId,
    }),
  ]);
  const afterParticipant = latestParticipantAuthorityForRegistration(
    afterAuthority.participants,
    registrationId
  );
  const afterPath = afterSegments.find(
    (segment) => segment.source_match_id === played.match.id
  );
  const latestAfterGames = latestGameAuthorityByNumber(afterAuthority.games);
  const invalidatedGames =
    latestAfterGames.length === activeBeforeGames.length &&
    latestAfterGames.every((game) => {
      const before = activeBeforeGames.find(
        (candidate) => Number(candidate.game_number) === Number(game.game_number)
      );
      return (
        game.authority_state === "invalidated" &&
        game.source_type === "match_reset" &&
        Number(game.revision) > Number(before?.revision ?? 0)
      );
    });
  const participantInvalidated =
    afterParticipant?.outcome_kind === "unknown" &&
    afterParticipant.source_type === "match_reset" &&
    Number(afterParticipant.revision) > Number(beforeParticipant.revision);
  const pathSuperseded =
    afterPath?.outcome_kind === "unknown" &&
    Number(afterPath.revision) > Number(beforePath.revision);
  const summaryNotComplete =
    first(summaryRows)?.completeness_state !== "complete";
  const resetInvalidated =
    invalidatedGames &&
    participantInvalidated &&
    pathSuperseded &&
    summaryNotComplete;

  runtime.recordCorrectionAssertion(ctx.manifest, {
    scenario,
    playerId: player.id,
    tournamentId,
    registrationId,
    matchId: played.match.id,
    relevantPathExisted,
    invalidatedGames,
    participantInvalidated,
    pathSuperseded,
    summaryNotComplete,
    pass: resetInvalidated,
  });
  if (!resetInvalidated) {
    throw new Error(
      "Match reset did not invalidate the latest Flawless Campaign authority path."
    );
  }

  runtime.allowExpectedAwards(
    ctx,
    player.id,
    ["ironclad-recruit"],
    `${scenario}-side-effects`
  );
  await runtime.evaluateProductionBadges(ctx, {
    kind: "player",
    playerId: player.id,
    scenario,
  });
  await runtime.assertBadgeAward(ctx, report, {
    playerId: player.id,
    badgeSlug: "flawless-campaign",
    expected: false,
    scenario,
  });
}

export async function runFlawlessVoidInvalidationScenario(
  ctx,
  report,
  options = {}
) {
  const runtime = {
    createFixturePlayer,
    assertNoPreexistingAward,
    createAndPlayTournament,
    assertFlawlessEvidence,
    firstRpcRow,
    rpcRows,
    loadQualifyingTournamentWins,
    voidTournament,
    recordCorrectionAssertion,
    allowExpectedAwards,
    evaluateProductionBadges,
    assertBadgeAward,
    ...options.runtime,
  };
  const player = await runtime.createFixturePlayer(ctx, {
    label: "flawless-void-invalidated-evidence",
    bracketName: "Challenge",
  });
  await runtime.assertNoPreexistingAward(
    ctx,
    player.id,
    "flawless-campaign",
    "flawless-void-invalidated-evidence"
  );

  const completed = await runtime.createAndPlayTournament(ctx, {
    label: "flawless-void-invalidated-evidence",
    bracketName: "Challenge",
    players: [player],
    scenario: "flawless-void-invalidated-evidence-setup",
    evaluateBadges: false,
  });
  await runtime.assertFlawlessEvidence(ctx, {
    playerId: player.id,
    registrationId: completed.championRegistrationId,
    tournamentId: completed.tournament.id,
    matchIds: completed.completedMatches,
    scenario: "flawless-void-complete-path-before-void",
    expectSummary: true,
  });

  const [beforeSummary, beforeSegments, beforeWins] = await Promise.all([
    runtime.firstRpcRow(ctx, "get_tournament_championship_path_summary", {
      p_tournament_id: completed.tournament.id,
      p_registration_id: completed.championRegistrationId,
    }),
    runtime.rpcRows(ctx, "get_tournament_championship_path_segments", {
      p_tournament_id: completed.tournament.id,
      p_registration_id: completed.championRegistrationId,
    }),
    runtime.loadQualifyingTournamentWins(
      ctx,
      completed.tournament.id,
      completed.championRegistrationId
    ),
  ]);
  if (
    beforeSummary?.completeness_state !== "complete" ||
    beforeSegments.length === 0 ||
    beforeWins.length === 0
  ) {
    throw new Error("Void scenario did not establish a complete current championship path.");
  }

  const voidResult = await runtime.voidTournament(
    ctx,
    completed.tournament.id,
    `${ctx.runMarker} Badge 20 completed-path invalidation`
  );
  if (voidResult?.outcome !== "voided") {
    throw new Error(`Tournament Void returned ${voidResult?.outcome ?? "no outcome"}.`);
  }

  const [afterSummary, afterSegments, afterWins] = await Promise.all([
    runtime.firstRpcRow(ctx, "get_tournament_championship_path_summary", {
      p_tournament_id: completed.tournament.id,
      p_registration_id: completed.championRegistrationId,
    }),
    runtime.rpcRows(ctx, "get_tournament_championship_path_segments", {
      p_tournament_id: completed.tournament.id,
      p_registration_id: completed.championRegistrationId,
    }),
    runtime.loadQualifyingTournamentWins(
      ctx,
      completed.tournament.id,
      completed.championRegistrationId
    ),
  ]);
  const priorRevisionByIndex = new Map(
    beforeSegments.map((segment) => [
      Number(segment.path_index),
      Number(segment.revision),
    ])
  );
  const segmentsVoided =
    afterSegments.length === beforeSegments.length &&
    afterSegments.every(
      (segment) =>
        segment.outcome_kind === "voided" &&
        segment.source_type === "tournament_void" &&
        Number(segment.revision) >
          Number(priorRevisionByIndex.get(Number(segment.path_index)) ?? 0)
    );
  const summaryInvalidated =
    afterSummary?.completeness_state === "invalidated" &&
    afterSummary.source_type === "tournament_void" &&
    Number(afterSummary.revision) > Number(beforeSummary.revision);
  const tournamentWinRemoved = afterWins.length === 0;

  runtime.recordCorrectionAssertion(ctx.manifest, {
    scenario: "flawless-void-invalidated-evidence",
    playerId: player.id,
    tournamentId: completed.tournament.id,
    registrationId: completed.championRegistrationId,
    completedPathExisted: true,
    segmentsVoided,
    summaryInvalidated,
    tournamentWinRemoved,
    pass: segmentsVoided && summaryInvalidated && tournamentWinRemoved,
  });
  if (!segmentsVoided || !summaryInvalidated || !tournamentWinRemoved) {
    throw new Error("Tournament Void did not invalidate the completed championship path.");
  }

  runtime.allowExpectedAwards(ctx, player.id, ["ironclad-recruit"], "flawless-void-side-effects");
  await runtime.evaluateProductionBadges(ctx, {
    kind: "player",
    playerId: player.id,
    scenario: "flawless-void-invalidated-evidence",
  });
  await runtime.assertBadgeAward(ctx, report, {
    playerId: player.id,
    badgeSlug: "flawless-campaign",
    expected: false,
    scenario: "flawless-void-invalidated-evidence",
  });
}

async function runIdempotencyAssertions(ctx, report, career) {
  const before = await awardCount(ctx, career.player.id);
  await evaluateProductionBadges(ctx, {
    kind: "player",
    playerId: career.player.id,
    scenario: "idempotency-live-repeat",
  });
  await evaluateProductionBadges(ctx, {
    kind: "backfill",
    playerIds: [career.player.id],
    scenario: "idempotency-backfill-1",
  });
  await evaluateProductionBadges(ctx, {
    kind: "backfill",
    playerIds: [career.player.id],
    scenario: "idempotency-backfill-2",
  });
  await recalculateTournament(ctx, career.tournaments[0].tournament.id);
  await recalculateTournament(ctx, career.tournaments[0].tournament.id);
  await recalculateSeason(ctx, career.seasonId);
  await recalculateSeason(ctx, career.seasonId);
  const after = await awardCount(ctx, career.player.id);
  const duplicateRows = await duplicateAwardRows(ctx);
  const passValue = before === after && duplicateRows.length === 0;

  recordIdempotencyAssertion(ctx.manifest, {
    scenario: "repeat-live-backfill-recalculate",
    playerId: career.player.id,
    before,
    after,
    duplicateRows,
    pass: passValue,
  });
  if (!passValue) {
    throw new Error(
      `Idempotency failed: before=${before}, after=${after}, duplicates=${JSON.stringify(duplicateRows)}`
    );
  }
  report.idempotency = "PASS";
}

async function runCorrectionAssertions(ctx, report) {
  const target = await createFixturePlayer(ctx, {
    label: "correction-reset",
    bracketName: "Challenge",
  });
  const played = await playFirstMatchOnly(ctx, {
    label: "correction-reset",
    players: [target],
    winnerIndex: 0,
    scenario: "correction-reset",
    evaluateBadges: false,
  });
  const beforeReset = await loadMatchAuthority(ctx, played.match.id);
  await resetMatch(ctx, played.match.id);
  const afterReset = await loadMatchAuthority(ctx, played.match.id);
  const resetInvalidated =
    beforeReset.games.length > 0 &&
    afterReset.games.some((game) => game.authority_state === "invalidated");
  await evaluateProductionBadges(ctx, {
    kind: "match",
    matchId: played.match.id,
    scenario: "correction-reset-invalidated-evidence",
  });
  const noNewAward = (await awardRows(ctx, target.id, "first-victory")).length === 0;
  recordCorrectionAssertion(ctx.manifest, {
    scenario: "reset-invalidates-game-authority",
    matchId: played.match.id,
    resetInvalidated,
    noNewAward,
    pass: resetInvalidated && noNewAward,
  });
  if (!resetInvalidated || !noNewAward) {
    throw new Error("Reset correction did not fail closed for invalidated evidence.");
  }

  const retained = await createAndPlayTournament(ctx, {
    label: "correction-retained-award",
    bracketName: "Challenge",
    players: [target],
    scenario: "correction-retained-award",
  });
  expectAward(ctx, target.id, "first-victory", "correction-retained-award");
  await assertBadgeAward(ctx, report, {
    playerId: target.id,
    badgeSlug: "first-victory",
    expected: true,
    scenario: "correction-retained-award",
    coverage: false,
  });
  await voidTournament(ctx, retained.tournament.id, `${ctx.runMarker} correction void`);
  await evaluateProductionBadges(ctx, {
    kind: "tournament",
    tournamentId: retained.tournament.id,
    scenario: "correction-void-retains-history",
  });
  const retainedAward = (await awardRows(ctx, target.id, "first-victory")).length === 1;
  recordCorrectionAssertion(ctx.manifest, {
    scenario: "void-retains-historical-award",
    tournamentId: retained.tournament.id,
    retainedAward,
    pass: retainedAward,
  });
  if (!retainedAward) {
    throw new Error("Historical badge award disappeared after void correction.");
  }

  report.corrections = "PASS";
}

async function loadQualifyingTournamentWins(ctx, tournamentId, registrationId) {
  const { data, error } = await ctx.supabase
    .from("leaderboard_point_events")
    .select("id, event_type, source")
    .eq("tournament_id", tournamentId)
    .eq("registration_id", registrationId)
    .eq("event_type", "tournament_win")
    .in("source", ["system", "recalculation"]);
  if (error) {
    throw new Error(`Tournament-win evidence load failed: ${error.message}`);
  }
  return data ?? [];
}

async function runSecurityAssertions(ctx, report) {
  assertMutationGateOpen(ctx);

  await verifyAuthenticatedJwtContext(ctx);

  const probePlayer = await createFixturePlayer(ctx, {
    label: "security-probe",
    bracketName: "Challenge",
  });
  const probe = await playFirstMatchOnly(ctx, {
    label: "security-probe",
    players: [probePlayer],
    winnerIndex: 0,
    scenario: "security-probe",
  });
  const authority = await loadMatchAuthority(ctx, probe.match.id);
  const participant = authority.participants[0];
  const game = authority.games[0];
  if (!participant?.match_id || !game?.match_id) {
    throw new Error("Security probe could not load valid authority IDs.");
  }

  await expectPermissionFailure(ctx, "anon-authority-ledger-insert", () =>
    ctx.anon.from("match_participant_outcome_authority").insert({
      match_id: participant.match_id,
      tournament_id: participant.tournament_id,
      registration_id: participant.registration_id,
      outcome_kind: participant.outcome_kind,
      revision: Number(participant.revision) + 1000,
      finalized_at: new Date().toISOString(),
      source_type: "security_probe",
      source_id: probe.match.id,
    })
  );
  await expectPermissionFailure(ctx, "authenticated-game-authority-insert", () =>
    ctx.authenticated.from("match_game_result_authority").insert({
      match_id: game.match_id,
      tournament_id: game.tournament_id,
      game_number: game.game_number,
      series_best_of: game.series_best_of,
      finalized_game_count: game.finalized_game_count,
      game_authority_complete: game.game_authority_complete,
      revision: Number(game.revision) + 1000,
      authority_state: "active",
      finalized_at: new Date().toISOString(),
      source_type: "security_probe",
      source_id: probe.match.id,
    })
  );
  await expectPermissionFailure(ctx, "anon-badge-summary-rpc", () =>
    ctx.anon.rpc("get_player_badge_match_threshold_summary", {
      p_player_id: probePlayer.id,
    })
  );

  const crossRead = await ctx.authenticated
    .from("player_badge_awards")
    .select("id")
    .eq("player_id", probePlayer.id)
    .limit(1);
  const crossReadDenied = Boolean(crossRead.error) || (crossRead.data ?? []).length === 0;
  recordSecurityAssertion(ctx.manifest, {
    scenario: "authenticated-cross-player-award-read",
    pass: crossReadDenied,
    errorCode: crossRead.error?.code ?? null,
  });
  if (!crossReadDenied) {
    throw new Error("Authenticated cross-player badge read was not denied or filtered.");
  }

  const serviceRead = await ctx.supabase
    .from("player_badge_awards")
    .select("id")
    .eq("player_id", probePlayer.id)
    .limit(1);
  if (serviceRead.error) {
    throw new Error(`Service-role badge read failed: ${serviceRead.error.message}`);
  }
  const serviceRoleReadSucceeded = !serviceRead.error;
  recordSecurityAssertion(ctx.manifest, {
    scenario: "service-role-award-read",
    pass: serviceRoleReadSucceeded,
  });
  report.security = "PASS";
}

export async function verifyAuthenticatedJwtContext(ctx) {
  if (!ctx.authenticatedSubject) {
    throw new Error("Authenticated JWT verification has no decoded subject.");
  }

  const anonProbe = await ctx.anon
    .from("players")
    .select("id")
    .limit(1);
  const anonDenied = isPermissionDenied(anonProbe.error);
  if (!anonDenied) {
    throw new Error(
      "Authenticated JWT role proof requires the players table to deny anon reads."
    );
  }

  const authenticatedProbe = await ctx.authenticated
    .from("players")
    .select("id")
    .eq("clerk_user_id", ctx.authenticatedSubject)
    .limit(1);
  if (authenticatedProbe.error) {
    const code = authenticatedProbe.error.code ?? "no-code";
    throw new Error(
      `Authenticated JWT was not accepted by the staging data layer: ${code} ${authenticatedProbe.error.message ?? ""}`
    );
  }

  recordSecurityAssertion(ctx.manifest, {
    scenario: "authenticated-jwt-positive-role-proof",
    authenticatedSubject: ctx.authenticatedSubject,
    anonDenied: true,
    authenticatedRequestAccepted: true,
    pass: true,
  });
}

async function assertBadgeAward(ctx, report, input) {
  const rows = await awardRows(ctx, input.playerId, input.badgeSlug);
  const count = rows.length;
  const passValue = input.expected ? count === 1 : count === 0;
  const evaluatorSeen = evaluatorTouchedSlug(
    ctx,
    input.playerId,
    input.badgeSlug,
    input.scenario
  );

  if (!evaluatorSeen) {
    throw new Error(
      `${input.scenario} did not invoke a production evaluator for ${input.badgeSlug}.`
    );
  }

  if (input.evidence !== false) {
    await assertBadgeAuthorityEvidence(ctx, input);
  }

  if (input.coverage !== false) {
    if (input.expected) {
      report.positiveTotal += 1;
      if (passValue) report.positivePass += 1;
      markCoverage(report, input.badgeSlug, "positive");
    } else {
      report.negativeTotal += 1;
      if (passValue) report.negativePass += 1;
      markCoverage(report, input.badgeSlug, "negative");
      recordNegativeAssertion(ctx.manifest, {
        scenario: input.scenario,
        playerId: input.playerId,
        badgeSlug: input.badgeSlug,
        expected: "none",
        actualCount: count,
        evaluatorSeen,
        pass: passValue,
      });
    }
  }

  if (!passValue) {
    throw new Error(
      `${input.scenario} failed for ${input.badgeSlug}: expected ${
        input.expected ? "exactly one" : "none"
      }, got ${count}`
    );
  }

  await recordActualAwardsForPlayer(ctx, input.playerId);
}

async function assertPositiveSet(ctx, report, playerId, badgeSlugs, scenario) {
  for (const slug of badgeSlugs) {
    await assertBadgeAward(ctx, report, {
      playerId,
      badgeSlug: slug,
      expected: true,
      scenario,
    });
  }
}

async function assertNoPreexistingAwards(ctx, playerId, badgeSlugs, scenario) {
  for (const badgeSlug of badgeSlugs) {
    await assertNoPreexistingAward(ctx, playerId, badgeSlug, scenario);
  }
}

async function assertNoPreexistingAward(ctx, playerId, badgeSlug, scenario) {
  const rows = await awardRows(ctx, playerId, badgeSlug);
  recordAuthorityEvidence(ctx, scenario, {
    kind: "precondition",
    playerId,
    badgeSlug,
    existingAwardCount: rows.length,
    pass: rows.length === 0,
  });
  if (rows.length > 0) {
    throw new Error(
      `${scenario} started with pre-existing ${badgeSlug} award for ${playerId}.`
    );
  }
}

async function assertBadgeAuthorityEvidence(ctx, input) {
  const result = await loadBadgeAuthorityEvidence(ctx, input);
  recordAuthorityEvidence(ctx, input.scenario, result);
  if (!result.pass) {
    throw new Error(
      `${input.scenario} authority evidence failed for ${input.badgeSlug}: ${result.reason}`
    );
  }
}

async function loadBadgeAuthorityEvidence(ctx, input) {
  const badgeSlug = input.badgeSlug;
  if (badgeSlug === "ironclad-recruit") {
    const { data, error } = await ctx.supabase
      .from("players")
      .select("id, profile_completed, relic_verified_elo_verified_at, avatar_url")
      .eq("id", input.playerId)
      .single();
    if (error) {
      throw new Error(`Profile authority evidence load failed: ${error.message}`);
    }
    const qualified =
      data?.profile_completed === true &&
      Boolean(data.relic_verified_elo_verified_at) &&
      Boolean(data.avatar_url);
    return thresholdEvidence(input, {
      kind: "profile",
      authority: "players",
      metric: "profile_completed_and_verified",
      actual: qualified ? 1 : 0,
      threshold: 1,
    });
  }

  const matchThresholds = {
    "first-deployment": ["played_match_count", 1],
    "battle-tested": ["played_match_count", 10],
    "first-victory": ["win_count", 1],
    "five-victories": ["win_count", 5],
    "ten-victories": ["win_count", 10],
    "twenty-five-victories": ["win_count", 25],
  };
  if (badgeSlug in matchThresholds) {
    const [field, threshold] = matchThresholds[badgeSlug];
    const row = await firstRpcRow(ctx, "get_player_badge_match_threshold_summary", {
      p_player_id: input.playerId,
    });
    return thresholdEvidence(input, {
      kind: "match-threshold",
      authority: "get_player_badge_match_threshold_summary",
      metric: field,
      actual: numberFrom(row?.[field]),
      threshold,
      sourceIds: compactObject({
        firstPlayedMatchId: row?.first_played_match_id,
        tenthPlayedMatchId: row?.tenth_played_match_id,
        firstWinMatchId: row?.first_win_match_id,
        fifthWinMatchId: row?.fifth_win_match_id,
        tenthWinMatchId: row?.tenth_win_match_id,
        twentyFifthWinMatchId: row?.twenty_fifth_win_match_id,
      }),
    });
  }

  if (badgeSlug === "reliable-competitor") {
    const row = await firstRpcRow(ctx, "get_player_badge_reliable_competitor_summary", {
      p_player_id: input.playerId,
    });
    return thresholdEvidence(input, {
      kind: "reliability",
      authority: "get_player_badge_reliable_competitor_summary",
      metric: "best_run",
      actual: numberFrom(row?.best_run),
      threshold: 10,
      sourceIds: compactObject({ tenthMatchId: row?.tenth_match_id }),
    });
  }

  if (badgeSlug === "comeback-commander") {
    const rows = await rpcRows(ctx, "get_player_badge_comeback_commander_summary", {
      p_player_id: input.playerId,
    });
    return thresholdEvidence(input, {
      kind: "comeback",
      authority: "get_player_badge_comeback_commander_summary",
      metric: "qualifying_comeback_rows",
      actual: rows.length,
      threshold: 1,
      sourceIds: compactObject({
        matchId: rows[0]?.match_id,
        game1WinnerRegistrationId: rows[0]?.game1_winner_registration_id,
        seriesWinnerRegistrationId: rows[0]?.series_winner_registration_id,
      }),
    });
  }

  const excellenceThresholds = {
    "iron-streak": ["best_win_streak", 3],
    "unbroken": ["best_win_streak", 5],
    "clean-sweep": ["clean_sweep_count", 1],
    "giant-slayer": ["upset_win_count", 1],
    "giant-hunter": ["upset_win_count", 3],
  };
  if (badgeSlug in excellenceThresholds) {
    const [field, threshold] = excellenceThresholds[badgeSlug];
    const row = await firstRpcRow(ctx, "get_player_badge_match_excellence_summary", {
      p_player_id: input.playerId,
    });
    return thresholdEvidence(input, {
      kind: "match-excellence",
      authority: "get_player_badge_match_excellence_summary",
      metric: field,
      actual: numberFrom(row?.[field]),
      threshold,
      sourceIds: compactObject({
        thirdStreakMatchId: row?.third_streak_match_id,
        fifthStreakMatchId: row?.fifth_streak_match_id,
        firstCleanSweepMatchId: row?.first_clean_sweep_match_id,
        firstUpsetMatchId: row?.first_upset_match_id,
        thirdUpsetMatchId: row?.third_upset_match_id,
        firstUpsetEloDelta: row?.first_upset_elo_delta,
        thirdUpsetEloDelta: row?.third_upset_elo_delta,
      }),
    });
  }

  const tournamentThresholds = {
    "first-campaign": ["completed_tournament_count", 1],
    "iron-regular": ["completed_tournament_count", 3],
    "tournament-veteran": ["completed_tournament_count", 10],
  };
  if (badgeSlug in tournamentThresholds) {
    const [field, threshold] = tournamentThresholds[badgeSlug];
    const row = await firstRpcRow(ctx, "get_player_badge_tournament_summary", {
      p_player_id: input.playerId,
    });
    return thresholdEvidence(input, {
      kind: "tournament-count",
      authority: "get_player_badge_tournament_summary",
      metric: field,
      actual: numberFrom(row?.[field]),
      threshold,
      sourceIds: compactObject({
        firstCompletedTournamentId: row?.first_completed_tournament_id,
        thirdCompletedTournamentId: row?.third_completed_tournament_id,
        tenthCompletedTournamentId: row?.tenth_completed_tournament_id,
      }),
    });
  }

  if (badgeSlug === "rising-through-the-ranks") {
    const row = await firstRpcRow(ctx, "get_player_badge_bracket_progression_summary", {
      p_player_id: input.playerId,
    });
    const actual =
      row?.original_bracket &&
      row?.original_tournament_id &&
      row?.higher_bracket &&
      row?.higher_tournament_id
        ? 1
        : 0;
    return thresholdEvidence(input, {
      kind: "bracket-progression",
      authority: "get_player_badge_bracket_progression_summary",
      metric: "higher_bracket_history",
      actual,
      threshold: 1,
      sourceIds: compactObject({
        originalTournamentId: row?.original_tournament_id,
        higherTournamentId: row?.higher_tournament_id,
      }),
    });
  }

  const prestigeThresholds = {
    "first-advance": ["played_advance_win_count", 1],
    semifinalist: ["semifinalist_count", 1],
    finalist: ["finalist_count", 1],
    "academy-champion": ["academy_championship_count", 1],
    "challenge-champion": ["challenge_championship_count", 1],
    "elite-champion": ["main_championship_count", 1],
    "double-champion": ["championship_count", 2],
    "triple-crown": ["triple_crown_bracket_count", 3],
  };
  if (badgeSlug in prestigeThresholds) {
    const [field, threshold] = prestigeThresholds[badgeSlug];
    const row = await firstRpcRow(ctx, "get_player_badge_tournament_prestige_summary", {
      p_player_id: input.playerId,
    });
    return thresholdEvidence(input, {
      kind: "tournament-prestige",
      authority: "get_player_badge_tournament_prestige_summary",
      metric: field,
      actual: numberFrom(row?.[field]),
      threshold,
      sourceIds: compactObject({
        firstAdvanceMatchId: row?.first_advance_match_id,
        firstSemifinalTournamentId: row?.first_semifinal_tournament_id,
        firstFinalistTournamentId: row?.first_finalist_tournament_id,
        firstAcademyChampionshipTournamentId:
          row?.first_academy_championship_tournament_id,
        firstChallengeChampionshipTournamentId:
          row?.first_challenge_championship_tournament_id,
        firstMainChampionshipTournamentId:
          row?.first_main_championship_tournament_id,
        secondChampionshipTournamentId: row?.second_championship_tournament_id,
        tripleCrownTournamentId: row?.triple_crown_tournament_id,
      }),
    });
  }

  if (badgeSlug === "flawless-campaign") {
    const rows = await rpcRows(ctx, "get_player_badge_flawless_campaign_summary", {
      p_player_id: input.playerId,
    });
    return thresholdEvidence(input, {
      kind: "flawless-campaign",
      authority: "get_player_badge_flawless_campaign_summary",
      metric: "qualifying_flawless_rows",
      actual: rows.length,
      threshold: 1,
      sourceIds: compactObject({
        tournamentId: rows[0]?.tournament_id,
        registrationId: rows[0]?.registration_id,
        automaticByeCount: rows[0]?.automatic_bye_count,
        opponentNoShowCount: rows[0]?.opponent_no_show_count,
        verifiedGameCount: rows[0]?.verified_game_count,
      }),
    });
  }

  const seasonThresholds = {
    "season-campaigner": ["season_campaigner_count", 1],
    "season-podium": ["podium_finish_count", 1],
    "season-champion": ["champion_finish_count", 1],
  };
  if (badgeSlug in seasonThresholds) {
    const [field, threshold] = seasonThresholds[badgeSlug];
    const row = await firstRpcRow(ctx, "get_player_badge_season_summary", {
      p_player_id: input.playerId,
    });
    return thresholdEvidence(input, {
      kind: "season",
      authority: "get_player_badge_season_summary",
      metric: field,
      actual: numberFrom(row?.[field]),
      threshold,
      sourceIds: compactObject({
        firstSeasonCampaignerSeasonId: row?.first_season_campaigner_season_id,
        firstPodiumSeasonId: row?.first_podium_season_id,
        firstChampionSeasonId: row?.first_champion_season_id,
        firstPodiumRank: row?.first_podium_rank,
        firstChampionRank: row?.first_champion_rank,
      }),
    });
  }

  throw new Error(`No authority evidence rule for badge ${badgeSlug}.`);
}

async function firstRpcRow(ctx, name, args) {
  return first(await rpcRows(ctx, name, args));
}

async function rpcRows(ctx, name, args) {
  const { data, error } = await ctx.supabase.rpc(name, args);
  if (error) {
    throw new Error(`${name} authority evidence RPC failed: ${error.message}`);
  }
  if (Array.isArray(data)) return data;
  return data ? [data] : [];
}

function thresholdEvidence(input, evidence) {
  const actual = numberFrom(evidence.actual);
  const pass = input.expected
    ? actual >= evidence.threshold
    : actual < evidence.threshold;
  return {
    playerId: input.playerId,
    badgeSlug: input.badgeSlug,
    expectedAward: input.expected,
    ...evidence,
    actual,
    pass,
    reason: pass
      ? "authority_condition_matched"
      : `${evidence.metric}=${actual}, threshold=${evidence.threshold}, expectedAward=${input.expected}`,
  };
}

function recordAuthorityEvidence(ctx, scenario, evidence) {
  const existing = ctx.manifest.scenarios[scenario]?.authorityEvidence ?? [];
  recordScenario(ctx.manifest, scenario, {
    authorityEvidence: [
      ...existing,
      {
        recordedAt: new Date().toISOString(),
        ...evidence,
      },
    ],
  });
}

async function awardRows(ctx, playerId, badgeSlug) {
  const { data, error } = await ctx.supabase
    .from("player_badge_awards")
    .select("id, badge_slug, awarded_at, source_type, source_id")
    .eq("player_id", playerId)
    .eq("badge_slug", badgeSlug);

  if (error) {
    throw new Error(`Badge award assertion load failed: ${error.message}`);
  }

  return data ?? [];
}

async function awardCount(ctx, playerId) {
  const { count, error } = await ctx.supabase
    .from("player_badge_awards")
    .select("id", { count: "exact", head: true })
    .eq("player_id", playerId);
  if (error) throw new Error(`Award count failed: ${error.message}`);
  return count ?? 0;
}

async function recordActualAwardsForPlayer(ctx, playerId) {
  const { data, error } = await ctx.supabase
    .from("player_badge_awards")
    .select("id, badge_slug, awarded_at, source_type, source_id")
    .eq("player_id", playerId);
  if (error) throw new Error(`Actual award load failed: ${error.message}`);
  for (const award of data ?? []) {
    recordActualAward(ctx.manifest, {
      playerId,
      badgeSlug: award.badge_slug,
      awardId: award.id,
      awardedAt: award.awarded_at,
      sourceType: award.source_type,
      sourceId: award.source_id,
    });
  }
}

async function duplicateAwardRows(ctx) {
  const playerIds = ctx.manifest.created.playerIds;
  if (playerIds.length === 0) return [];

  const { data, error } = await ctx.supabase
    .from("player_badge_awards")
    .select("player_id, badge_slug")
    .in("player_id", playerIds);
  if (error) throw new Error(`Duplicate award scan failed: ${error.message}`);

  const counts = new Map();
  for (const award of data ?? []) {
    const key = `${award.player_id}:${award.badge_slug}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => {
      const [playerId, badgeSlug] = key.split(":");
      return { playerId, badgeSlug, count };
    });
}

async function assertNoDuplicateAwards(ctx, report) {
  const duplicates = await duplicateAwardRows(ctx);
  const passValue = duplicates.length === 0;
  recordIdempotencyAssertion(ctx.manifest, {
    scenario: "unique-player-badge-pairs",
    duplicateRows: duplicates,
    pass: passValue,
  });
  if (!passValue) {
    throw new Error(`Duplicate player badge awards detected: ${JSON.stringify(duplicates)}`);
  }
  report.duplicateAwards = "PASS";
}

async function assertNoUnexpectedAwards(ctx, report) {
  const playerIds = ctx.manifest.created.playerIds;
  if (playerIds.length === 0) {
    report.unexpectedAwards = 0;
    return;
  }

  const { data, error } = await ctx.supabase
    .from("player_badge_awards")
    .select("id, player_id, badge_slug")
    .in("player_id", playerIds);

  if (error) {
    throw new Error(`Unexpected-award scan failed: ${error.message}`);
  }

  const unexpected = (data ?? []).filter((award) => {
    const expected = expectedAwardsForPlayer(ctx, award.player_id);
    return !expected.has(award.badge_slug);
  });

  recordUnexpectedAwards(ctx.manifest, unexpected);
  report.unexpectedAwards = unexpected.length;
  if (unexpected.length > 0) {
    throw new Error(`Unexpected badge awards detected: ${JSON.stringify(unexpected)}`);
  }
}

async function playExactWins(ctx, player, winCount, scenario) {
  let remaining = winCount;
  while (remaining >= 3) {
    await createAndPlayTournament(ctx, {
      label: `${scenario}-tournament-${remaining}`,
      bracketName: "Challenge",
      players: [player],
      scenario,
    });
    remaining -= 3;
  }
  for (let index = 0; index < remaining; index += 1) {
    await playFirstMatchOnly(ctx, {
      label: `${scenario}-single-${index + 1}`,
      players: [player],
      winnerIndex: 0,
      scenario,
    });
  }
}

async function playFirstMatchOnly(ctx, input) {
  const division = await createTournamentDivision(ctx, {
    label: input.label,
    bracketName: input.bracketName ?? "Challenge",
    players: input.players,
    preservePlayerElo: input.preservePlayerElo,
  });
  const match = await firstPlayableMatch(ctx, division);
  const winnerRegistrationId =
    input.winnerIndex === 1
      ? match.player_two_registration_id
      : match.player_one_registration_id;
  const score = scoreForWinner(match, winnerRegistrationId, input.loserScore ?? 0);
  const result = await submitAndConfirmMatchResult(ctx, {
    matchId: match.id,
    winnerRegistrationId,
    submittedByRegistrationId: winnerRegistrationId,
    ...score,
    scenario: input.scenario,
    evaluateBadges: input.evaluateBadges,
  });
  return { division, match, result };
}

async function firstPlayableMatch(ctx, division) {
  const match = (await loadGeneratedMatches(ctx, division.generated.id))
    .filter((candidate) => candidate.player_one_registration_id && candidate.player_two_registration_id)
    .sort((left, right) => Number(left.match_number) - Number(right.match_number))[0];
  if (!match) {
    throw new Error(`Division ${division.tournament.id} has no playable match.`);
  }
  return loadMatch(ctx, match.id);
}

async function createFinalistLossTournament(ctx, player, bracketName, scenario) {
  await createAndPlayTournament(ctx, {
    label: scenario,
    bracketName,
    players: [player],
    scenario,
    matchPlan: ({ match }) => {
      if (!participantInMatch(match, player)) return {};
      const playerRegistrationId = registrationIdForPlayer(match, player);
      const roundNumber = Number(first(match.bracket_rounds)?.round_number ?? 0);
      const isFinal =
        String(first(match.bracket_rounds)?.name ?? "").toLowerCase() ===
        "grand final";
      return {
        winnerRegistrationId: isFinal
          ? otherRegistrationId(match, playerRegistrationId)
          : roundNumber >= 1
            ? playerRegistrationId
            : undefined,
      };
    },
  });
}

async function findCompletedMatchWithSeriesBestOf(ctx, matchIds, seriesBestOf, scenario) {
  for (const matchId of matchIds) {
    const match = await loadMatch(ctx, matchId);
    if (Number(match.series_best_of) === seriesBestOf) {
      return match.id;
    }
  }
  throw new Error(
    `${scenario} did not produce a completed best-of-${seriesBestOf} match.`
  );
}

async function assertCleanSweepSeriesEvidence(ctx, input) {
  const authority = await loadMatchAuthority(ctx, input.matchId);
  const activeGames = authority.games.filter(
    (game) => game.authority_state === "active"
  );
  const correctSeries = activeGames.every(
    (game) => Number(game.series_best_of) === input.expectedSeriesBestOf
  );
  const correctCount = activeGames.length === input.expectedFinalizedGameCount;
  const complete = activeGames.every(
    (game) => game.game_authority_complete === true
  );
  const clean = activeGames.every(
    (game) => game.winner_registration_id === input.winnerRegistrationId
  );
  const passValue = correctSeries && correctCount && complete && clean;

  recordAuthorityEvidence(ctx, input.scenario, {
    kind: "game-authority",
    authority: "match_game_result_authority",
    matchId: input.matchId,
    expectedSeriesBestOf: input.expectedSeriesBestOf,
    expectedFinalizedGameCount: input.expectedFinalizedGameCount,
    activeGameRows: activeGames.length,
    correctSeries,
    correctCount,
    complete,
    clean,
    pass: passValue,
    reason: passValue
      ? "game_authority_clean_sweep_confirmed"
      : "game_authority_did_not_match_clean_sweep_boundary",
  });

  if (!passValue) {
    throw new Error(`Clean Sweep game-authority assertion failed for ${input.scenario}.`);
  }
}

async function assertCleanSweepBrokenSeriesEvidence(ctx, input) {
  const authority = await loadMatchAuthority(ctx, input.matchId);
  const activeGames = authority.games.filter(
    (game) => game.authority_state === "active"
  );
  const correctSeries = activeGames.every(
    (game) => Number(game.series_best_of) === input.expectedSeriesBestOf
  );
  const correctCount = activeGames.length === input.expectedFinalizedGameCount;
  const complete = activeGames.every(
    (game) => game.game_authority_complete === true
  );
  const hasIndividualGameLoss = activeGames.some(
    (game) => game.winner_registration_id !== input.winnerRegistrationId
  );
  const passValue =
    correctSeries && correctCount && complete && hasIndividualGameLoss;

  recordAuthorityEvidence(ctx, input.scenario, {
    kind: "game-authority",
    authority: "match_game_result_authority",
    matchId: input.matchId,
    expectedSeriesBestOf: input.expectedSeriesBestOf,
    expectedFinalizedGameCount: input.expectedFinalizedGameCount,
    activeGameRows: activeGames.length,
    correctSeries,
    correctCount,
    complete,
    hasIndividualGameLoss,
    pass: passValue,
    reason: passValue
      ? "game_authority_non_sweep_confirmed"
      : "game_authority_did_not_match_non_sweep_boundary",
  });

  if (!passValue) {
    throw new Error(
      `Clean Sweep negative game-authority assertion failed for ${input.scenario}.`
    );
  }
}

async function assertComebackGameOrderEvidence(ctx, input) {
  const authority = await loadMatchAuthority(ctx, input.matchId);
  const activeGames = authority.games
    .filter((game) => game.authority_state === "active")
    .sort((left, right) => Number(left.game_number) - Number(right.game_number));
  const gameOne = activeGames[0];
  const gameOneLoss =
    Boolean(gameOne) &&
    gameOne.winner_registration_id !== input.seriesWinnerRegistrationId;
  const passValue =
    Boolean(gameOne) && gameOneLoss === input.expectedGameOneLoss;

  recordAuthorityEvidence(ctx, input.scenario, {
    kind: "game-authority",
    authority: "match_game_result_authority",
    matchId: input.matchId,
    gameOneWinnerRegistrationId: gameOne?.winner_registration_id ?? null,
    seriesWinnerRegistrationId: input.seriesWinnerRegistrationId,
    expectedGameOneLoss: input.expectedGameOneLoss,
    activeGameRows: activeGames.length,
    pass: passValue,
    reason: passValue
      ? "game_one_order_confirmed"
      : "game_one_order_did_not_match_comeback_boundary",
  });

  if (!passValue) {
    throw new Error(`Comeback game-order assertion failed for ${input.scenario}.`);
  }
}

async function assertFlawlessEvidence(ctx, input) {
  const [summaryResponse, segmentsResponse, authority] = await Promise.all([
    ctx.supabase.rpc("get_tournament_championship_path_summary", {
      p_tournament_id: input.tournamentId,
      p_registration_id: input.registrationId,
    }),
    ctx.supabase.rpc("get_tournament_championship_path_segments", {
      p_tournament_id: input.tournamentId,
      p_registration_id: input.registrationId,
    }),
    loadTournamentMatchAuthority(ctx, input.matchIds),
  ]);

  if (summaryResponse.error) {
    throw new Error(`Flawless summary RPC failed: ${summaryResponse.error.message}`);
  }
  if (segmentsResponse.error) {
    throw new Error(`Flawless segments RPC failed: ${segmentsResponse.error.message}`);
  }

  const summary = first(summaryResponse.data);
  const segments = segmentsResponse.data ?? [];
  const latestGameRows = authority.games.filter((game) => game.authority_state === "active");
  const latestParticipantRows = authority.participants.filter(
    (participant) =>
      !("authority_state" in participant) ||
      participant.authority_state === "active" ||
      participant.authority_state === null
  );
  const complete =
    summary?.completeness_state === "complete" &&
    Number(summary.observed_path_segment_count) ===
      Number(summary.expected_path_segment_count) &&
    segments.length === Number(summary.expected_path_segment_count);
  const gamesClean = latestGameRows.every(
    (game) =>
      game.winner_registration_id === input.registrationId ||
      !segments.some((segment) => segment.source_match_id === game.match_id)
  );
  const noShowPresent = segments.some(
    (segment) => segment.outcome_kind === "opponent_no_show"
  );
  const passValue =
    complete &&
    latestParticipantRows.length > 0 &&
    gamesClean &&
    (!input.requireNoShow || noShowPresent);

  recordCorrectionAssertion(ctx.manifest, {
    scenario: input.scenario,
    playerId: input.playerId,
    tournamentId: input.tournamentId,
    registrationId: input.registrationId,
    complete,
    gamesClean,
    noShowPresent,
    activeGameRows: latestGameRows.length,
    activeParticipantRows: latestParticipantRows.length,
    pass: passValue,
  });

  if (input.expectSummary && !passValue) {
    throw new Error(`Flawless evidence assertion failed for ${input.scenario}.`);
  }
}

async function loadTournamentMatchAuthority(ctx, matchIds) {
  if (matchIds.length === 0) return { participants: [], games: [] };

  const [participants, games] = await Promise.all([
    ctx.supabase
      .from("match_participant_outcome_authority")
      .select("*")
      .in("match_id", matchIds),
    ctx.supabase
      .from("match_game_result_authority")
      .select("*")
      .in("match_id", matchIds),
  ]);
  if (participants.error) {
    throw new Error(`Tournament participant authority load failed: ${participants.error.message}`);
  }
  if (games.error) {
    throw new Error(`Tournament game authority load failed: ${games.error.message}`);
  }
  return {
    participants: participants.data ?? [],
    games: games.data ?? [],
  };
}

async function expectPermissionFailure(ctx, scenario, operation) {
  const result = await operation();
  const code = result.error?.code ?? null;
  const message = result.error?.message ?? "";
  if (code === "PGRST301" || /invalid jwt|jwt expired/i.test(message)) {
    throw new Error(
      `Security assertion ${scenario} used an invalid or expired authenticated JWT.`
    );
  }
  const denied = isPermissionDenied(result.error);
  recordSecurityAssertion(ctx.manifest, {
    scenario,
    pass: denied,
    errorCode: code,
  });
  if (!denied) {
    throw new Error(
      `Security assertion failed for ${scenario}: ${code ?? "no-code"} ${message}`
    );
  }
}

function isPermissionDenied(error) {
  const code = error?.code ?? null;
  const message = error?.message ?? "";
  return (
    code === "42501" ||
    /permission|policy|rls|row-level|not authorized/i.test(message)
  );
}

function allowExpectedAwards(ctx, playerId, badgeSlugs, scenario) {
  for (const slug of badgeSlugs) {
    expectAward(ctx, playerId, slug, scenario);
  }
}

function markCoverage(report, badgeSlug, kind) {
  const badge = report.badgeResults.find((candidate) => candidate.slug === badgeSlug);
  if (!badge) {
    throw new Error(`Unknown badge slug ${badgeSlug}.`);
  }
  if (kind === "positive") badge.positiveStatus = "PASS";
  if (kind === "negative") badge.negativeStatus = "PASS";
  badge.status =
    badge.positiveStatus === "PASS" && badge.negativeStatus === "PASS"
      ? "PASS"
      : "INCOMPLETE";
}

function assertAllRowsCovered(report) {
  const incomplete = report.badgeResults.filter(
    (badge) => badge.status !== "PASS"
  );
  if (incomplete.length > 0) {
    throw new Error(
      `Badge scenario coverage incomplete: ${incomplete
        .map((badge) => `${badge.number}:${badge.slug}:${badge.positiveStatus}/${badge.negativeStatus}`)
        .join(", ")}`
    );
  }
}

function assertNoKnownLimitations(report) {
  if (report.limitations.length > 0) {
    throw new Error(
      `Badge staging E2E harness has known uncovered production boundaries: ${report.limitations.join(" | ")}`
    );
  }
}

function assertScenarioRegistryComplete() {
  const numbers = BADGE_SCENARIOS.map((scenario) => scenario.number);
  const slugs = BADGE_SCENARIOS.map((scenario) => scenario.slug);
  if (BADGE_SCENARIOS.length !== 30) {
    throw new Error(`Expected 30 badge scenarios, got ${BADGE_SCENARIOS.length}.`);
  }
  for (let number = 1; number <= 30; number += 1) {
    if (!numbers.includes(number)) {
      throw new Error(`Missing badge scenario number ${number}.`);
    }
  }
  if (new Set(slugs).size !== slugs.length) {
    throw new Error("Duplicate badge scenario slug.");
  }
  for (const scenario of BADGE_SCENARIOS) {
    if (!scenario.positive || !scenario.negative || !scenario.evaluator || !scenario.authority) {
      throw new Error(`Incomplete scenario registry row for ${scenario.slug}.`);
    }
    if (!COVERAGE_CLASSIFICATIONS.includes(scenario.classification)) {
      throw new Error(`Invalid coverage classification for ${scenario.slug}.`);
    }
    if (
      scenario.classification === "PARTIAL" &&
      (!Array.isArray(scenario.limitations) || scenario.limitations.length === 0)
    ) {
      throw new Error(`Partial scenario ${scenario.slug} has no explicit limitation.`);
    }
    if (scenario.classification === "SIMULATED" || scenario.classification === "BROKEN") {
      throw new Error(`${scenario.slug} is ${scenario.classification}; refusing applied run.`);
    }
    if (
      scenario.slug === "flawless-campaign" &&
      scenario.classification === "REAL E2E" &&
      !badge20RealE2EHandlersAvailable()
    ) {
      throw new Error("Flawless Campaign cannot be REAL E2E without every required handler.");
    }
  }
  for (const scenarioId of declaredScenarioIds()) {
    if (typeof SCENARIO_HANDLER_REGISTRY[scenarioId] !== "function") {
      throw new Error(`Declared scenario ${scenarioId} has no executable handler.`);
    }
  }
}

export const SCENARIO_HANDLER_REGISTRY = Object.freeze({
  "profile-positive": runProfileScenarios,
  "profile-negative": runProfileScenarios,
  "first-deployment-positive": runMatchPositiveBoundaries,
  "first-victory-positive": runMatchPositiveBoundaries,
  "battle-tested-exact": runMatchPositiveBoundaries,
  "reliable-competitor-exact": runMatchPositiveBoundaries,
  "five-victories-exact": runMatchPositiveBoundaries,
  "ten-victories-exact": runMatchPositiveBoundaries,
  "twenty-five-victories-exact": runMatchPositiveBoundaries,
  "iron-streak-exact": runMatchPositiveBoundaries,
  "unbroken-exact": runMatchPositiveBoundaries,
  "rising-through-ranks-positive": runTournamentPositiveBoundaries,
  "first-campaign-exact": runTournamentPositiveBoundaries,
  "iron-regular-exact": runTournamentPositiveBoundaries,
  "tournament-veteran-exact": runTournamentPositiveBoundaries,
  "clean-sweep-bo3-positive": runCleanSweepPositiveBoundaries,
  "clean-sweep-bo5-positive": runCleanSweepPositiveBoundaries,
  "career-positive": runCareerScenario,
  "zero-played-matches": runZeroAndLossNegatives,
  "played-loss": runZeroAndLossNegatives,
  "four-victories": runVictoryThresholdNegatives,
  "nine-victories": runVictoryThresholdNegatives,
  "twenty-four-victories": runVictoryThresholdNegatives,
  "two-win-streak": runStreakNegatives,
  "four-win-streak-then-loss": runStreakNegatives,
  "comeback-positive": runCleanSweepAndComebackBoundaries,
  "comeback-no-game1-loss": runCleanSweepAndComebackBoundaries,
  "clean-sweep-2-1": runCleanSweepAndComebackBoundaries,
  "giant-positive": runGiantBoundaries,
  "giant-plus-199": runGiantBoundaries,
  "giant-two-upsets": runGiantBoundaries,
  "same-bracket-history": runTournamentBoundaryScenarios,
  "launched-incomplete-tournament": runTournamentBoundaryScenarios,
  "two-completed-tournaments": runTournamentBoundaryScenarios,
  "nine-completed-tournaments": runTournamentBoundaryScenarios,
  "first-round-exit": runChampionshipBoundaryNegatives,
  "semifinal-exit": runChampionshipBoundaryNegatives,
  "academy-finalist-loss": runChampionshipBoundaryNegatives,
  "challenge-finalist-loss": runChampionshipBoundaryNegatives,
  "main-finalist-loss": runChampionshipBoundaryNegatives,
  "one-championship": runChampionshipBoundaryNegatives,
  "two-bracket-championships": runChampionshipBoundaryNegatives,
  "active-season-under-threshold": runSeasonBoundaryScenarios,
  "active-season-not-finalized": runSeasonBoundaryScenarios,
  "season-rank-four": runSeasonBoundaryScenarios,
  "season-rank-two": runSeasonBoundaryScenarios,
  "flawless-clean-champion-positive": runFlawlessBoundaryScenarios,
  "flawless-no-show-positive": runFlawlessBoundaryScenarios,
  [FLAWLESS_AUTOMATIC_BYE_PHASE_ONE]: runFlawlessAutomaticByePhaseOne,
  [FLAWLESS_AUTOMATIC_BYE_SCENARIO]: runFlawlessAutomaticByePhaseTwo,
  "flawless-one-game-loss": runFlawlessBoundaryScenarios,
  "flawless-admin-default": runFlawlessBoundaryScenarios,
  "flawless-incomplete-championship-path": runFlawlessIncompletePathScenario,
  "flawless-reset-invalidated-evidence": runFlawlessResetInvalidationScenario,
  "flawless-void-invalidated-evidence": runFlawlessVoidInvalidationScenario,
});

export const BADGE20_REQUIRED_SCENARIO_IDS = Object.freeze([
  "flawless-clean-champion-positive",
  "flawless-no-show-positive",
  FLAWLESS_AUTOMATIC_BYE_PHASE_ONE,
  FLAWLESS_AUTOMATIC_BYE_SCENARIO,
  "flawless-one-game-loss",
  "flawless-admin-default",
  "flawless-incomplete-championship-path",
  "flawless-reset-invalidated-evidence",
  "flawless-void-invalidated-evidence",
]);

const FLAWLESS_EVALUATOR = "evaluateFlawlessCampaignBadgeAwardsForPlayer";
const flawlessHandlerContract = (authorityAssertion) => Object.freeze({
  targetBadgeSlug: "flawless-campaign",
  evaluator: FLAWLESS_EVALUATOR,
  independentAwardAssertion: true,
  authorityAssertion,
});

export const BADGE20_HANDLER_CONTRACTS = Object.freeze({
  "flawless-clean-champion-positive": flawlessHandlerContract(
    "complete-clean-championship-path"
  ),
  "flawless-no-show-positive": flawlessHandlerContract(
    "complete-no-show-championship-path"
  ),
  [FLAWLESS_AUTOMATIC_BYE_PHASE_ONE]: flawlessHandlerContract(
    "left-fed-pending-deadline-topology"
  ),
  [FLAWLESS_AUTOMATIC_BYE_SCENARIO]: flawlessHandlerContract(
    "complete-automatic-bye-championship-path"
  ),
  "flawless-one-game-loss": flawlessHandlerContract(
    "individual-game-loss-authority"
  ),
  "flawless-admin-default": flawlessHandlerContract(
    "admin-default-path-authority"
  ),
  "flawless-incomplete-championship-path": flawlessHandlerContract(
    "incomplete-championship-path"
  ),
  "flawless-reset-invalidated-evidence": flawlessHandlerContract(
    "reset-invalidated-championship-path"
  ),
  "flawless-void-invalidated-evidence": flawlessHandlerContract(
    "void-invalidated-championship-path"
  ),
});

const BADGE20_EXPECTED_HANDLERS = Object.freeze({
  "flawless-clean-champion-positive": runFlawlessBoundaryScenarios,
  "flawless-no-show-positive": runFlawlessBoundaryScenarios,
  [FLAWLESS_AUTOMATIC_BYE_PHASE_ONE]: runFlawlessAutomaticByePhaseOne,
  [FLAWLESS_AUTOMATIC_BYE_SCENARIO]: runFlawlessAutomaticByePhaseTwo,
  "flawless-one-game-loss": runFlawlessBoundaryScenarios,
  "flawless-admin-default": runFlawlessBoundaryScenarios,
  "flawless-incomplete-championship-path":
    runFlawlessIncompletePathScenario,
  "flawless-reset-invalidated-evidence":
    runFlawlessResetInvalidationScenario,
  "flawless-void-invalidated-evidence":
    runFlawlessVoidInvalidationScenario,
});

const BADGE20_REQUIRED_AUTHORITY_ASSERTIONS = Object.freeze({
  "flawless-clean-champion-positive": "complete-clean-championship-path",
  "flawless-no-show-positive": "complete-no-show-championship-path",
  [FLAWLESS_AUTOMATIC_BYE_PHASE_ONE]: "left-fed-pending-deadline-topology",
  [FLAWLESS_AUTOMATIC_BYE_SCENARIO]:
    "complete-automatic-bye-championship-path",
  "flawless-one-game-loss": "individual-game-loss-authority",
  "flawless-admin-default": "admin-default-path-authority",
  "flawless-incomplete-championship-path": "incomplete-championship-path",
  "flawless-reset-invalidated-evidence":
    "reset-invalidated-championship-path",
  "flawless-void-invalidated-evidence": "void-invalidated-championship-path",
});

export function badge20RealE2EHandlersAvailable(
  registry = SCENARIO_HANDLER_REGISTRY,
  contracts = BADGE20_HANDLER_CONTRACTS
) {
  return BADGE20_REQUIRED_SCENARIO_IDS.every((scenarioId) => {
    const contract = contracts[scenarioId];
    return (
      registry[scenarioId] === BADGE20_EXPECTED_HANDLERS[scenarioId] &&
      contract?.targetBadgeSlug === "flawless-campaign" &&
      contract.evaluator === FLAWLESS_EVALUATOR &&
      contract.independentAwardAssertion === true &&
      contract.authorityAssertion ===
        BADGE20_REQUIRED_AUTHORITY_ASSERTIONS[scenarioId]
    );
  });
}

export function declaredScenarioIds() {
  return [
    ...new Set(
      BADGE_SCENARIOS.flatMap((scenario) => [
        scenario.positive,
        scenario.negative,
        ...scenario.positiveCases,
        ...scenario.negativeCases,
      ])
    ),
  ].sort();
}

function participantInMatch(match, player) {
  return [first(match.player_one), first(match.player_two)].some(
    (registration) => registration?.profile_id === player.id
  );
}

function registrationIdForPlayer(match, player) {
  const registration = [first(match.player_one), first(match.player_two)].find(
    (candidate) => candidate?.profile_id === player.id
  );
  if (!registration?.id) {
    throw new Error(`Player ${player.id} is not in match ${match.id}.`);
  }
  return registration.id;
}

function otherRegistrationId(match, registrationId) {
  if (registrationId === match.player_one_registration_id) {
    return match.player_two_registration_id;
  }
  if (registrationId === match.player_two_registration_id) {
    return match.player_one_registration_id;
  }
  throw new Error(`Registration ${registrationId} is not in match ${match.id}.`);
}

function latestParticipantAuthorityForRegistration(rows, registrationId) {
  return [...rows]
    .filter((row) => row.registration_id === registrationId)
    .sort((left, right) => Number(right.revision) - Number(left.revision))[0];
}

function latestGameAuthorityByNumber(rows) {
  const latest = new Map();
  for (const row of rows) {
    const gameNumber = Number(row.game_number);
    const current = latest.get(gameNumber);
    if (!current || Number(row.revision) > Number(current.revision)) {
      latest.set(gameNumber, row);
    }
  }
  return [...latest.values()].sort(
    (left, right) => Number(left.game_number) - Number(right.game_number)
  );
}

function row(number, name, slug, group, positive, negative, evaluator, authority) {
  const metadata = BADGE_RUNTIME_METADATA[slug] ?? {};
  return {
    number,
    name,
    slug,
    group,
    positive,
    negative,
    evaluator,
    authority,
    classification: metadata.classification ?? "REAL E2E",
    positiveCases: metadata.positiveCases ?? [positive],
    negativeCases: metadata.negativeCases ?? [negative],
    limitations: metadata.limitations ?? [],
  };
}

function numberFrom(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined)
  );
}

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}
