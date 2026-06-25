import "server-only";

import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type CustomClaims = {
  metadata?: {
    role?: string;
  };
};

type RecalculationRunStatus = "pending" | "completed" | "failed";
type RecalculationScope = "tournament" | "season" | "all_time";

type RecalculationRunRow = {
  id: string;
  scope: RecalculationScope;
  status: RecalculationRunStatus;
  started_at: string;
  finished_at: string | null;
  notes: string | null;
  tournament_id: string | null;
  season_id: string | null;
};

type CompletedTournamentRow = {
  id: string;
  title: string;
  grand_final_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type LeaderboardSeasonRow = {
  id: string;
  name: string;
};

export type LeaderboardAdminActionResult = {
  status: "success" | "error" | "pending";
  message: string;
  runId?: string;
  deletedRunIds?: string[];
};

export type LeaderboardCompletedTournament = {
  id: string;
  title: string;
  date: string | null;
};

export type LeaderboardRecalculationRun = {
  id: string;
  scope: RecalculationScope;
  status: RecalculationRunStatus;
  startedAt: string;
  finishedAt: string | null;
  notes: string | null;
  tournamentId: string | null;
  tournamentTitle: string | null;
  seasonId: string | null;
  seasonName: string | null;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function recalculateLeaderboardForTournament(
  tournamentId: string
): Promise<LeaderboardAdminActionResult> {
  const admin = await requireAdminUser();

  if (!admin) {
    return errorResult("Only administrators can recalculate leaderboards.");
  }

  if (!uuidPattern.test(tournamentId)) {
    return errorResult("Select a completed tournament before recalculating.");
  }

  const supabase = createSupabaseAdminClient();
  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id, status")
    .eq("id", tournamentId)
    .maybeSingle();

  if (tournamentError) {
    console.error("Tournament leaderboard validation failed:", tournamentError);
    return errorResult("Tournament could not be validated for recalculation.");
  }

  if (!tournament) {
    return errorResult("Tournament was not found.");
  }

  if (tournament.status !== "completed") {
    return errorResult(
      "Only completed tournaments can be recalculated for leaderboard points."
    );
  }

  const { data, error } = await supabase.rpc(
    "recalculate_leaderboard_for_tournament",
    {
      p_tournament_id: tournamentId,
      p_triggered_by_clerk_user_id: admin.userId,
    }
  );

  if (error) {
    console.error("Tournament leaderboard recalculation RPC failed:", error);
    return errorResult("Tournament leaderboard recalculation failed.");
  }

  return resolveRunResult(
    supabase,
    data,
    "Tournament leaderboard recalculated.",
    "Tournament leaderboard recalculation failed."
  );
}

export async function recalculateLeaderboardForCurrentSeason(): Promise<LeaderboardAdminActionResult> {
  const admin = await requireAdminUser();

  if (!admin) {
    return errorResult("Only administrators can recalculate leaderboards.");
  }

  const supabase = createSupabaseAdminClient();
  const { data: activeSeason, error: activeSeasonError } = await supabase
    .from("leaderboard_seasons")
    .select("id")
    .eq("is_active", true)
    .maybeSingle();

  if (activeSeasonError) {
    console.error("Active leaderboard season lookup failed:", activeSeasonError);
    return errorResult("Current leaderboard season could not be loaded.");
  }

  let seasonId =
    typeof activeSeason?.id === "string" ? activeSeason.id : null;

  if (!seasonId) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: createdSeasonId, error: seasonError } = await supabase.rpc(
      "get_or_create_leaderboard_season",
      {
        p_date: today,
      }
    );

    if (seasonError || typeof createdSeasonId !== "string") {
      console.error("Current leaderboard season creation failed:", seasonError);
      return errorResult("Current leaderboard season could not be prepared.");
    }

    seasonId = createdSeasonId;
  }

  const { data, error } = await supabase.rpc(
    "recalculate_leaderboard_for_season",
    {
      p_season_id: seasonId,
      p_triggered_by_clerk_user_id: admin.userId,
    }
  );

  if (error) {
    console.error("Season leaderboard recalculation RPC failed:", error);
    return errorResult("Current season leaderboard recalculation failed.");
  }

  return resolveRunResult(
    supabase,
    data,
    "Current season leaderboard recalculated.",
    "Current season leaderboard recalculation failed."
  );
}

