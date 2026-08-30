import { createHash } from "node:crypto";

import { createFixturePlayer } from "./fixtures.mjs";
import {
  recordActualAward,
  recordExpectedAward,
  recordScenario,
} from "./manifest.mjs";
import {
  loadMatch,
  loadMatchAuthority,
  scoreForWinner,
  submitAndConfirmMatchResult,
} from "./matches.mjs";
import { evaluateProductionBadges } from "./production-evaluator.mjs";
import { assertMutationGateOpen, STAGING_PROJECT } from "./project-guard.mjs";
import {
  createTournamentDivision,
  loadGeneratedMatches,
  recalculateTournament,
} from "./tournament.mjs";

export const FLAWLESS_AUTOMATIC_BYE_SCENARIO =
  "flawless-automatic-bye-positive";
export const FLAWLESS_AUTOMATIC_BYE_PHASE_ONE =
  "flawless-automatic-bye-phase-1";
export const FLAWLESS_AUTOMATIC_BYE_PHASE_TWO =
  "flawless-automatic-bye-phase-2";

const WAITING_PHASE = "WAITING_FOR_REAL_DEADLINE";
const COMPLETED_PHASE = "COMPLETED";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function runFlawlessAutomaticByePhaseOne(ctx, options = {}) {
  assertMutationGateOpen(ctx);
  const runtime = {
    createFixturePlayer,
    assertNoFlawlessAward,
    createTournamentDivision,
    loadGeneratedMatches,
    loadMatch,
    completeCleanMatch,
    recordScenario,
    ...options.runtime,
  };

  const champion = await runtime.createFixturePlayer(ctx, {
    label: FLAWLESS_AUTOMATIC_BYE_SCENARIO,
    bracketName: "Challenge",
  });
  await runtime.assertNoFlawlessAward(ctx, champion.id, `${FLAWLESS_AUTOMATIC_BYE_PHASE_ONE}-precondition`);
  runtime.recordScenario(ctx.manifest, FLAWLESS_AUTOMATIC_BYE_SCENARIO, {
    runMarker: ctx.runMarker,
    projectRef: ctx.project.ref,
    playerId: champion.id,
    phase: "CREATING_TOURNAMENT",
  });

  const division = await runtime.createTournamentDivision(ctx, {
    label: FLAWLESS_AUTOMATIC_BYE_SCENARIO,
    bracketName: "Challenge",
    players: [champion],
  });
  const matches = await runtime.loadGeneratedMatches(ctx, division.generated.id);
  const quarterfinals = roundMatches(matches, 1);
  const semifinals = roundMatches(matches, 2);
  const finals = roundMatches(matches, 3);

  if (quarterfinals.length !== 4 || semifinals.length !== 2 || finals.length !== 1) {
    throw new Error("Automatic-bye phase 1 requires the real eight-player bracket topology.");
  }

  const championQuarterfinal = await runtime.loadMatch(ctx, quarterfinals[0].id);
  const untouchedQuarterfinal = await runtime.loadMatch(ctx, quarterfinals[1].id);
  if (championQuarterfinal.player_one_registration_id !== division.participants[0].registration.id) {
    throw new Error("Automatic-bye champion was not seeded into the supported left feeder.");
  }

  const initialState = createAutomaticByeResumeState({
    runMarker: ctx.runMarker,
    projectRef: ctx.project.ref,
    playerId: champion.id,
    championRegistrationId: division.participants[0].registration.id,
    tournamentId: division.tournament.id,
    divisionId: division.bracket.id,
    tournamentBracketId: division.bracket.id,
    generatedBracketId: division.generated.id,
    registrationIds: division.participants.map((entry) => entry.registration.id),
    championQuarterfinalId: championQuarterfinal.id,
    untouchedQuarterfinalId: untouchedQuarterfinal.id,
    automaticByeMatchId: semifinals[0].id,
    oppositeQuarterfinalIds: [quarterfinals[2].id, quarterfinals[3].id],
    oppositeSemifinalId: semifinals[1].id,
    finalMatchId: finals[0].id,
    expectedDeadline: untouchedQuarterfinal.deadline_at,
    phase: "PREPARING",
  });
  runtime.recordScenario(ctx.manifest, FLAWLESS_AUTOMATIC_BYE_SCENARIO, initialState);

  await runtime.completeCleanMatch(ctx, championQuarterfinal, division.participants[0].registration.id);
  for (const quarterfinal of quarterfinals.slice(2)) {
    const match = await runtime.loadMatch(ctx, quarterfinal.id);
    await runtime.completeCleanMatch(ctx, match, match.player_one_registration_id);
  }

  const oppositeSemifinal = await runtime.loadMatch(ctx, semifinals[1].id);
  await runtime.completeCleanMatch(
    ctx,
    oppositeSemifinal,
    oppositeSemifinal.player_one_registration_id
  );

  const pendingMatch = await runtime.loadMatch(ctx, untouchedQuarterfinal.id);
  const pendingBye = await runtime.loadMatch(ctx, semifinals[0].id);
  if (
    pendingMatch.status !== "in_progress" ||
    pendingMatch.outcome_type !== null ||
    !pendingMatch.deadline_at
  ) {
    throw new Error("Untouched quarterfinal is not pending its real production deadline.");
  }
  if (
    pendingBye.status !== "scheduled" ||
    pendingBye.player_one_registration_id !== division.participants[0].registration.id ||
    pendingBye.player_two_registration_id !== null
  ) {
    throw new Error("Pending automatic bye is not left-fed by the intended champion.");
  }

  const resumeState = createAutomaticByeResumeState({
    ...initialState,
    expectedDeadline: pendingMatch.deadline_at,
    phase: WAITING_PHASE,
  });
  runtime.recordScenario(ctx.manifest, FLAWLESS_AUTOMATIC_BYE_SCENARIO, resumeState);

  return resumeState;
}

