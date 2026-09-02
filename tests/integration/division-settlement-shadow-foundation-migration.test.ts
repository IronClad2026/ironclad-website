import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName =
  "20260903100000_division_settlement_shadow_foundation.sql";
const previousMigrationName =
  "20260902130000_event_based_tournament_scheduling.sql";

function readMigration(name: string) {
  return readFileSync(
    resolve(process.cwd(), "supabase/migrations", name),
    "utf8"
  )
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const migration = readMigration(migrationName);
const foundation = readMigration("20260624090000_leaderboard_foundation.sql");
const noShow = readMigration("20260624100000_match_no_show_reports.sql");
const academy = readMigration("20260702100000_leaderboard_academy_rewards.sql");
const outcomes = readMigration(
  "20260808100000_matchup_deadlines_double_forfeit.sql"
);
const scoring = readMigration(
  "20260812110000_leaderboard_scoring_correctness_concurrency.sql"
);
const seasons = readMigration(
  "20260813100000_tournament_terminal_recovery.sql"
);
const badges = readMigration("20260831131000_badge_reconciliation_targets.sql");

function extractFunction(source: string, qualifiedName: string) {
  const markers = [
    `create function ${qualifiedName}(`,
    `create or replace function ${qualifiedName}(`,
  ];
  const start = markers.reduce((found, marker) => {
    const index = source.indexOf(marker);
    return found < 0 || (index >= 0 && index < found) ? index : found;
  }, -1);
  const end = source.indexOf("$$;", start);

  if (start < 0 || end < 0) {
    throw new Error(`${qualifiedName} was not found.`);
  }

  return source.slice(start, end + 3);
}

const calculation = extractFunction(
  migration,
  "ironclad_private.calculate_leaderboard_division_point_events"
);
const shadow = extractFunction(
  migration,
  "public.get_leaderboard_division_shadow"
);
const receipt = migration.slice(
  migration.indexOf("create table public.leaderboard_division_settlements"),
  migration.indexOf(
    "create index leaderboard_division_settlements_season_idx"
  )
);
const lateEntryCalculation = calculation.slice(
  calculation.indexOf("lower_division_history as"),
  calculation.indexOf(") select * from participation_events")
);

describe("division settlement scoring contract", () => {
  it("locks every existing point reason and source classification", () => {
    for (const eventType of [
      "participation",
      "round_passed",
      "tournament_win",
      "missing_tournament_bonus",
      "participation_withheld",
      "no_show_penalty",
      "admin_adjustment",
    ]) {
      expect(foundation).toContain(`'${eventType}'`);
    }

    expect(foundation).toContain(
      "check (source in ('system', 'admin', 'recalculation'))"
    );
    expect(migration).not.toContain("no_show_penalty'::text");
    expect(migration).not.toContain("admin_adjustment'::text");
  });

  it("preserves Academy, Challenge, and Main formulas exactly", () => {
    expect(academy).toContain("10 as participation_points");
    expect(academy).toContain(
      "case when reward_tier = 'main' then 5 else 2 end as round_passed_points"
    );
    expect(academy).toContain(
      "case when reward_tier = 'main' then 5 else 3 end as tournament_win_points"
    );

    expect(calculation).toContain("10 as points, 'participation'::text");
    expect(calculation).toContain(
      "case when bracket.name = 'main' then 5 else 2 end as round_passed_points"
    );
    expect(calculation).toContain(
      "case when bracket.name = 'main' then 5 else 3 end as tournament_win_points"
    );
  });

  it("preserves participation, no-show, bye, walkover, and real-match semantics", () => {
    expect(noShow).toContain(
      "create trigger leaderboard_point_events_no_show_participation before insert on public.leaderboard_point_events"
    );
    expect(calculation).toContain(
      "public.is_registration_confirmed_no_show_for_leaderboard("
    );
    expect(calculation).toContain("'participation_withheld'::text");
    expect(calculation).toContain("match.outcome_type is null");
    expect(calculation).toContain("match.player_one_score is not null");
    expect(calculation).toContain("match.player_two_score is not null");
    expect(calculation).toContain(
      "round.round_number < final_round.final_round_number"
    );

    const progression = calculation.slice(
      calculation.indexOf("progression_events as"),
      calculation.indexOf("single_elimination_win_events as")
    );
    expect(progression).not.toContain("outcome_type");
    expect(outcomes).toContain("'automatic_bye'");
    expect(outcomes).toContain("'deadline_double_forfeit'");
    expect(outcomes).toContain("'empty_feeder'");
    expect(shadow).toContain(
      "public.is_tournament_match_played_for_leaderboard(match.id)"
    );
  });

  it("preserves the one-time capped Career catch-up contract", () => {
    for (const marker of [
      "bracket.name in ('academy', 'challenge')",
      "registration.registration_status = 'approved'",
      "public.is_valid_late_entry_participation(",
      "count(distinct prior.tournament_id)::integer",
      "anchored_lower_division_candidates",
      "awardable_late_entry_candidates",
      "least(candidate.missed_event_count, 5) * 5 as points",
      "'missing_tournament_bonus'::text",
      "'one-time career late-entry catch-up'::text",
    ]) {
      expect(calculation).toContain(marker);
    }

    expect(lateEntryCalculation).not.toContain("bracket.name = 'main'");
  });

  it("preserves the five authoritative tie-break keys and six-event Main model", () => {
    const rankStart = scoring.indexOf("rank() over (");
    const rankEnd = scoring.indexOf(
      ")::integer as competitive_rank",
      rankStart
    );
    const rank = scoring.slice(rankStart, rankEnd);

    for (const marker of [
      "season_stats.total_points desc",
      "season_stats.tournament_wins desc",
      "season_stats.rounds_passed desc",
      "season_stats.matches_won::numeric / season_stats.matches_played",
      "season_stats.matches_won desc",
    ]) {
      expect(rank).toContain(marker);
    }
    expect(rank).not.toMatch(/display_name|in_game_name|id::text/);
    expect(seasons).toContain("if v_event_count <> 6");
    expect(seasons).toContain("membership.scored_at is null");
    expect(seasons).toContain("finalized_at = clock_timestamp()");
  });

  it("records Badge targets only as a non-persistent evaluator scope", () => {
    expect(badges).toContain(
      "registration.registration_status = 'approved'"
    );
    expect(shadow).toContain("'badgeevaluationtargets'");
    expect(shadow).toContain("'badgeevaluationtarget'");
    expect(shadow).not.toMatch(
      /insert into public\.player_badge_awards|insert into public\.notifications|insert into ironclad_private\.badge_reconciliation_targets/
    );
  });
});

describe("division settlement shadow foundation migration", () => {
  it("is ordered, transactional, and additive", () => {
    const names = readdirSync(
      resolve(process.cwd(), "supabase/migrations")
    ).sort();

    expect(names.indexOf(previousMigrationName)).toBeGreaterThan(-1);
    expect(names.indexOf(migrationName)).toBeGreaterThan(
      names.indexOf(previousMigrationName)
    );
    expect(migration.startsWith("begin;")).toBe(true);
    expect(migration.endsWith("commit;")).toBe(true);
    expect(migration).not.toContain("create extension");
    expect(migration).not.toMatch(/create trigger|create.*queue|create.*worker/);
    expect(migration).not.toContain("alter table public.leaderboard_point_events");
    expect(migration).not.toContain(
      "create or replace function public.recalculate_leaderboard_for_tournament"
    );
  });

  it("adds one minimal Division-keyed accounting receipt", () => {
    expect(migration).toContain(
      "create table public.leaderboard_division_settlements"
    );
    expect(migration).toContain("tournament_bracket_id uuid primary key");
    expect(migration).toContain("season_id uuid not null");
    expect(migration).toContain("settlement_version integer not null");
    expect(migration).toContain("calculation_checksum text not null");
    expect(migration).toContain("settled_at timestamptz not null");
    expect(migration).toContain("last_reconciled_at timestamptz not null");
    expect(receipt).not.toMatch(
      /winner_registration_id|player_one_score|player_two_score|match_winner/
    );
    expect(receipt).not.toContain("settlement_status");
  });

  it("proves historical Division identity without rewriting history", () => {
    expect(migration).toContain(
      "historical leaderboard point history has ambiguous division identity"
    );
    expect(migration).toContain(
      "coalesce(explicit_bracket.id, registration_bracket.id)"
    );
    expect(migration).toContain(
      "event.tournament_bracket_id is null and event.event_type <> 'participation_withheld'"
    );
    expect(migration).toContain(
      "explicit_bracket.id is distinct from registration_bracket.id"
    );
    expect(migration).not.toMatch(
      /update public\.leaderboard_point_events|delete from public\.leaderboard_point_events/
    );
    expect(migration).not.toMatch(
      /insert into public\.leaderboard_division_settlements/
    );
  });

  it("uses the current lifecycle and match authorities", () => {
    expect(shadow).toContain(
      "public.is_generated_bracket_complete(v_generated_bracket_id)"
    );
    expect(shadow).toContain(
      "public.is_tournament_match_played_for_leaderboard(match.id)"
    );
    expect(shadow).toContain(
      "tournament division has unresolved result authority"
    );
    expect(shadow).toContain("submission.status = 'pending'");
    expect(shadow).toContain("report_group.finalized_at is null");
  });

  it("calculates every required effect and a deterministic checksum", () => {
    for (const key of [
      "'pointevents'",
      "'points'",
      "'competitionsplayed'",
      "'roundspassed'",
      "'divisionwins'",
      "'realmatches'",
      "'realmatchwins'",
      "'alltimeeffect'",
      "'mainseasoneffect'",
      "'badgeevaluationtargets'",
      "'calculationchecksum'",
    ]) {
      expect(shadow).toContain(key);
    }
    expect(shadow).toContain("md5(");
    expect(shadow).toContain("shadow_event_counts as");
    expect(shadow).toContain("authoritative_event_counts as");
    expect(shadow).toContain("'pointeventsmatch'");
  });

  it("keeps the calculator read-only and the receipt private", () => {
    expect(calculation).not.toMatch(/insert into|update |delete from/);
    expect(shadow).not.toMatch(/insert into|update |delete from/);
    expect(migration).toContain(
      "alter table public.leaderboard_division_settlements enable row level security"
    );
    expect(migration).toContain(
      "revoke all on table public.leaderboard_division_settlements from public, anon, authenticated, service_role"
    );
    expect(migration).toContain(
      "revoke all on function ironclad_private.calculate_leaderboard_division_point_events(uuid) from public, anon, authenticated, service_role"
    );
    expect(migration).toContain(
      "revoke all on function public.get_leaderboard_division_shadow(uuid) from public, anon, authenticated"
    );
    expect(migration).toContain(
      "grant execute on function public.get_leaderboard_division_shadow(uuid) to service_role"
    );
  });

  it("does not alter Badge, Reveal, notification, or public UI systems", () => {
    expect(migration).not.toMatch(
      /player_badge_awards|player_badge_reveals|badge_reconciliation_targets|badge\.unlocked|create_in_app_notification/
    );
    expect(migration).not.toMatch(/create view|grant select to anon|grant select to authenticated/);
  });
});
