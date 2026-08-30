import {
  OFFICIAL_MAP_POOL_IDS,
  bracketNameToType,
  createFixturePlayer,
  createRegistration,
  eloForBracket,
  shortId,
  slugPart,
  updatePlayerElo,
} from "./fixtures.mjs";
import {
  classifyCleanup,
  protectLaunchedHistory,
  recordCreated,
  recordScenario,
} from "./manifest.mjs";
import { assertMutationGateOpen } from "./project-guard.mjs";
import {
  applyAdminMatchResult,
  loadMatch,
  scoreForWinner,
  submitAndConfirmMatchResult,
  submitAndConfirmNoShow,
  submitPerGameReportGroupAndConfirm,
} from "./matches.mjs";
import { evaluateProductionBadges } from "./production-evaluator.mjs";

export async function createTournamentDivision(ctx, input) {
  assertMutationGateOpen(ctx);

  const bracketName = input.bracketName ?? "Challenge";
  const label = slugPart(input.label ?? bracketName);
  const title = `Badge E2E ${label} ${shortId(ctx.runMarker)}`;
  const slug = slugPart(`${ctx.runMarker}-${label}`).slice(0, 80);
  const now = Date.now();
  const openAt = new Date(now - 60 * 60 * 1000).toISOString();
  const closeAt = new Date(now + 24 * 60 * 60 * 1000).toISOString();
  const bracketConfig = bracketConfigForName(bracketName);

  const { data: tournamentId, error: saveError } = await ctx.supabase.rpc(
    "save_tournament",
    {
      p_tournament_id: null,
      p_title: title,
      p_slug: slug,
      p_description: `${ctx.runMarker} staging badge E2E fixture`,
      p_banner_image_url: `https://example.invalid/${ctx.runMarker}/${label}.png`,
      p_registration_open_at: openAt,
      p_registration_close_at: closeAt,
      p_start_date: null,
      p_end_date: null,
      p_status: "registration_open",
      p_format: "1v1",
      p_prize_pool: "",
      p_rules_url: null,
      p_battlefy_url: null,
      p_registration_enabled: true,
      p_grand_final_at: null,
      p_rule_format: "format_a",
      p_result_confirmation_window_minutes: 30,
      p_brackets: [bracketConfig],
    }
  );

  if (saveError || typeof tournamentId !== "string") {
    throw new Error(`Tournament fixture creation failed: ${saveError?.message ?? "no ID"}`);
  }

  recordCreated(ctx.manifest, "tournamentIds", tournamentId);
  classifyCleanup(
    ctx.manifest,
    tournamentId,
    "FAILED_BEFORE_LAUNCH",
    "Tournament can be deleted only if it fails before launch."
  );

  const tournament = await loadTournament(ctx, tournamentId);
  const bracket = await loadTournamentBracket(ctx, tournamentId, bracketName);
  recordCreated(ctx.manifest, "bracketIds", bracket.id);

  const suppliedPlayers = input.players ?? [];
  const participants = [];
  const fillTo = Number.isInteger(input.fillTo)
    ? Math.min(Math.max(input.fillTo, suppliedPlayers.length), 8)
    : 8;

  for (const player of suppliedPlayers.slice(0, fillTo)) {
    if (!input.preservePlayerElo) {
      await updatePlayerElo(ctx, player, eloForBracket(bracketName));
    }
    participants.push({ player });
  }

  for (let index = participants.length; index < fillTo; index += 1) {
    const player = await createFixturePlayer(ctx, {
      label: `${label}-fill-${index + 1}`,
      bracketName,
    });
    participants.push({ player });
  }

  for (const participant of participants) {
    participant.registration = await createRegistration(ctx, {
      player: participant.player,
      tournament,
      bracket,
      status: "approved",
    });
  }

  const { data: generatedId, error: generateError } = await ctx.supabase.rpc(
    "generate_tournament_bracket",
    {
      p_tournament_bracket_id: bracket.id,
      p_generated_by: ctx.adminActor,
    }
  );

  if (generateError) {
    throw new Error(`Bracket generation failed: ${generateError.message}`);
  }

  const generated = await loadGeneratedBracket(
    ctx,
    typeof generatedId === "string" ? generatedId : null,
    bracket.id
  );
  recordCreated(ctx.manifest, "generatedBracketIds", generated.id);

  const assignments = participants.map((participant, index) => ({
    slot_number: index + 1,
    registration_id: participant.registration.id,
  }));
  const { error: assignmentError } = await ctx.supabase.rpc(
    "save_bracket_assignments",
    {
      p_generated_bracket_id: generated.id,
      p_assignments: assignments,
      p_updated_by: ctx.adminActor,
    }
  );

  if (assignmentError) {
    throw new Error(`Bracket assignment failed: ${assignmentError.message}`);
  }

  const { error: mapPoolError } = await ctx.supabase.rpc(
    "publish_tournament_bracket_map_pools",
    {
      p_tournament_id: tournament.id,
      p_bracket_ids: [bracket.id],
      p_map_ids: OFFICIAL_MAP_POOL_IDS,
      p_actor_clerk_user_id: ctx.adminActor,
    }
  );

  if (mapPoolError) {
    throw new Error(`Map-pool publication failed: ${mapPoolError.message}`);
  }

  const { error: launchError } = await ctx.supabase.rpc(
    "launch_tournament_division",
    {
      p_tournament_bracket_id: bracket.id,
      p_actor_clerk_user_id: ctx.adminActor,
    }
  );

  if (launchError) {
    throw new Error(`Division launch failed: ${launchError.message}`);
  }

  classifyCleanup(
    ctx.manifest,
    tournamentId,
    "MUST_RETAIN_AS_STAGING_HISTORY",
    "Launched tournaments are retained; the harness does not hard-delete history."
  );
  protectLaunchedHistory(ctx.manifest, {
    tournamentIds: [tournamentId],
    playerIds: participants.map((participant) => participant.player.id),
    registrationIds: participants.map(
      (participant) => participant.registration.id
    ),
    registrationAcceptanceIds: participants
      .map(
        (participant) =>
          participant.registration.registrationAcceptanceId
      )
      .filter(Boolean),
    bracketIds: [bracket.id],
    generatedBracketIds: [generated.id],
  });

  const matches = await loadGeneratedMatches(ctx, generated.id);
  for (const match of matches) {
    recordCreated(ctx.manifest, "matchIds", match.id);
  }
  protectLaunchedHistory(ctx.manifest, {
    matchIds: matches.map((match) => match.id),
  });

  return {
    bracket,
    bracketName,
    bracketType: bracketNameToType(bracketName),
    generated,
    matches,
    participants,
    tournament,
  };
}

