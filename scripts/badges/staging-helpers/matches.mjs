import { replayFixturePath, uploadReplayFixtures } from "./fixtures.mjs";
import { protectLaunchedHistory, recordCreated } from "./manifest.mjs";
import { assertMutationGateOpen } from "./project-guard.mjs";
import { evaluateProductionBadges } from "./production-evaluator.mjs";

export async function submitAndConfirmMatchResult(ctx, input) {
  assertMutationGateOpen(ctx);

  const match = await loadMatch(ctx, input.matchId);
  const submitterRegistrationId =
    input.submittedByRegistrationId ?? input.winnerRegistrationId;
  const submitter = registrationFor(match, submitterRegistrationId);
  const confirmer = otherRegistration(match, submitterRegistrationId);
  const replayCount = input.playerOneScore + input.playerTwoScore;

  const { data: prepared, error: prepareError } = await ctx.supabase.rpc(
    "prepare_match_replay_upload_attempt",
    {
      p_match_id: input.matchId,
      p_submitted_by_clerk_user_id: submitter.clerk_user_id,
      p_winner_registration_id: input.winnerRegistrationId,
      p_player_one_score: input.playerOneScore,
      p_player_two_score: input.playerTwoScore,
      p_declared_replay_sizes: Array.from({ length: replayCount }, () => 128),
    }
  );

  if (prepareError) {
    throw new Error(`Replay attempt preparation failed: ${prepareError.message}`);
  }

  const attempt = parseReplayAttempt(prepared);
  recordCreated(ctx.manifest, "replayAttemptIds", attempt.attemptId);
  protectLaunchedHistory(ctx.manifest, {
    replayAttemptIds: [attempt.attemptId],
  });

  const hashes = await uploadReplayFixtures(ctx, attempt.paths.slice(0, replayCount));

  const { data: claim, error: claimError } = await ctx.supabase.rpc(
    "claim_match_replay_attempt_finalization",
    {
      p_attempt_id: attempt.attemptId,
      p_match_id: input.matchId,
      p_submitted_by_clerk_user_id: submitter.clerk_user_id,
      p_winner_registration_id: input.winnerRegistrationId,
      p_player_one_score: input.playerOneScore,
      p_player_two_score: input.playerTwoScore,
    }
  );

  if (claimError) {
    throw new Error(`Replay finalization claim failed: ${claimError.message}`);
  }

  const claimId = parseFinalizationClaim(claim);
  const { data: report, error: commitError } = await ctx.supabase.rpc(
    "commit_match_replay_attempt_result",
    {
      p_attempt_id: attempt.attemptId,
      p_finalization_claim_id: claimId,
      p_match_id: input.matchId,
      p_submitted_by_clerk_user_id: submitter.clerk_user_id,
      p_replay_content_hashes: hashes,
      p_notes: input.notes ?? `${ctx.runMarker} replay result`,
    }
  );

  if (commitError) {
    throw new Error(`Replay result commit failed: ${commitError.message}`);
  }

  const reportGroupId = parseReportGroupId(report);
  recordCreated(ctx.manifest, "reportGroupIds", reportGroupId);
  protectLaunchedHistory(ctx.manifest, { reportGroupIds: [reportGroupId] });

  const { error: confirmError } = await ctx.supabase.rpc(
    "confirm_match_result_report_group",
    {
      p_report_group_id: reportGroupId,
      p_confirmed_by_clerk_user_id: confirmer.clerk_user_id,
    }
  );

  if (confirmError) {
    throw new Error(`Report group confirmation failed: ${confirmError.message}`);
  }

  if (input.evaluateBadges !== false) {
    await evaluateProductionBadges(ctx, {
      kind: "report-group",
      reportGroupId,
      scenario: input.scenario ?? "match-result-report-group",
    });
  }

  return {
    matchId: input.matchId,
    reportGroupId,
    replayAttemptId: attempt.attemptId,
  };
}

export async function submitAndConfirmNoShow(ctx, input) {
  assertMutationGateOpen(ctx);

  const match = await loadMatch(ctx, input.matchId);
  const reporter = registrationFor(match, input.reporterRegistrationId);
  const missing = registrationFor(match, input.noShowRegistrationId);

  const { data: report, error } = await ctx.supabase.rpc(
    "submit_match_no_show_report",
    {
      p_match_id: input.matchId,
      p_submitted_by_clerk_user_id: reporter.clerk_user_id,
      p_no_show_registration_id: missing.id,
      p_notes: input.notes ?? `${ctx.runMarker} no-show fixture`,
    }
  );

  if (error) {
    throw new Error(`No-show report submission failed: ${error.message}`);
  }

  const reportGroupId = parseReportGroupId(report);
  recordCreated(ctx.manifest, "reportGroupIds", reportGroupId);
  protectLaunchedHistory(ctx.manifest, { reportGroupIds: [reportGroupId] });

  const { error: confirmError } = await ctx.supabase.rpc(
    "confirm_match_result_report_group",
    {
      p_report_group_id: reportGroupId,
      p_confirmed_by_clerk_user_id: missing.clerk_user_id,
    }
  );

  if (confirmError) {
    throw new Error(`No-show confirmation failed: ${confirmError.message}`);
  }

  if (input.evaluateBadges !== false) {
    await evaluateProductionBadges(ctx, {
      kind: "report-group",
      reportGroupId,
      scenario: input.scenario ?? "match-no-show-report-group",
    });
  }

  return {
    matchId: input.matchId,
    reportGroupId,
  };
}

