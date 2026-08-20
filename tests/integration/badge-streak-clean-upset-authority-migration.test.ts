import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260820130000_badge_streak_clean_upset_authority.sql";
const previousMigrationName =
  "20260820120000_badge_progression_championship_authority.sql";
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations", migrationName),
  "utf8"
);
const compactMigration = migration.toLowerCase().replace(/\s+/g, " ").trim();

function extractFunction(functionName: string) {
  const marker = `create function public.${functionName}(`;
  const start = compactMigration.indexOf(marker);
  const end = compactMigration.indexOf("$$;", start);

  if (start < 0 || end < 0) {
    throw new Error(`${functionName} was not found.`);
  }

  return compactMigration.slice(start, end + 3);
}

function extractHelperSlice(startMarker: string, endMarker: string) {
  const helper = extractFunction("get_player_badge_match_excellence_summary");
  const start = helper.indexOf(startMarker);
  const end = helper.indexOf(endMarker, start);

  if (start < 0 || end < 0) {
    throw new Error(`${startMarker} slice was not found.`);
  }

  return helper.slice(start, end);
}

describe("badge streak, clean sweep, and upset authority migration", () => {
  it("is ordered after the progression/championship batch and remains additive", () => {
    const migrationNames = readdirSync(
      resolve(process.cwd(), "supabase/migrations")
    ).sort();

    expect(migrationNames.indexOf(previousMigrationName)).toBeGreaterThan(-1);
    expect(migrationNames.indexOf(migrationName)).toBeGreaterThan(
      migrationNames.indexOf(previousMigrationName)
    );
    expect(compactMigration.startsWith("begin;")).toBe(true);
    expect(compactMigration.endsWith("commit;")).toBe(true);
    expect(compactMigration).not.toContain("create table");
    expect(compactMigration).not.toContain("alter table");
    expect(compactMigration).not.toContain("drop table");
    expect(compactMigration).not.toContain("delete from public.");
  });

  it("keeps the helper RPC service-role-only with a safe search path", () => {
    const helper = extractFunction(
      "get_player_badge_match_excellence_summary"
    );

    expect(helper).toContain("security definer");
    expect(helper).toContain("set search_path = pg_catalog");
    expect(helper).not.toContain("execute ");
    expect(compactMigration).toContain(
      "revoke all on function public.get_player_badge_match_excellence_summary(uuid) from public, anon, authenticated, service_role"
    );
    expect(compactMigration).toContain(
      "grant execute on function public.get_player_badge_match_excellence_summary(uuid) to service_role"
    );
  });

  it("uses only authoritative played matches from non-cancelled and non-voided tournaments", () => {
    const helper = extractFunction(
      "get_player_badge_match_excellence_summary"
    );

    expect(helper).toContain("from public.tournament_matches as match");
    expect(helper).toContain("join public.generated_brackets as generated");
    expect(helper).toContain("join public.tournament_brackets as bracket");
    expect(helper).toContain("join public.tournaments as tournament");
    expect(helper).toContain(
      "public.is_tournament_match_played_for_leaderboard(match.id)"
    );
    expect(helper).toContain("tournament.status not in ('cancelled', 'voided')");
    expect(helper).toContain("match.winner_registration_id");
    expect(helper).toContain(
      "coalesce( match.official_result_decided_at, match.updated_at )"
    );
    expect(helper).toContain(
      "match.official_result_decided_at as streak_completed_at"
    );
  });

  it("reconstructs historical win streaks only from immutable result chronology", () => {
    const helper = extractFunction(
      "get_player_badge_match_excellence_summary"
    );
    const streakChronology = extractHelperSlice(
      "ordered_played_matches as",
      "streak_wins as"
    );

    expect(helper).toContain("ordered_played_matches as");
    expect(helper).toContain(
      "where played_match.streak_completed_at is not null"
    );
    expect(streakChronology).toContain(
      "played_match.streak_completed_at as completed_at"
    );
    expect(streakChronology).toContain(
      "order by played_match.streak_completed_at, played_match.id"
    );
    expect(streakChronology).not.toContain("updated_at");
    expect(streakChronology).not.toContain("coalesce(");
    expect(helper).toContain(
      "sum(case when played_match.won then 0 else 1 end) over"
    );
    expect(helper).toContain("partition by ordered_match.loss_group");
    expect(helper).toContain("where ordered_match.won");
    expect(helper).toContain("where streak.streak_length = 3");
    expect(helper).toContain("where streak.streak_length = 5");
  });

  it("uses stable match IDs only as tie-breakers for equal authoritative timestamps", () => {
    const streakChronology = extractHelperSlice(
      "ordered_played_matches as",
      "streak_wins as"
    );
    const streakWins = extractHelperSlice(
      "streak_wins as",
      "ranked_clean_sweeps as"
    );

    expect(streakChronology).toContain(
      "order by played_match.streak_completed_at, played_match.id"
    );
    expect(streakWins).toContain(
      "order by ordered_match.completed_at, ordered_match.id"
    );
    expect(streakChronology).toContain(
      "where played_match.streak_completed_at is not null"
    );
  });

  it("derives Clean Sweep only from BO3 2-0 or BO5 3-0 official wins", () => {
    const helper = extractFunction(
      "get_player_badge_match_excellence_summary"
    );

    expect(helper).toContain("ranked_clean_sweeps as");
    expect(helper).toContain("played_match.series_best_of in (3, 5)");
    expect(helper).toContain("played_match.player_two_score = 0");
    expect(helper).toContain("played_match.player_one_score = 0");
    expect(helper).toContain(
      "((played_match.series_best_of + 1) / 2)"
    );
    expect(helper).toContain("where played_match.won");
  });

  it("derives upset badges from immutable same-context verified registration ELO snapshots", () => {
    const helper = extractFunction(
      "get_player_badge_match_excellence_summary"
    );

    expect(helper).toContain("upset_wins as");
    expect(helper).toContain("winner_registration.profile_id = p_player_id");
    expect(helper).toContain("winner_registration.elo_status = 'verified'");
    expect(helper).toContain("opponent_registration.elo_status = 'verified'");
    expect(helper).toContain(
      "winner_registration.elo_verification_source = 'relic'"
    );
    expect(helper).toContain(
      "opponent_registration.elo_verification_source = 'relic'"
    );
    expect(helper).toContain("winner_registration.elo_checked_mode = '1v1'");
    expect(helper).toContain("opponent_registration.elo_checked_mode = '1v1'");
    expect(helper).toContain(
      "winner_registration.elo_calculation_version = opponent_registration.elo_calculation_version"
    );
    expect(helper).toContain(
      "opponent_registration.elo_verified_elo - winner_registration.elo_verified_elo"
    );
    expect(helper).toContain(") >= 200");
    expect(helper).toContain("where upset.upset_number = 3");
  });
});