export async function playSingleEliminationTournament(ctx, input) {
  assertMutationGateOpen(ctx);

  const division = input.division;
  const completedMatches = [];
  const maxIterations = 10;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const openMatches = (await loadGeneratedMatches(ctx, division.generated.id))
      .filter((match) =>
        match.player_one_registration_id &&
        match.player_two_registration_id &&
        match.status !== "completed"
      )
      .sort(compareMatches);

    if (openMatches.length === 0) {
      break;
    }

    for (const match of openMatches) {
      const freshMatch = await loadMatch(ctx, match.id);
      const plan =
        input.matchPlan?.({
          match: freshMatch,
          completedMatches,
          division,
        }) ?? {};
      const winnerRegistrationId =
        plan.winnerRegistrationId ??
        winnerForMatch(freshMatch, input.championRegistrationId);
      const loserScore = Number.isInteger(plan.loserScore)
        ? plan.loserScore
        : 0;
      const score = scoreForWinner(freshMatch, winnerRegistrationId, loserScore);

      if (plan.mode === "no-show") {
        await submitAndConfirmNoShow(ctx, {
          matchId: freshMatch.id,
          reporterRegistrationId: winnerRegistrationId,
          noShowRegistrationId: otherRegistrationId(freshMatch, winnerRegistrationId),
          notes: `${ctx.runMarker} no-show tournament fixture`,
          scenario: input.scenario ?? "tournament-no-show-result",
          evaluateBadges: input.evaluateBadges,
        });
      } else if (plan.mode === "admin") {
        await applyAdminMatchResult(ctx, {
          matchId: freshMatch.id,
          winnerRegistrationId,
          ...score,
          scenario: input.scenario ?? "tournament-admin-result",
          evaluateBadges: input.evaluateBadges,
        });
      } else if (plan.mode === "per-game") {
        await submitPerGameReportGroupAndConfirm(ctx, {
          matchId: freshMatch.id,
          winnerRegistrationId,
          submittedByRegistrationId: winnerRegistrationId,
          playerOneScore: score.playerOneScore,
          playerTwoScore: score.playerTwoScore,
          gameWinners:
            plan.gameWinners ??
            gameWinnersForScore(freshMatch, winnerRegistrationId, loserScore),
          notes: `${ctx.runMarker} per-game tournament fixture`,
          scenario: input.scenario ?? "tournament-per-game-result",
          evaluateBadges: input.evaluateBadges,
        });
      } else {
        await submitAndConfirmMatchResult(ctx, {
          matchId: freshMatch.id,
          winnerRegistrationId,
          submittedByRegistrationId: winnerRegistrationId,
          playerOneScore: score.playerOneScore,
          playerTwoScore: score.playerTwoScore,
          notes: `${ctx.runMarker} tournament fixture`,
          scenario: input.scenario ?? "tournament-match-result",
          evaluateBadges: input.evaluateBadges,
        });
      }

      completedMatches.push(freshMatch.id);
    }

    const currentTournament = await loadTournament(ctx, division.tournament.id);
    if (currentTournament.status === "completed") {
      break;
    }
  }

  const tournament = await loadTournament(ctx, division.tournament.id);
  if (tournament.status !== "completed") {
    throw new Error(
      `Tournament ${division.tournament.id} did not complete; status=${tournament.status}`
    );
  }

  await recalculateTournament(ctx, tournament.id);
  if (input.evaluateBadges !== false) {
    await evaluateProductionBadges(ctx, {
      kind: "tournament",
      tournamentId: tournament.id,
      scenario: input.scenario ?? "completed-tournament",
    });
  }

  return {
    completedMatches,
    tournament,
  };
}

