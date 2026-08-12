import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName =
  "20260812110000_leaderboard_scoring_correctness_concurrency.sql";
const previousMigrationName =
  "20260812100000_tournament_hard_delete_guard.sql";
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations", migrationName),
  "utf8"
);
const compactMigration = migration.toLowerCase().replace(/\s+/g, " ").trim();

const noShowMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260624100000_match_no_show_reports.sql"
  ),
  "utf8"
)
  .toLowerCase()
  .replace(/\s+/g, " ")
  .trim();
const academyRewardsMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260702100000_leaderboard_academy_rewards.sql"
  ),
  "utf8"
)
  .toLowerCase()
  .replace(/\s+/g, " ")
  .trim();
const adminLeaderboardSource = readFileSync(
  resolve(process.cwd(), "lib/leaderboard/admin.ts"),
  "utf8"
);
const publicLeaderboardSource = readFileSync(
  resolve(process.cwd(), "lib/leaderboard/public.ts"),
  "utf8"
);

function extractFunction(functionName: string) {
  const marker = `create or replace function public.${functionName}(`;
  const start = compactMigration.indexOf(marker);
  const end = compactMigration.indexOf("$$;", start);

  if (start < 0 || end < 0) {
    throw new Error(`${functionName} was not found in the PR 2 migration.`);
  }

  return compactMigration.slice(start, end + 3);
}

const writeAccess = extractFunction("leaderboard_require_write_access");
const playedMatch = extractFunction(
  "is_tournament_match_played_for_leaderboard"
);
const allTime = extractFunction("recalculate_leaderboard_all_time");
const season = extractFunction("recalculate_leaderboard_for_season");
const tournament = extractFunction("recalculate_leaderboard_for_tournament");
const completionTriggerFunction = extractFunction(
  "recalculate_leaderboard_on_tournament_completion"
);