export async function runFlawlessAutomaticByePhaseTwo(ctx, options = {}) {
  assertMutationGateOpen(ctx);
  const runtime = {
    loadMatch,
    loadMatchAuthority,
    loadChampionshipPath,
    completeCleanMatch,
    recalculateTournament,
    rpcRows,
    recordExpectedAward,
    evaluateProductionBadges,
    flawlessAwardRows,
    recordActualAward,
    recordScenario,
    ...options.runtime,
  };
  if (!options.productionNow) {
    throw new Error("Automatic-bye phase 2 requires verified production database time.");
  }
  const productionNow = new Date(options.productionNow);
  const resume = assertAutomaticByeResumeManifest({
    manifest: ctx.manifest,
    expectedProjectRef: ctx.project.ref,
    expectedRunMarker: ctx.runMarker,
    now: productionNow,
  });

  const pendingBefore = await runtime.loadMatch(ctx, resume.untouchedQuarterfinalId);
  assertPendingDeadlineMatch(pendingBefore, resume);
  assertAutomaticByeDeadlineReached(resume.expectedDeadline, productionNow);

  const { error: deadlineError } = await ctx.supabase.rpc(
    "process_matchup_deadlines",
    { p_limit: 500 }
  );
  if (deadlineError) {
    throw new Error(`Production matchup deadline processing failed: ${deadlineError.message}`);
  }

  const [forfeitedMatch, automaticBye] = await Promise.all([
    runtime.loadMatch(ctx, resume.untouchedQuarterfinalId),
    runtime.loadMatch(ctx, resume.automaticByeMatchId),
  ]);
  if (
    forfeitedMatch.status !== "completed" ||
    forfeitedMatch.outcome_type !== "deadline_double_forfeit" ||
    forfeitedMatch.winner_registration_id !== null
  ) {
    throw new Error("Untouched quarterfinal did not become a real deadline double forfeit.");
  }
  if (
    automaticBye.status !== "completed" ||
    automaticBye.generated_bracket_id !== resume.generatedBracketId ||
    automaticBye.outcome_type !== "automatic_bye" ||
    automaticBye.player_one_registration_id !== resume.championRegistrationId ||
    automaticBye.player_two_registration_id !== null ||
    automaticBye.winner_registration_id !== resume.championRegistrationId
  ) {
    throw new Error("Downstream reconciliation did not create the supported left-fed automatic bye.");
  }

  const byeAuthority = await runtime.loadMatchAuthority(ctx, automaticBye.id);
  const participantAuthority = latestParticipantAuthority(
    byeAuthority.participants,
    resume.championRegistrationId
  );
  if (participantAuthority?.outcome_kind !== "automatic_bye") {
    throw new Error("Automatic bye participant authority is missing.");
  }
  if (byeAuthority.games.length !== 0) {
    throw new Error("Automatic bye unexpectedly created game authority.");
  }

  const pathBeforeFinal = await runtime.loadChampionshipPath(ctx, resume);
  const byePathSegment = pathBeforeFinal.segments.find(
    (segment) => segment.source_match_id === automaticBye.id
  );
  if (
    byePathSegment?.outcome_kind !== "automatic_bye" ||
    byePathSegment.authority_state !== "active"
  ) {
    throw new Error("Championship path authority does not include the automatic bye.");
  }

  const finalMatch = await runtime.loadMatch(ctx, resume.finalMatchId);
  if (
    finalMatch.generated_bracket_id !== resume.generatedBracketId ||
    ![
      finalMatch.player_one_registration_id,
      finalMatch.player_two_registration_id,
    ].includes(resume.championRegistrationId)
  ) {
    throw new Error("Automatic-bye champion did not advance into the final.");
  }
  await runtime.completeCleanMatch(ctx, finalMatch, resume.championRegistrationId);
  await runtime.recalculateTournament(ctx, resume.tournamentId);

  const completedPath = await runtime.loadChampionshipPath(ctx, resume);
  const flawlessRows = await runtime.rpcRows(
    ctx,
    "get_player_badge_flawless_campaign_summary",
    { p_player_id: resume.playerId }
  );
  const flawlessEvidence = flawlessRows.find(
    (row) => row.tournament_id === resume.tournamentId
  );
  if (
    completedPath.summary?.completeness_state !== "complete" ||
    Number(completedPath.summary.observed_path_segment_count) !==
      Number(completedPath.summary.expected_path_segment_count) ||
    completedPath.segments.length !==
      Number(completedPath.summary.expected_path_segment_count) ||
    completedPath.segments.filter(
      (segment) =>
        segment.source_match_id === resume.automaticByeMatchId &&
        segment.outcome_kind === "automatic_bye" &&
        segment.authority_state === "active"
    ).length !== 1 ||
    Number(flawlessEvidence?.automatic_bye_count) !== 1
  ) {
    throw new Error("Completed Flawless Campaign authority did not count exactly one automatic bye.");
  }

  runtime.recordExpectedAward(ctx.manifest, {
    playerId: resume.playerId,
    badgeSlug: "flawless-campaign",
    scenario: FLAWLESS_AUTOMATIC_BYE_SCENARIO,
  });
  await runtime.evaluateProductionBadges(ctx, {
    kind: "player",
    playerId: resume.playerId,
    scenario: FLAWLESS_AUTOMATIC_BYE_SCENARIO,
  });
  const awards = await runtime.flawlessAwardRows(ctx, resume.playerId);
  if (awards.length !== 1) {
    throw new Error(`Automatic-bye champion expected one Flawless Campaign award, got ${awards.length}.`);
  }
  runtime.recordActualAward(ctx.manifest, {
    playerId: resume.playerId,
    badgeSlug: "flawless-campaign",
    awardId: awards[0].id,
    awardedAt: awards[0].awarded_at,
    sourceType: awards[0].source_type,
    sourceId: awards[0].source_id,
  });

  const completedState = {
    ...resume,
    phase: COMPLETED_PHASE,
    completedAt: new Date().toISOString(),
    deadlineGateProductionTime: productionNow.toISOString(),
    deadlineOutcome: forfeitedMatch.outcome_type,
    automaticByeOutcome: automaticBye.outcome_type,
    automaticByeCount: Number(flawlessEvidence.automatic_bye_count),
    participantAuthority: participantAuthority.outcome_kind,
    gameAuthorityCount: byeAuthority.games.length,
    championshipPathState: completedPath.summary.completeness_state,
    badgeAwardId: awards[0].id,
  };
  runtime.recordScenario(ctx.manifest, FLAWLESS_AUTOMATIC_BYE_SCENARIO, completedState);
  return completedState;
}