export async function submitPerGameReportGroupAndConfirm(ctx, input) {
  assertMutationGateOpen(ctx);

  const match = await loadMatch(ctx, input.matchId);
  const submitterRegistrationId =
    input.submittedByRegistrationId ?? input.winnerRegistrationId;
  const submitter = registrationFor(match, submitterRegistrationId);
  const confirmer = otherRegistration(match, submitterRegistrationId);
  const gameWinners = [...input.gameWinners];
  const replayPaths = gameWinners.map((_, index) =>
    replayFixturePath(ctx, input.matchId, index + 1, "per-game")
  );
  const replayHashes = await uploadReplayFixtures(ctx, replayPaths);
  const submissionIds = [];

  for (const [index, winnerRegistrationId] of gameWinners.entries()) {
    if (
      winnerRegistrationId !== match.player_one_registration_id &&
      winnerRegistrationId !== match.player_two_registration_id
    ) {
      throw new Error(`Game ${index + 1} winner is not in match ${match.id}.`);
    }

    const { data, error } = await ctx.supabase
      .from("match_result_submissions")
      .insert({
        submission_number: index + 1,
        game_number: index + 1,
        match_id: input.matchId,
        submitted_by_clerk_user_id: submitter.clerk_user_id,
        submitted_by_registration_id: submitter.id,
        claimed_winner_registration_id: winnerRegistrationId,
        player_one_score: input.playerOneScore,
        player_two_score: input.playerTwoScore,
        replay_storage_path: replayPaths[index],
        screenshot_storage_path: null,
        replay_content_hash: replayHashes[index],
        notes: index === 0 ? input.notes ?? `${ctx.runMarker} per-game result` : null,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(`Per-game submission insert failed: ${error.message}`);
    }

    submissionIds.push(data.id);
    recordCreated(ctx.manifest, "submissionIds", data.id);
    protectLaunchedHistory(ctx.manifest, { submissionIds: [data.id] });
  }

  const { data: reportGroupId, error: groupError } = await ctx.supabase.rpc(
    "create_match_result_report_group",
    {
      p_match_id: input.matchId,
      p_submitted_by_clerk_user_id: submitter.clerk_user_id,
      p_winner_registration_id: input.winnerRegistrationId,
      p_player_one_score: input.playerOneScore,
      p_player_two_score: input.playerTwoScore,
      p_submission_ids: submissionIds,
      p_replay_storage_path: replayPaths[0],
    }
  );

  if (groupError) {
    throw new Error(`Per-game report group creation failed: ${groupError.message}`);
  }

  const parsedReportGroupId =
    typeof reportGroupId === "string" ? reportGroupId : reportGroupId?.id;

  if (typeof parsedReportGroupId !== "string") {
    throw new Error("Per-game report group did not return an ID.");
  }

  recordCreated(ctx.manifest, "reportGroupIds", parsedReportGroupId);
  protectLaunchedHistory(ctx.manifest, {
    reportGroupIds: [parsedReportGroupId],
  });

  const { error: confirmError } = await ctx.supabase.rpc(
    "confirm_match_result_report_group",
    {
      p_report_group_id: parsedReportGroupId,
      p_confirmed_by_clerk_user_id: confirmer.clerk_user_id,
    }
  );

  if (confirmError) {
    throw new Error(`Per-game report group confirmation failed: ${confirmError.message}`);
  }

  if (input.evaluateBadges !== false) {
    await evaluateProductionBadges(ctx, {
      kind: "report-group",
      reportGroupId: parsedReportGroupId,
      scenario: input.scenario ?? "per-game-report-group",
    });
  }

  return {
    matchId: input.matchId,
    reportGroupId: parsedReportGroupId,
    submissionIds,
  };
}

export async function applyAdminMatchResult(ctx, input) {
  assertMutationGateOpen(ctx);

  const { error } = await ctx.supabase.rpc("apply_admin_official_match_result", {
    p_match_id: input.matchId,
    p_player_one_score: input.playerOneScore,
    p_player_two_score: input.playerTwoScore,
    p_winner_registration_id: input.winnerRegistrationId,
    p_decided_by: ctx.adminActor,
  });

  if (error) {
    throw new Error(`Admin match result failed: ${error.message}`);
  }

  if (input.evaluateBadges !== false) {
    await evaluateProductionBadges(ctx, {
      kind: "match",
      matchId: input.matchId,
      scenario: input.scenario ?? "admin-match-result",
    });
  }

  return { matchId: input.matchId };
}

export async function resetMatch(ctx, matchId) {
  assertMutationGateOpen(ctx);

  const { error } = await ctx.supabase.rpc("admin_reset_tournament_match", {
    p_match_id: matchId,
    p_reset_by: ctx.adminActor,
  });

  if (error) {
    throw new Error(`Admin match reset failed: ${error.message}`);
  }
}

export async function voidTournament(ctx, tournamentId, reason) {
  assertMutationGateOpen(ctx);

  const { data, error } = await ctx.supabase.rpc("void_tournament", {
    p_tournament_id: tournamentId,
    p_reason: reason ?? `${ctx.runMarker} badge E2E void`,
    p_actor_clerk_user_id: ctx.adminActor,
  });

  if (error) {
    throw new Error(`Tournament void failed: ${error.message}`);
  }

  return data;
}

export async function loadMatch(ctx, matchId) {
  const { data, error } = await ctx.supabase
    .from("tournament_matches")
    .select(
      "id, generated_bracket_id, round_id, match_number, player_one_registration_id, player_two_registration_id, player_one_score, player_two_score, winner_registration_id, status, series_best_of, activation_version, activated_at, deadline_at, outcome_type, deadline_ruled_at, bracket_rounds!inner(round_number, name), player_one:registrations!tournament_matches_player_one_registration_id_fkey(id, profile_id, clerk_user_id, player_name), player_two:registrations!tournament_matches_player_two_registration_id_fkey(id, profile_id, clerk_user_id, player_name)"
    )
    .eq("id", matchId)
    .single();

  if (error) {
    throw new Error(`Match load failed: ${error.message}`);
  }

  return data;
}

export async function loadMatchAuthority(ctx, matchId) {
  const [participants, games] = await Promise.all([
    ctx.supabase
      .from("match_participant_outcome_authority")
      .select("*")
      .eq("match_id", matchId)
      .order("registration_id", { ascending: true })
      .order("revision", { ascending: true }),
    ctx.supabase
      .from("match_game_result_authority")
      .select("*")
      .eq("match_id", matchId)
      .order("game_number", { ascending: true })
      .order("revision", { ascending: true }),
  ]);

  if (participants.error) {
    throw new Error(
      `Participant authority load failed: ${participants.error.message}`
    );
  }

  if (games.error) {
    throw new Error(`Game authority load failed: ${games.error.message}`);
  }

  return {
    participants: participants.data ?? [],
    games: games.data ?? [],
  };
}

export function scoreForWinner(match, winnerRegistrationId, loserScore = 0) {
  const winsRequired = Math.floor(Number(match.series_best_of) / 2) + 1;

  if (winnerRegistrationId === match.player_one_registration_id) {
    return {
      playerOneScore: winsRequired,
      playerTwoScore: loserScore,
    };
  }

  return {
    playerOneScore: loserScore,
    playerTwoScore: winsRequired,
  };
}

export function gameWinnersForScore(match, winnerRegistrationId, loserScore = 0) {
  const loserRegistrationId =
    winnerRegistrationId === match.player_one_registration_id
      ? match.player_two_registration_id
      : match.player_one_registration_id;
  const winsRequired = Math.floor(Number(match.series_best_of) / 2) + 1;
  const gameWinners = [];

  for (let index = 0; index < loserScore; index += 1) {
    gameWinners.push(loserRegistrationId);
  }
  for (let index = 0; index < winsRequired; index += 1) {
    gameWinners.push(winnerRegistrationId);
  }

  return gameWinners;
}

function parseReplayAttempt(value) {
  if (typeof value !== "object" || value === null) {
    throw new Error("Replay attempt response was not an object.");
  }

  const attemptId = value.attempt_id;
  const paths = value.replay_storage_paths;

  if (
    typeof attemptId !== "string" ||
    !Array.isArray(paths) ||
    !paths.every((path) => typeof path === "string")
  ) {
    throw new Error("Replay attempt response did not contain valid paths.");
  }

  return { attemptId, paths };
}

function parseFinalizationClaim(value) {
  if (
    typeof value !== "object" ||
    value === null ||
    value.outcome !== "claimed" ||
    typeof value.claim_id !== "string"
  ) {
    throw new Error("Replay finalization claim response was invalid.");
  }

  return value.claim_id;
}

function parseReportGroupId(value) {
  if (typeof value !== "object" || value === null) {
    throw new Error("Report commit response was not an object.");
  }

  const id = value.report_group_id ?? value.reportGroupId;

  if (typeof id !== "string") {
    throw new Error("Report commit response did not include report_group_id.");
  }

  return id;
}

function registrationFor(match, registrationId) {
  const registrations = [first(match.player_one), first(match.player_two)];
  const registration = registrations.find(
    (candidate) => candidate?.id === registrationId
  );

  if (!registration) {
    throw new Error(`Registration ${registrationId} is not in match ${match.id}.`);
  }

  return registration;
}

function otherRegistration(match, registrationId) {
  const registrations = [first(match.player_one), first(match.player_two)];
  const registration = registrations.find(
    (candidate) => candidate && candidate.id !== registrationId
  );

  if (!registration) {
    throw new Error(`Match ${match.id} has no opposing registration.`);
  }

  return registration;
}

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}