describe("leaderboard scoring correctness and concurrency migration", () => {
  it("is ordered after PR 1 and changes no tables or point formulas", () => {
    const migrationNames = readdirSync(
      resolve(process.cwd(), "supabase/migrations")
    ).sort();

    expect(migrationNames.indexOf(previousMigrationName)).toBeGreaterThan(-1);
    expect(migrationNames.indexOf(migrationName)).toBeGreaterThan(
      migrationNames.indexOf(previousMigrationName)
    );
    expect(compactMigration.startsWith("begin;")).toBe(true);
    expect(compactMigration.endsWith("commit;")).toBe(true);
    expect(compactMigration).not.toMatch(/create table|alter table/);
    expect(compactMigration).not.toMatch(/late.entry|underdog|missing.event/);
    expect(compactMigration).toContain(
      "to_regprocedure( 'public.recalculate_leaderboard_all_time_without_concurrency_lock(text)' ) is null"
    );
  });

  it("defines one factual real-played predicate and excludes accepted no-shows", () => {
    for (const marker of [
      "match.status = 'completed'",
      "match.outcome_type is null",
      "match.player_one_registration_id is not null",
      "match.player_two_registration_id is not null",
      "match.player_one_score is not null",
      "match.player_two_score is not null",
      "match.winner_registration_id is not null",
      "report_group.result_type = 'no_show'",
      "report_group.finalized_at is not null",
      "'confirmed', 'auto_approved', 'approved'",
      "'confirmed', 'auto_confirmed', 'approved'",
    ]) {
      expect(playedMatch).toContain(marker);
    }

    expect(season).toContain(
      "public.is_tournament_match_played_for_leaderboard(match.id)"
    );
    expect(season).not.toContain("match.status = 'completed'");
    expect(compactMigration).toContain(
      "revoke all on function public.is_tournament_match_played_for_leaderboard(uuid) from public, anon, authenticated, service_role"
    );
  });

  it("preserves no-show participation withholding while excluding pure progression", () => {
    expect(noShowMigration).toContain(
      "create trigger leaderboard_point_events_no_show_participation before insert on public.leaderboard_point_events"
    );
    expect(noShowMigration).toContain(
      "public.is_registration_confirmed_no_show_for_leaderboard( new.tournament_id, new.tournament_bracket_id, new.registration_id )"
    );

    const resultCounts = tournament.slice(
      tournament.indexOf("with result_match_counts as"),
      tournament.indexOf("ranked_participation as")
    );

    expect(resultCounts).not.toContain(
      "is_tournament_match_played_for_leaderboard"
    );
    expect(resultCounts).toContain("match.outcome_type is null");
    expect(resultCounts).toContain(
      "match.player_one_registration_id is not null"
    );
    expect(resultCounts).toContain(
      "match.player_two_registration_id is not null"
    );
    expect(resultCounts).toContain("match.player_one_score is not null");
    expect(resultCounts).toContain("match.player_two_score is not null");
    expect(resultCounts).toContain("match.winner_registration_id is not null");

    expect(season).toContain(
      "coalesce( event.tournament_bracket_id, registration.tournament_bracket_id ) as tournament_bracket_id"
    );
    expect(season).toContain(
      "from pg_temp.leaderboard_outcome_aware_match_stats as match_stats on conflict (season_id, player_id, bracket_type) do nothing"
    );
  });

  it("uses true competition rank over exactly the five approved keys", () => {
    const rankStart = season.indexOf("rank() over (");
    const rankEnd = season.indexOf(
      ")::integer as competitive_rank",
      rankStart
    );
    const rankWindow = season.slice(rankStart, rankEnd);
    const orderedKeys = [
      "season_stats.total_points desc",
      "season_stats.tournament_wins desc",
      "season_stats.rounds_passed desc",
      "season_stats.matches_won::numeric / season_stats.matches_played",
      "season_stats.matches_won desc",
    ];

    expect(rankStart).toBeGreaterThan(-1);
    expect(rankEnd).toBeGreaterThan(rankStart);
    expect(rankWindow).toContain("rank() over (");
    expect(rankWindow).not.toContain("row_number() over");

    let previousIndex = -1;
    for (const key of orderedKeys) {
      const keyIndex = rankWindow.indexOf(key);
      expect(keyIndex).toBeGreaterThan(previousIndex);
      previousIndex = keyIndex;
    }

    expect(rankWindow).not.toMatch(/in_game_name|display_name|id::text|uuid/);
    expect(season).toContain(
      "existing.current_rank is not distinct from ranked.competitive_rank"
    );
    expect(season).toContain(
      "when rank_update.unchanged then rank_update.prior_rank_movement"
    );
  });

  it("takes the shared all-time scope before narrower tournament and season scopes", () => {
    const allTimeLock = allTime.indexOf(
      "hashtextextended('ironclad:leaderboard:all-time', 0)"
    );
    const allTimeCore = allTime.indexOf(
      "recalculate_leaderboard_all_time_without_concurrency_lock"
    );
    const seasonLock = season.indexOf(
      "'ironclad:leaderboard:season:' || coalesce(p_season_id::text, 'null')"
    );
    const seasonRootLock = season.indexOf(
      "hashtextextended('ironclad:leaderboard:all-time', 0)"
    );
    const seasonCore = season.indexOf(
      "recalculate_leaderboard_for_season_without_outcome_filtering"
    );
    const seasonAllTime = season.lastIndexOf(
      "recalculate_leaderboard_all_time("
    );
    const tournamentLock = tournament.indexOf(
      "'ironclad:leaderboard:tournament:' || coalesce(p_tournament_id::text, 'null')"
    );
    const tournamentRootLock = tournament.indexOf(
      "hashtextextended('ironclad:leaderboard:all-time', 0)"
    );
    const tournamentCore = tournament.indexOf(
      "recalculate_leaderboard_for_tournament_without_matchup_outcomes"
    );
    const tournamentSeason = tournament.lastIndexOf(
      "recalculate_leaderboard_for_season("
    );

    expect(allTimeLock).toBeGreaterThan(-1);
    expect(allTimeCore).toBeGreaterThan(allTimeLock);
    expect(seasonRootLock).toBeGreaterThan(-1);
    expect(seasonLock).toBeGreaterThan(-1);
    expect(seasonLock).toBeGreaterThan(seasonRootLock);
    expect(seasonCore).toBeGreaterThan(seasonLock);
    expect(seasonAllTime).toBeGreaterThan(seasonCore);
    expect(tournamentRootLock).toBeGreaterThan(-1);
    expect(tournamentLock).toBeGreaterThan(-1);
    expect(tournamentLock).toBeGreaterThan(tournamentRootLock);
    expect(tournamentCore).toBeGreaterThan(tournamentLock);
    expect(tournamentSeason).toBeGreaterThan(tournamentCore);
    expect(compactMigration).toContain(
      "revoke all on function public.recalculate_leaderboard_all_time_without_concurrency_lock(text) from public, anon, authenticated, service_role"
    );
  });

  it("runs automatic recalculation once the completion transaction is settled", () => {
    const triggerStart = compactMigration.indexOf(
      "create constraint trigger tournaments_recalculate_leaderboard_on_completion"
    );
    const triggerEnd = compactMigration.indexOf(";", triggerStart);
    const trigger = compactMigration.slice(triggerStart, triggerEnd);

    expect(trigger).toContain("after update of status on public.tournaments");
    expect(trigger).toContain("deferrable initially deferred");
    expect(trigger).toContain("for each row");
    expect(trigger).toContain(
      "old.status is distinct from 'completed' and new.status = 'completed'"
    );
    expect(completionTriggerFunction).toContain(
      "from public.tournaments as tournament where tournament.id = new.id"
    );
    expect(completionTriggerFunction).toContain(
      "v_run_id := public.recalculate_leaderboard_for_tournament(new.id, null)"
    );
    expect(completionTriggerFunction).toContain(
      "if v_run_status is distinct from 'completed' then return null"
    );
    expect(completionTriggerFunction).toContain(
      "automatic tournament leaderboard recalculation failed: sqlstate %s"
    );
    expect(completionTriggerFunction).toContain(
      "when query_canceled or assert_failure or others then"
    );
    expect(completionTriggerFunction).toContain(
      "automatic leaderboard failure audit could not be persisted: sqlstate %s"
    );
    expect(compactMigration).toContain(
      "revoke all on function public.recalculate_leaderboard_on_tournament_completion() from public, anon, authenticated, service_role"
    );
  });

  it("keeps request authorization and narrowly permits database-owned lifecycle work", () => {
    expect(writeAccess).toContain("if session_user = 'postgres' then return");
    expect(writeAccess).not.toContain("current_user");
    expect(writeAccess).toContain(
      "if coalesce(auth.role(), '') = 'service_role' then return"
    );
    expect(writeAccess).toContain(
      "if coalesce(auth.role(), '') = 'authenticated' and public.is_admin_jwt() then return"
    );
    expect(writeAccess).toContain("using errcode = '42501'");

    for (const signature of [
      "public.recalculate_leaderboard_for_tournament(uuid, text)",
      "public.recalculate_leaderboard_for_season(uuid, text)",
      "public.recalculate_leaderboard_all_time(text)",
    ]) {
      expect(compactMigration).toContain(
        `revoke all on function ${signature} from public, anon, authenticated`
      );
      expect(compactMigration).toContain(
        `grant execute on function ${signature} to service_role`
      );
    }
  });

  it("does not infer eligibility by rewriting every historical completed tournament", () => {
    expect(compactMigration).not.toContain(
      "where tournament.status = 'completed' order by"
    );
    expect(compactMigration).not.toContain("completed tournament leaderboard backfill");
  });

  it("preserves the existing point values without adding a bonus formula", () => {
    expect(academyRewardsMigration).toContain(
      "10 as participation_points"
    );
    expect(academyRewardsMigration).toContain(
      "case when reward_tier = 'main' then 5 else 2 end as round_passed_points"
    );
    expect(academyRewardsMigration).toContain(
      "case when reward_tier = 'main' then 5 else 3 end as tournament_win_points"
    );
    expect(compactMigration).not.toMatch(/admin_adjustment.*delete|delete.*admin_adjustment/);
  });
});