export function createAutomaticByeResumeState(input) {
  const state = {
    runMarker: input.runMarker,
    projectRef: input.projectRef,
    playerId: input.playerId,
    championRegistrationId: input.championRegistrationId,
    tournamentId: input.tournamentId,
    divisionId: input.divisionId,
    tournamentBracketId: input.tournamentBracketId,
    generatedBracketId: input.generatedBracketId,
    registrationIds: [...(input.registrationIds ?? [])],
    championQuarterfinalId: input.championQuarterfinalId,
    untouchedQuarterfinalId: input.untouchedQuarterfinalId,
    automaticByeMatchId: input.automaticByeMatchId,
    oppositeQuarterfinalIds: [...(input.oppositeQuarterfinalIds ?? [])],
    oppositeSemifinalId: input.oppositeSemifinalId,
    finalMatchId: input.finalMatchId,
    expectedDeadline: input.expectedDeadline,
    phase: input.phase,
  };
  return {
    ...state,
    resumeIntegritySha256: hashResumeState(state),
  };
}

export function assertAutomaticByeResumeManifest({
  manifest,
  expectedProjectRef,
  expectedRunMarker,
  now = new Date(),
}) {
  if (manifest?.projectRef !== expectedProjectRef || expectedProjectRef !== STAGING_PROJECT.ref) {
    throw new Error("Automatic-bye resume manifest is not bound to the staging project.");
  }
  if (manifest?.runMarker !== expectedRunMarker) {
    throw new Error("Automatic-bye resume manifest run marker does not match.");
  }

  const state = manifest?.scenarios?.[FLAWLESS_AUTOMATIC_BYE_SCENARIO];
  if (!state || state.phase !== WAITING_PHASE) {
    throw new Error("Automatic-bye resume manifest is not waiting for its real deadline.");
  }
  if (state.runMarker !== manifest.runMarker || state.projectRef !== manifest.projectRef) {
    throw new Error("Automatic-bye resume state is outside the manifest run or project.");
  }

  const expectedHash = hashResumeState(resumeHashPayload(state));
  if (state.resumeIntegritySha256 !== expectedHash) {
    throw new Error("Automatic-bye resume manifest integrity check failed.");
  }
  assertResumeIds(state, manifest.created ?? {});
  assertAutomaticByeDeadlineReached(state.expectedDeadline, now);
  return state;
}