export async function createAndPlayTournament(ctx, input) {
  assertMutationGateOpen(ctx);

  const division = await createTournamentDivision(ctx, input);
  const championRegistrationId =
    input.championRegistrationId ?? division.participants[0].registration.id;
  const result = await playSingleEliminationTournament(ctx, {
    division,
    championRegistrationId,
    matchPlan: input.matchPlan,
    scenario: input.scenario,
    evaluateBadges: input.evaluateBadges,
  });

  recordScenario(ctx.manifest, input.label ?? division.tournament.id, {
    tournamentId: division.tournament.id,
    bracketId: division.bracket.id,
    generatedBracketId: division.generated.id,
    completedMatchIds: result.completedMatches,
  });

  return {
    ...division,
    ...result,
    championRegistrationId,
  };
}

export async function recalculateTournament(ctx, tournamentId) {
  assertMutationGateOpen(ctx);

  const { data, error } = await ctx.supabase.rpc(
    "recalculate_leaderboard_for_tournament",
    {
      p_tournament_id: tournamentId,
      p_triggered_by_clerk_user_id: ctx.adminActor,
    }
  );

  if (error) {
    throw new Error(`Leaderboard tournament recalculation failed: ${error.message}`);
  }

  return data;
}

export async function loadTournament(ctx, tournamentId) {
  const { data, error } = await ctx.supabase
    .from("tournaments")
    .select("id, title, slug, status, first_completed_at")
    .eq("id", tournamentId)
    .single();

  if (error) {
    throw new Error(`Tournament load failed: ${error.message}`);
  }

  return data;
}

export async function loadGeneratedMatches(ctx, generatedBracketId) {
  const { data, error } = await ctx.supabase
    .from("tournament_matches")
    .select(
      "id, generated_bracket_id, round_id, match_number, player_one_registration_id, player_two_registration_id, player_one_score, player_two_score, winner_registration_id, status, series_best_of, bracket_rounds!inner(round_number, name)"
    )
    .eq("generated_bracket_id", generatedBracketId);

  if (error) {
    throw new Error(`Generated matches load failed: ${error.message}`);
  }

  return data ?? [];
}

export function gameWinnersForScore(match, winnerRegistrationId, loserScore = 0) {
  const loserRegistrationId = otherRegistrationId(match, winnerRegistrationId);
  const winsRequired = Math.floor(Number(match.series_best_of) / 2) + 1;
  const winners = [];

  for (let index = 0; index < loserScore; index += 1) {
    winners.push(loserRegistrationId);
  }
  for (let index = 0; index < winsRequired; index += 1) {
    winners.push(winnerRegistrationId);
  }

  return winners;
}

function bracketConfigForName(bracketName) {
  if (bracketName === "Academy") {
    return {
      name: "Academy",
      elo_rules: "Below 1100 ELO",
      max_players: 8,
    };
  }

  if (bracketName === "Main") {
    return {
      name: "Main",
      elo_rules: "1400+ ELO",
      max_players: 8,
    };
  }

  return {
    name: "Challenge",
    elo_rules: "1100-1399 ELO",
    max_players: 8,
  };
}

async function loadTournamentBracket(ctx, tournamentId, bracketName) {
  const { data, error } = await ctx.supabase
    .from("tournament_brackets")
    .select("id, tournament_id, name, max_players")
    .eq("tournament_id", tournamentId)
    .eq("name", bracketName)
    .single();

  if (error) {
    throw new Error(`Tournament bracket load failed: ${error.message}`);
  }

  return data;
}

async function loadGeneratedBracket(ctx, generatedId, bracketId) {
  let query = ctx.supabase
    .from("generated_brackets")
    .select("id, tournament_bracket_id, format, slot_count, participant_count")
    .eq("tournament_bracket_id", bracketId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (generatedId) {
    query = ctx.supabase
      .from("generated_brackets")
      .select("id, tournament_bracket_id, format, slot_count, participant_count")
      .eq("id", generatedId)
      .limit(1);
  }

  const { data, error } = await query.single();

  if (error) {
    throw new Error(`Generated bracket load failed: ${error.message}`);
  }

  return data;
}

function winnerForMatch(match, championRegistrationId) {
  if (
    championRegistrationId &&
    [
      match.player_one_registration_id,
      match.player_two_registration_id,
    ].includes(championRegistrationId)
  ) {
    return championRegistrationId;
  }

  return match.player_one_registration_id;
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

function compareMatches(left, right) {
  const leftRound = Number(first(left.bracket_rounds)?.round_number ?? 0);
  const rightRound = Number(first(right.bracket_rounds)?.round_number ?? 0);
  if (leftRound !== rightRound) return leftRound - rightRound;
  return Number(left.match_number) - Number(right.match_number);
}

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}