export async function recalculateLeaderboardAllTime(): Promise<LeaderboardAdminActionResult> {
  const admin = await requireAdminUser();

  if (!admin) {
    return errorResult("Only administrators can recalculate leaderboards.");
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc(
    "recalculate_leaderboard_all_time",
    {
      p_triggered_by_clerk_user_id: admin.userId,
    }
  );

  if (error) {
    console.error("All-time leaderboard recalculation RPC failed:", error);
    return errorResult("All-time leaderboard recalculation failed.");
  }

  return resolveRunResult(
    supabase,
    data,
    "All-time leaderboard recalculated.",
    "All-time leaderboard recalculation failed."
  );
}

export async function getCompletedLeaderboardTournaments(): Promise<
  LeaderboardCompletedTournament[]
> {
  const admin = await requireAdminUser();

  if (!admin) {
    return [];
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select("id, title, grand_final_at, created_at, updated_at")
    .eq("status", "completed");

  if (error) {
    console.error("Completed tournament leaderboard load failed:", error);
    return [];
  }

  return ((data ?? []) as CompletedTournamentRow[])
    .map((tournament) => ({
      id: tournament.id,
      title: tournament.title,
      date: getStableTournamentDate(tournament),
    }))
    .sort((left, right) => getSortTime(right.date) - getSortTime(left.date));
}

export async function getRecentLeaderboardRecalculationRuns(
  limit = 8
): Promise<LeaderboardRecalculationRun[]> {
  const admin = await requireAdminUser();

  if (!admin) {
    return [];
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("leaderboard_recalculation_runs")
    .select(
      "id, scope, status, started_at, finished_at, notes, tournament_id, season_id"
    )
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Leaderboard recalculation runs load failed:", error);
    return [];
  }

  const runs = (data ?? []) as RecalculationRunRow[];
  const tournamentTitles = await loadTournamentTitles(
    supabase,
    uniquePresent(runs.map((run) => run.tournament_id))
  );
  const seasonNames = await loadSeasonNames(
    supabase,
    uniquePresent(runs.map((run) => run.season_id))
  );

  return runs.map((run) => ({
    id: run.id,
    scope: run.scope,
    status: run.status,
    startedAt: run.started_at,
    finishedAt: run.finished_at,
    notes: run.notes,
    tournamentId: run.tournament_id,
    tournamentTitle: run.tournament_id
      ? tournamentTitles.get(run.tournament_id) ?? null
      : null,
    seasonId: run.season_id,
    seasonName: run.season_id ? seasonNames.get(run.season_id) ?? null : null,
  }));
}

export async function deleteLeaderboardRecalculationRuns(
  runIds: string[]
): Promise<LeaderboardAdminActionResult> {
  const admin = await requireAdminUser();

  if (!admin) {
    return errorResult(
      "Only administrators can delete leaderboard recalculation run records."
    );
  }

  const uniqueRunIds = [
    ...new Set(runIds.map((runId) => runId.trim()).filter(Boolean)),
  ];

  console.info("Leaderboard recalculation run deletion requested:", {
    requestedCount: runIds.length,
    uniqueCount: uniqueRunIds.length,
  });

  if (uniqueRunIds.length === 0) {
    return errorResult("Select at least one recalculation run record to delete.");
  }

  if (uniqueRunIds.some((runId) => !uuidPattern.test(runId))) {
    return errorResult("One or more recalculation run IDs were invalid.");
  }

  const supabase = createSupabaseAdminClient();
  const { data: matchingRows, error: matchError } = await supabase
    .from("leaderboard_recalculation_runs")
    .select("id")
    .in("id", uniqueRunIds);

  if (matchError) {
    console.error(
      "Leaderboard recalculation run deletion lookup failed:",
      matchError
    );
    return errorResult("Unable to verify recalculation run records for deletion.");
  }

  const matchingRunIds = (matchingRows ?? []).map((run) => run.id);

  console.info("Leaderboard recalculation run deletion matched rows:", {
    requestedCount: uniqueRunIds.length,
    matchedCount: matchingRunIds.length,
    matchingRunIds,
  });

  if (matchingRunIds.length === 0) {
    return errorResult("No matching recalculation run records were found.");
  }

  const { data, error } = await supabase
    .from("leaderboard_recalculation_runs")
    .delete()
    .in("id", matchingRunIds)
    .select("id");

  if (error) {
    console.error("Leaderboard recalculation run deletion failed:", error);
    return errorResult("Recalculation run records could not be deleted.");
  }

  const deletedCount = data?.length ?? 0;

  if (deletedCount === 0) {
    console.warn("Leaderboard recalculation run deletion matched no rows:", {
      requestedIds: matchingRunIds,
    });
    return errorResult("No matching recalculation run records were found.");
  }

  const deletedRunIds = (data ?? []).map((run) => run.id);
  const { data: remainingRows, error: verifyError } = await supabase
    .from("leaderboard_recalculation_runs")
    .select("id")
    .in("id", deletedRunIds);

  if (verifyError) {
    console.error(
      "Leaderboard recalculation run deletion verification failed:",
      verifyError
    );
    return errorResult("Unable to verify recalculation run record deletion.");
  }

  if ((remainingRows ?? []).length > 0) {
    console.error("Leaderboard recalculation run records remained after delete:", {
      remainingRunIds: remainingRows.map((run) => run.id),
    });
    return errorResult("Unable to delete recalculation run records.");
  }

  console.info("Leaderboard recalculation run deletion completed:", {
    requestedCount: uniqueRunIds.length,
    deletedCount,
  });

  return {
    status: "success",
    message:
      deletedCount === 1
        ? "Deleted 1 recalculation run record."
        : `Deleted ${deletedCount} recalculation run records.`,
    deletedRunIds,
  };
}

async function requireAdminUser() {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;

  return userId && role === "admin" ? { userId } : null;
}

async function resolveRunResult(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  runId: unknown,
  successMessage: string,
  failureMessage: string
): Promise<LeaderboardAdminActionResult> {
  if (typeof runId !== "string" || !uuidPattern.test(runId)) {
    console.error("Leaderboard recalculation RPC returned invalid run id:", runId);
    return errorResult(failureMessage);
  }

  const { data, error } = await supabase
    .from("leaderboard_recalculation_runs")
    .select("id, status, notes")
    .eq("id", runId)
    .maybeSingle();

  if (error || !data) {
    console.error("Leaderboard recalculation run lookup failed:", error);
    return errorResult(failureMessage, runId);
  }

  if (data.status === "pending") {
    return {
      status: "pending",
      message: "Leaderboard recalculation is still processing.",
      runId,
    };
  }

  if (data.status !== "completed") {
    console.error("Leaderboard recalculation run did not complete:", {
      runId,
      status: data.status,
      notes: data.notes,
    });
    return errorResult(failureMessage, runId);
  }

  return {
    status: "success",
    message: successMessage,
    runId,
  };
}

async function loadTournamentTitles(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  tournamentIds: string[]
) {
  const titles = new Map<string, string>();

  if (tournamentIds.length === 0) {
    return titles;
  }

  const { data, error } = await supabase
    .from("tournaments")
    .select("id, title")
    .in("id", tournamentIds);

  if (error) {
    console.error("Leaderboard run tournament title load failed:", error);
    return titles;
  }

  for (const tournament of (data ?? []) as { id: string; title: string }[]) {
    titles.set(tournament.id, tournament.title);
  }

  return titles;
}

async function loadSeasonNames(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  seasonIds: string[]
) {
  const names = new Map<string, string>();

  if (seasonIds.length === 0) {
    return names;
  }

  const { data, error } = await supabase
    .from("leaderboard_seasons")
    .select("id, name")
    .in("id", seasonIds);

  if (error) {
    console.error("Leaderboard run season name load failed:", error);
    return names;
  }

  for (const season of (data ?? []) as LeaderboardSeasonRow[]) {
    names.set(season.id, season.name);
  }

  return names;
}

function uniquePresent(values: Array<string | null>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function getStableTournamentDate(tournament: CompletedTournamentRow) {
  return tournament.grand_final_at ?? tournament.created_at ?? tournament.updated_at;
}

function getSortTime(date: string | null) {
  if (!date) {
    return 0;
  }

  const timestamp = new Date(date).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function errorResult(
  message: string,
  runId?: string
): LeaderboardAdminActionResult {
  return {
    status: "error",
    message,
    runId,
  };
}