export function assertAutomaticByeDeadlineReached(expectedDeadline, now = new Date()) {
  const deadline = new Date(expectedDeadline);
  const current = now instanceof Date ? now : new Date(now);
  if (
    !Number.isFinite(deadline.getTime()) ||
    !Number.isFinite(current.getTime()) ||
    current.getTime() < deadline.getTime()
  ) {
    throw new Error("Automatic-bye phase 2 is blocked until the real production deadline has elapsed.");
  }
}

async function completeCleanMatch(ctx, match, winnerRegistrationId) {
  if (!winnerRegistrationId) {
    throw new Error(`Match ${match.id} has no selected production winner.`);
  }
  const score = scoreForWinner(match, winnerRegistrationId);
  await submitAndConfirmMatchResult(ctx, {
    matchId: match.id,
    winnerRegistrationId,
    submittedByRegistrationId: winnerRegistrationId,
    ...score,
    notes: `${ctx.runMarker} Badge 20 automatic-bye lifecycle`,
    scenario: FLAWLESS_AUTOMATIC_BYE_SCENARIO,
    evaluateBadges: false,
  });
}

function roundMatches(matches, roundNumber) {
  return matches
    .filter(
      (match) => Number(first(match.bracket_rounds)?.round_number) === roundNumber
    )
    .sort((left, right) => Number(left.match_number) - Number(right.match_number));
}

function assertPendingDeadlineMatch(match, resume) {
  if (
    match.generated_bracket_id !== resume.generatedBracketId ||
    match.deadline_at !== resume.expectedDeadline ||
    !["in_progress", "completed"].includes(match.status) ||
    (match.status === "completed" && match.outcome_type !== "deadline_double_forfeit")
  ) {
    throw new Error("Automatic-bye pending match no longer matches the resume manifest.");
  }
}

function latestParticipantAuthority(rows, registrationId) {
  return [...rows]
    .filter((row) => row.registration_id === registrationId)
    .sort((left, right) => Number(right.revision) - Number(left.revision))[0];
}

async function loadChampionshipPath(ctx, resume) {
  const [summary, segments] = await Promise.all([
    rpcRows(ctx, "get_tournament_championship_path_summary", {
      p_tournament_id: resume.tournamentId,
      p_registration_id: resume.championRegistrationId,
    }),
    rpcRows(ctx, "get_tournament_championship_path_segments", {
      p_tournament_id: resume.tournamentId,
      p_registration_id: resume.championRegistrationId,
    }),
  ]);
  return { summary: summary[0] ?? null, segments };
}

