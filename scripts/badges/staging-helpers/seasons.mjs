import { evaluateProductionBadges } from "./production-evaluator.mjs";
import { protectLaunchedHistory, recordCreated } from "./manifest.mjs";
import { assertMutationGateOpen } from "./project-guard.mjs";

export async function loadSeasonForTournament(ctx, tournamentId) {
  const { data, error } = await ctx.supabase
    .from("leaderboard_tournament_season_memberships")
    .select("season_id")
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  if (error) {
    throw new Error(`Season membership load failed: ${error.message}`);
  }

  const seasonId = data?.season_id ?? null;
  if (seasonId) {
    recordCreated(ctx.manifest, "seasonIds", seasonId);
    protectLaunchedHistory(ctx.manifest, { seasonIds: [seasonId] });
  }
  return seasonId;
}

export async function recalculateSeason(ctx, seasonId) {
  assertMutationGateOpen(ctx);

  const { data, error } = await ctx.supabase.rpc(
    "recalculate_leaderboard_for_season",
    {
      p_season_id: seasonId,
      p_triggered_by_clerk_user_id: ctx.adminActor,
    }
  );

  if (error) {
    throw new Error(`Season recalculation failed: ${error.message}`);
  }

  await evaluateProductionBadges(ctx, {
    kind: "season",
    seasonId,
    scenario: "season-recalculation",
  });

  return data;
}

export async function finalizeSeasonIfReady(ctx, seasonId) {
  assertMutationGateOpen(ctx);

  const { data, error } = await ctx.supabase.rpc(
    "finalize_leaderboard_main_season_if_ready",
    {
      p_season_id: seasonId,
    }
  );

  if (error) {
    throw new Error(`Season finalization failed: ${error.message}`);
  }

  await evaluateProductionBadges(ctx, {
    kind: "season",
    seasonId,
    scenario: "season-finalization",
  });

  return data;
}

export async function loadSeason(ctx, seasonId) {
  const { data, error } = await ctx.supabase
    .from("leaderboard_seasons")
    .select("id, name, is_active, finalized_at, under_review_at")
    .eq("id", seasonId)
    .single();

  if (error) {
    throw new Error(`Season load failed: ${error.message}`);
  }

  return data;
}

export async function loadSeasonStandings(ctx, seasonId) {
  const { data, error } = await ctx.supabase
    .from("leaderboard_player_season_stats")
    .select(
      "season_id, player_id, bracket_type, tournaments_played, total_points, current_rank"
    )
    .eq("season_id", seasonId)
    .eq("bracket_type", "main")
    .order("current_rank", { ascending: true });

  if (error) {
    throw new Error(`Season standings load failed: ${error.message}`);
  }

  return data ?? [];
}
