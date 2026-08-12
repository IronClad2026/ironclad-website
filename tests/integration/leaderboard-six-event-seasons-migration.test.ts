import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName =
  "20260812120000_six_event_main_seasons_late_entry_bonus.sql";
const correctionMigrationName =
  "20260812121000_late_entry_bonus_non_played_progression.sql";
const previousMigrationName =
  "20260812110000_leaderboard_scoring_correctness_concurrency.sql";
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations", migrationName),
  "utf8"
);
const compactMigration = migration.toLowerCase().replace(/\s+/g, " ").trim();
const correctionMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations", correctionMigrationName),
  "utf8"
);
const compactCorrectionMigration = correctionMigration
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

function extractFunction(
  functionName: string,
  source = compactMigration
) {
  const createMarkers = [
    `create or replace function public.${functionName}(`,
    `create function public.${functionName}(`,
  ];
  const start = createMarkers.reduce((found, marker) => {
    const index = source.indexOf(marker);
    return found < 0 || (index >= 0 && index < found) ? index : found;
  }, -1);
  const end = source.indexOf("$$;", start);

  if (start < 0 || end < 0) {
    throw new Error(`${functionName} was not found in the PR 3 migration.`);
  }

  return source.slice(start, end + 3);
}

const getOrCreateSeason = extractFunction("get_or_create_leaderboard_season");
const assignTournamentSeason = extractFunction(
  "assign_leaderboard_tournament_season"
);
const preserveFirstCompletion = extractFunction(
  "preserve_tournament_first_completed_at"
);
const finalizedAdjustmentGuard = extractFunction(
  "guard_finalized_main_admin_adjustment"
);
const adminAdjustment = extractFunction("add_leaderboard_admin_adjustment");
const validLateEntry = extractFunction(
  "is_valid_late_entry_participation",
  compactCorrectionMigration
);
const awardLateEntry = extractFunction(
  "award_leaderboard_late_entry_bonuses"
);
const seasonRecalculation = extractFunction(
  "recalculate_leaderboard_for_season"
);
const finalizeSeason = extractFunction(
  "finalize_leaderboard_main_season_if_ready"
);
const tournamentRecalculation = extractFunction(
  "recalculate_leaderboard_for_tournament"
);