async function rpcRows(ctx, name, args) {
  const { data, error } = await ctx.supabase.rpc(name, args);
  if (error) {
    throw new Error(`${name} failed: ${error.message}`);
  }
  if (Array.isArray(data)) return data;
  return data ? [data] : [];
}

async function assertNoFlawlessAward(ctx, playerId, scenario) {
  const rows = await flawlessAwardRows(ctx, playerId);
  recordScenario(ctx.manifest, scenario, {
    playerId,
    preexistingFlawlessCampaignAwards: rows.length,
  });
  if (rows.length !== 0) {
    throw new Error("Automatic-bye player already owns Flawless Campaign.");
  }
}

async function flawlessAwardRows(ctx, playerId) {
  const { data, error } = await ctx.supabase
    .from("player_badge_awards")
    .select("id, awarded_at, source_type, source_id")
    .eq("player_id", playerId)
    .eq("badge_slug", "flawless-campaign");
  if (error) {
    throw new Error(`Flawless Campaign award load failed: ${error.message}`);
  }
  return data ?? [];
}

function assertResumeIds(state, created) {
  const scalarIds = [
    state.playerId,
    state.championRegistrationId,
    state.tournamentId,
    state.divisionId,
    state.tournamentBracketId,
    state.generatedBracketId,
    state.championQuarterfinalId,
    state.untouchedQuarterfinalId,
    state.automaticByeMatchId,
    state.oppositeSemifinalId,
    state.finalMatchId,
  ];
  const allIds = [
    ...scalarIds,
    ...state.registrationIds,
    ...state.oppositeQuarterfinalIds,
  ];
  if (!allIds.every((id) => typeof id === "string" && UUID_PATTERN.test(id))) {
    throw new Error("Automatic-bye resume manifest contains an invalid ID.");
  }
  const memberships = [
    [state.playerId, created.playerIds],
    [state.tournamentId, created.tournamentIds],
    [state.divisionId, created.bracketIds],
    [state.generatedBracketId, created.generatedBracketIds],
    ...state.registrationIds.map((id) => [id, created.registrationIds]),
    ...[
      state.championQuarterfinalId,
      state.untouchedQuarterfinalId,
      state.automaticByeMatchId,
      ...state.oppositeQuarterfinalIds,
      state.oppositeSemifinalId,
      state.finalMatchId,
    ].map((id) => [id, created.matchIds]),
  ];
  if (!memberships.every(([id, bucket]) => Array.isArray(bucket) && bucket.includes(id))) {
    throw new Error("Automatic-bye resume manifest references an ID outside its created resources.");
  }
  if (state.registrationIds.length !== 8 || state.oppositeQuarterfinalIds.length !== 2) {
    throw new Error("Automatic-bye resume manifest does not describe the eight-player topology.");
  }
  if (
    state.tournamentBracketId !== state.divisionId ||
    !state.registrationIds.includes(state.championRegistrationId)
  ) {
    throw new Error("Automatic-bye resume manifest does not preserve its seeded champion scope.");
  }
}

function hashResumeState(state) {
  return createHash("sha256").update(JSON.stringify(state)).digest("hex");
}

function resumeHashPayload(state) {
  return {
    runMarker: state.runMarker,
    projectRef: state.projectRef,
    playerId: state.playerId,
    championRegistrationId: state.championRegistrationId,
    tournamentId: state.tournamentId,
    divisionId: state.divisionId,
    tournamentBracketId: state.tournamentBracketId,
    generatedBracketId: state.generatedBracketId,
    registrationIds: [...state.registrationIds],
    championQuarterfinalId: state.championQuarterfinalId,
    untouchedQuarterfinalId: state.untouchedQuarterfinalId,
    automaticByeMatchId: state.automaticByeMatchId,
    oppositeQuarterfinalIds: [...state.oppositeQuarterfinalIds],
    oppositeSemifinalId: state.oppositeSemifinalId,
    finalMatchId: state.finalMatchId,
    expectedDeadline: state.expectedDeadline,
    phase: state.phase,
  };
}

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}