describe("leaderboard recalculation application boundaries", () => {
  it("keeps the existing authenticated manual administrator recovery actions", () => {
    const adminCheck = adminLeaderboardSource.indexOf(
      "const admin = await requireAdminUser();"
    );
    const adminClient = adminLeaderboardSource.indexOf(
      "const supabase = createSupabaseAdminClient();"
    );

    expect(adminCheck).toBeGreaterThan(-1);
    expect(adminClient).toBeGreaterThan(adminCheck);
    for (const rpc of [
      "recalculate_leaderboard_for_tournament",
      "recalculate_leaderboard_for_season",
      "recalculate_leaderboard_all_time",
    ]) {
      expect(adminLeaderboardSource).toContain(`"${rpc}"`);
    }
    expect(adminLeaderboardSource).toContain(
      'role === "admin" ? { userId } : null'
    );
  });

  it("keeps public ranking reads on the sanitized public views", () => {
    expect(publicLeaderboardSource).toContain(
      '.from("leaderboard_public_season_standings")'
    );
    expect(publicLeaderboardSource).toContain(
      '.from("leaderboard_public_all_time_standings")'
    );
    expect(publicLeaderboardSource).not.toContain(
      '.from("leaderboard_player_season_stats")'
    );
    expect(publicLeaderboardSource).not.toContain(
      '.from("leaderboard_player_all_time_stats")'
    );
  });
});