describe("six-event Main seasons and Career late-entry migration", () => {
  it("keeps both PR 3 migrations ordered and transactional", () => {
    const migrationNames = readdirSync(
      resolve(process.cwd(), "supabase/migrations")
    ).sort();

    expect(migrationNames.indexOf(previousMigrationName)).toBeGreaterThan(-1);
    expect(migrationNames.indexOf(migrationName)).toBeGreaterThan(
      migrationNames.indexOf(previousMigrationName)
    );
    expect(migrationNames.indexOf(correctionMigrationName)).toBeGreaterThan(
      migrationNames.indexOf(migrationName)
    );
    expect(compactMigration.startsWith("begin;")).toBe(true);
    expect(compactMigration.endsWith("commit;")).toBe(true);
    expect(compactCorrectionMigration.startsWith("begin;")).toBe(true);
    expect(compactCorrectionMigration.endsWith("commit;")).toBe(true);
    expect(compactMigration).not.toContain("create extension");
    expect(compactMigration).not.toMatch(/cron\.|create.*job|schedule\(/);
    expect(compactCorrectionMigration).not.toMatch(
      /create table|alter table|create index|cron\.|create.*job|schedule\(/
    );
    expect(compactCorrectionMigration).not.toMatch(
      /create trigger|drop trigger|insert into|update public\.|delete from/
    );
  });

  it("stores one immutable factual membership with at most six Main slots", () => {
    expect(compactMigration).toContain(
      "create table public.leaderboard_tournament_season_memberships"
    );
    expect(compactMigration).toContain("tournament_id uuid primary key");
    expect(compactMigration).toContain("scored_at timestamptz");
    expect(compactMigration).toContain(
      "qualifying_event_number is null or qualifying_event_number between 1 and 6"
    );
    expect(compactMigration).toContain(
      "unique (season_id, qualifying_event_number)"
    );
    expect(compactMigration).toContain(
      "revoke all on public.leaderboard_tournament_season_memberships from public, anon, authenticated, service_role"
    );

    expect(assignTournamentSeason).toContain("if v_status <> 'completed'");
    expect(assignTournamentSeason).toContain("bracket.name = 'main'");
    expect(assignTournamentSeason).toContain(
      "bracket.launched_at is not null"
    );
    expect(assignTournamentSeason).toContain(
      "select (count(*) + 1)::smallint"
    );
    expect(assignTournamentSeason).toContain("if v_event_number > 6");
    expect(assignTournamentSeason).toContain(
      "when v_event_number = 6 then false"
    );
  });

  it("uses event count rather than a calendar window", () => {
    expect(compactMigration).toContain(
      "drop constraint if exists leaderboard_seasons_calendar_window_check"
    );
    expect(compactMigration).toContain(
      "check (season_number > 0)"
    );
    expect(getOrCreateSeason).toContain(
      "membership.qualifying_event_number is not null"
    );
    expect(getOrCreateSeason).toContain(") < 6");
    expect(getOrCreateSeason).not.toMatch(/june|july|6, 30|12, 31/);
    expect(assignTournamentSeason).toContain(
      "v_season_id := public.get_or_create_leaderboard_season(v_effective_date)"
    );
    expect(assignTournamentSeason).toContain(
      "career-only scoring stays attached to the latest factual season"
    );
  });

  it("records one immutable completion chronology for membership and anchors", () => {
    expect(compactMigration).toContain(
      "add column if not exists first_completed_at timestamptz"
    );
    expect(compactMigration).toContain(
      "existing completed tournaments require an approved first-completion inventory before pr 3"
    );
    expect(compactMigration).not.toContain(
      "set first_completed_at = coalesce("
    );
    expect(preserveFirstCompletion).toContain(
      "new.first_completed_at := clock_timestamp()"
    );
    expect(preserveFirstCompletion).toContain("new.first_completed_at := null");
    expect(preserveFirstCompletion).toContain(
      "tournament first completion can only be set by completion"
    );
    expect(preserveFirstCompletion).toContain(
      "tournament first completion is immutable"
    );
    expect(compactMigration).toContain(
      "create trigger tournaments_preserve_first_completed_at before insert or update of status, first_completed_at"
    );
    expect(assignTournamentSeason).toContain(
      "tournament.first_completed_at::date"
    );
    expect(compactMigration).toContain(
      "comment on column public.tournaments.first_completed_at"
    );
    expect(compactMigration).toContain(
      "date and year fields are display metadata only"
    );
  });

  it("reuses the PR 2 root lock and assigns before the scoring core", () => {
    const rootLock = tournamentRecalculation.indexOf(
      "hashtextextended('ironclad:leaderboard:all-time', 0)"
    );
    const tournamentLock = tournamentRecalculation.indexOf(
      "'ironclad:leaderboard:tournament:'"
    );
    const assignment = tournamentRecalculation.indexOf(
      "assign_leaderboard_tournament_season"
    );
    const scoringCore = tournamentRecalculation.indexOf(
      "recalculate_leaderboard_for_tournament_without_matchup_outcomes"
    );
    const clearScored = tournamentRecalculation.indexOf(
      "set scored_at = null"
    );
    const markScored = tournamentRecalculation.indexOf(
      "set scored_at = clock_timestamp()"
    );
    const finalizer = tournamentRecalculation.indexOf(
      "finalize_leaderboard_main_season_if_ready"
    );

    expect(rootLock).toBeGreaterThan(-1);
    expect(tournamentLock).toBeGreaterThan(rootLock);
    expect(assignment).toBeGreaterThan(tournamentLock);
    expect(clearScored).toBeGreaterThan(assignment);
    expect(scoringCore).toBeGreaterThan(clearScored);
    expect(markScored).toBeGreaterThan(scoringCore);
    expect(finalizer).toBeGreaterThan(markScored);
    expect(tournamentRecalculation).toContain(
      "'ironclad.leaderboard_tournament_id'"
    );
    expect(tournamentRecalculation.indexOf("begin", assignment)).toBeLessThan(
      scoringCore
    );
  });

  it("closes membership at six and finalizes only after every scoring run succeeds", () => {
    expect(compactMigration).toContain(
      "add column if not exists finalized_at timestamptz"
    );
    expect(compactMigration).toContain(
      "check (finalized_at is null or not is_active)"
    );
    expect(finalizeSeason).toContain("if v_event_count <> 6");
    expect(finalizeSeason).toContain("membership.scored_at is null");
    expect(finalizeSeason).toContain("season_stats.current_rank = 1");
    expect(finalizeSeason).not.toContain("between 1 and 3");
    expect(finalizeSeason).toContain("finalized_at = clock_timestamp()");
    expect(finalizeSeason).not.toContain("winner_registration_id");
    expect(tournamentRecalculation).toContain(
      "finalize_leaderboard_main_season_if_ready(v_season_id)"
    );
    expect(tournamentRecalculation).toContain("set scored_at = null");
    expect(tournamentRecalculation).toContain(
      "set scored_at = clock_timestamp()"
    );
  });

  it("freezes finalized Main rows while Career rows keep using the PR 2 core", () => {
    expect(compactMigration).toContain(
      "rename to recalculate_leaderboard_for_season_pr2_core"
    );
    expect(seasonRecalculation).toContain(
      "create temporary table leaderboard_finalized_main_stats"
    );
    expect(seasonRecalculation).toContain(
      "season_stats.bracket_type = 'main'"
    );
    expect(seasonRecalculation).toContain(
      "public.recalculate_leaderboard_for_season_pr2_core("
    );
    expect(seasonRecalculation).toContain(
      "delete from public.leaderboard_player_season_stats where season_id = p_season_id and bracket_type = 'main'"
    );
    expect(seasonRecalculation).toContain(
      "from pg_temp.leaderboard_finalized_main_stats"
    );
    const coreRun = seasonRecalculation.indexOf(
      "public.recalculate_leaderboard_for_season_pr2_core("
    );
    const restore = seasonRecalculation.indexOf(
      "from pg_temp.leaderboard_finalized_main_stats"
    );
    const failedReturn = seasonRecalculation.indexOf(
      "if v_run_status is distinct from 'completed'"
    );
    expect(restore).toBeGreaterThan(coreRun);
    expect(failedReturn).toBeGreaterThan(restore);
    expect(compactMigration).toContain(
      "revoke all on function public.recalculate_leaderboard_for_season_pr2_core(uuid, text) from public, anon, authenticated, service_role"
    );
    expect(finalizedAdjustmentGuard).toContain("old.source = 'admin'");
    expect(finalizedAdjustmentGuard).toContain("new.source = 'admin'");
    expect(compactMigration).toContain(
      "before insert or update or delete on public.leaderboard_point_events"
    );
    expect(compactMigration).toContain(
      "revoke insert, update, delete on public.leaderboard_seasons, public.leaderboard_point_events, public.leaderboard_player_season_stats, public.leaderboard_season_champions from authenticated"
    );
    const adjustmentLock = adminAdjustment.indexOf(
      "hashtextextended('ironclad:leaderboard:all-time', 0)"
    );
    const adjustmentInsert = adminAdjustment.indexOf(
      "insert into public.leaderboard_point_events"
    );
    expect(adjustmentLock).toBeGreaterThan(-1);
    expect(adjustmentInsert).toBeGreaterThan(adjustmentLock);
    expect(compactMigration).toContain(
      "revoke all on function public.add_leaderboard_admin_adjustment( uuid, uuid, text, integer, text, uuid, uuid, uuid, text ) from public, anon, authenticated"
    );
    expect(compactMigration).toContain(
      "grant execute on function public.add_leaderboard_admin_adjustment( uuid, uuid, text, integer, text, uuid, uuid, uuid, text ) to service_role"
    );
    expect(finalizedAdjustmentGuard).toContain(
      "new.bracket_type = 'main'"
    );
    expect(finalizedAdjustmentGuard).toContain(
      "season.finalized_at is not null"
    );
    expect(finalizedAdjustmentGuard).not.toContain("academy");
  });

  it("awards one capped aggregate bonus only to Academy and Challenge", () => {
    expect(compactMigration).toContain(
      "bracket_type in ('academy', 'challenge') and points between 5 and 25 and mod(points, 5) = 0"
    );
    expect(compactMigration).toContain(
      "create unique index leaderboard_point_events_one_late_entry_bonus_idx on public.leaderboard_point_events(player_id, bracket_type)"
    );
    expect(awardLateEntry).toContain(
      "bracket.name in ('academy', 'challenge')"
    );
    expect(awardLateEntry).toContain(
      "least(candidate.missed_event_count, 5) * 5"
    );
    expect(awardLateEntry).toContain("'missing_tournament_bonus'");
    expect(awardLateEntry).not.toMatch(/bracket\.name = 'main'|\+ 5/);
    expect(awardLateEntry).toContain(
      "on conflict (player_id, bracket_type)"
    );
    expect(awardLateEntry).toContain(
      "delete from public.leaderboard_point_events as bonus"
    );
  });

  it("anchors on the first launched approved roster and accepts non-played progression", () => {
    expect(awardLateEntry).toContain(
      "anchor_registration.registration_status = 'approved'"
    );
    expect(awardLateEntry).toContain(
      "anchor_registration.profile_id = candidate.player_id"
    );
    expect(awardLateEntry).toContain(
      "order by anchor_tournament.first_completed_at, anchor_membership.tournament_id"
    );
    expect(awardLateEntry).toContain(
      ") < (anchor.first_completed_at, anchor.tournament_id)"
    );
    expect(validLateEntry).toContain("tournament.id = p_tournament_id");
    expect(validLateEntry).toContain("tournament.status = 'completed'");
    expect(validLateEntry).toContain("bracket.id = p_tournament_bracket_id");
    expect(validLateEntry).toContain(
      "bracket.tournament_id = tournament.id"
    );
    expect(validLateEntry).toContain(
      "bracket.name in ('academy', 'challenge')"
    );
    expect(validLateEntry).toContain("bracket.launched_at is not null");
    expect(validLateEntry).toContain("registration.id = p_registration_id");
    expect(validLateEntry).toContain(
      "registration.tournament_id = tournament.id"
    );
    expect(validLateEntry).toContain(
      "registration.tournament_bracket_id = bracket.id"
    );
    expect(validLateEntry).toContain(
      "registration.registration_status = 'approved'"
    );
    expect(validLateEntry).toContain("player.id = registration.profile_id");
    expect(validLateEntry).toContain(
      "not public.is_registration_confirmed_no_show_for_leaderboard("
    );
    expect(validLateEntry).not.toMatch(
      /is_tournament_match_played_for_leaderboard|tournament_matches|generated_brackets|player_one_score|player_two_score|winner_registration_id/
    );
    expect(compactCorrectionMigration).toContain(
      "revoke all on function public.is_valid_late_entry_participation(uuid, uuid, uuid) from public, anon, authenticated, service_role"
    );
    expect(validLateEntry).toContain("language sql stable security definer");
    expect(validLateEntry).toContain("set search_path = pg_catalog");
    expect(compactCorrectionMigration).toContain(
      "alter function public.is_valid_late_entry_participation(uuid, uuid, uuid) owner to postgres"
    );
    expect(
      compactCorrectionMigration.match(
        /create or replace function public\.is_valid_late_entry_participation\(/g
      )
    ).toHaveLength(1);
    expect(compactCorrectionMigration).not.toContain("grant execute");
    expect(awardLateEntry).toContain(
      "public.is_valid_late_entry_participation( earlier_membership.tournament_id"
    );
  });

  it("preserves the public signatures and keeps all new helpers private", () => {
    for (const signature of [
      "public.get_or_create_leaderboard_season(date)",
      "public.recalculate_leaderboard_for_tournament(uuid, text)",
      "public.recalculate_leaderboard_for_season(uuid, text)",
    ]) {
      expect(compactMigration).toContain(
        `revoke all on function ${signature} from public, anon, authenticated`
      );
      expect(compactMigration).toContain(
        `grant execute on function ${signature} to service_role`
      );
    }

    for (const signature of [
      "public.assign_leaderboard_tournament_season(uuid)",
      "public.is_valid_late_entry_participation(uuid, uuid, uuid)",
      "public.award_leaderboard_late_entry_bonuses(uuid, text)",
      "public.finalize_leaderboard_main_season_if_ready(uuid)",
    ]) {
      expect(compactMigration).toContain(
        `revoke all on function ${signature} from public, anon, authenticated, service_role`
      );
    }
  });

  it("does not add historical backfill, new scoring values, or another system", () => {
    expect(compactMigration).not.toContain("underdog");
    expect(compactMigration).not.toContain(
      "for v_tournament in select"
    );
    expect(compactMigration).not.toContain(
      "completed tournament leaderboard backfill"
    );
    expect(compactMigration).not.toContain(
      "create table public.leaderboard_late_entry_bonuses"
    );
    expect(compactMigration).not.toContain(
      "create table public.leaderboard_career"
    );
    expect(compactMigration).not.toMatch(/queue|worker|scheduler|event sourcing/);
    expect(compactMigration).toContain(
      "recalculate_leaderboard_for_tournament_without_matchup_outcomes"
    );
    expect(compactMigration).not.toContain(
      "create or replace function public.recalculate_leaderboard_for_tournament_without_matchup_outcomes"
    );
    expect(compactMigration).not.toContain(
      "grant all on public.leaderboard_tournament_season_memberships"
    );
  });
});

describe("PR 3 application boundaries", () => {
  it("does not pre-create a future season from the manual current-season action", () => {
    expect(adminLeaderboardSource).toContain(
      "There is no active leaderboard season to recalculate."
    );
    expect(adminLeaderboardSource).not.toContain(
      '"get_or_create_leaderboard_season"'
    );
  });

  it("keeps sanitized public reads and supports season numbers beyond two", () => {
    expect(publicLeaderboardSource).toContain("seasonNumber: number;");
    expect(publicLeaderboardSource).toContain(
      "seasonNumber: row.season_number"
    );
    expect(publicLeaderboardSource).toContain(
      '.from("leaderboard_public_season_standings")'
    );
    expect(publicLeaderboardSource).toContain(
      '.from("leaderboard_public_all_time_standings")'
    );
    expect(publicLeaderboardSource).not.toContain(
      '.from("leaderboard_point_events")'
    );
    expect(publicLeaderboardSource).not.toContain(
      '.from("leaderboard_tournament_season_memberships")'
    );
  });
});
