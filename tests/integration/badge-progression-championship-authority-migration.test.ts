import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260821002000_badge_progression_championship_authority.sql";
const previousMigrationName = "20260821001000_badge_batch_2_authority.sql";
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

describe("badge progression and championship authority migration", () => {
  it("is ordered after Batch 2 and remains additive", () => {
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

  it("keeps new helper RPCs service-role-only with safe search paths", () => {
    for (const functionName of [
      "get_player_badge_tournament_authority_participants",
      "get_player_badge_tournament_prestige_summary",
    ]) {
      const helper = extractFunction(functionName);

      expect(helper).toContain("security definer");
      expect(helper).toContain("set search_path = pg_catalog");
      expect(helper).not.toContain("execute ");
      expect(compactMigration).toContain(
        `revoke all on function public.${functionName}(uuid) from public, anon, authenticated, service_role`
      );
      expect(compactMigration).toContain(
        `grant execute on function public.${functionName}(uuid) to service_role`
      );
    }
  });

  it("loads only completed tournament authority participants from official leaderboard facts", () => {
    const participants = extractFunction(
      "get_player_badge_tournament_authority_participants"
    );

    expect(participants).toContain("from public.leaderboard_point_events as event");
    expect(participants).toContain(
      "join public.tournaments as tournament on tournament.id = event.tournament_id"
    );
    expect(participants).toContain("tournament.status = 'completed'");
    expect(participants).toContain("tournament.first_completed_at is not null");
    expect(participants).toContain(
      "event.event_type in ('participation', 'tournament_win')"
    );
    expect(participants).toContain(
      "event.source in ('system', 'recalculation')"
    );
    expect(participants).toContain(
      "event.bracket_type in ('academy', 'challenge', 'main')"
    );
    expect(participants).toContain(
      "public.is_registration_confirmed_no_show_for_leaderboard("
    );
    expect(participants).toContain("withheld.event_type = 'participation_withheld'");
    expect(participants).toContain("select distinct event.player_id");
  });

  it("derives First Advance from a played official win that advances into the next round", () => {
    const summary = extractFunction(
      "get_player_badge_tournament_prestige_summary"
    );

    expect(summary).toContain("played_advancement_matches as");
    expect(summary).toContain("from public.tournament_matches as match");
    expect(summary).toContain(
      "public.is_tournament_match_played_for_leaderboard(match.id)"
    );
    expect(summary).toContain("winner.id = match.winner_registration_id");
    expect(summary).toContain("winner.profile_id = p_player_id");
    expect(summary).toContain("generated.format = 'single_elimination'");
    expect(summary).toContain("bracket.launched_at is not null");
    expect(summary).toContain("tournament.status not in ('cancelled', 'voided')");
    expect(summary).toContain(
      "next_round.round_number = round.round_number + 1"
    );
    expect(summary).toContain(
      "next_match.match_number = ceil(match.match_number / 2.0)::integer"
    );
    expect(summary).toContain(
      "next_match.player_one_registration_id = match.winner_registration_id"
    );
    expect(summary).toContain(
      "next_match.player_two_registration_id = match.winner_registration_id"
    );
    expect(summary).toContain("first_advance_match_id");
    expect(summary).not.toContain("where event.event_type = 'round_passed'");
  });

  it("derives championship facts from completed tournament-win leaderboard events", () => {
    const summary = extractFunction(
      "get_player_badge_tournament_prestige_summary"
    );

    expect(summary).toContain("event.event_type = 'tournament_win'");
    expect(summary).toContain(
      "event.source in ('system', 'recalculation')"
    );
    expect(summary).toContain(
      "event.bracket_type in ('academy', 'challenge', 'main')"
    );
    expect(summary).toContain("where event.bracket_type = 'academy'");
    expect(summary).toContain("where event.bracket_type = 'challenge'");
    expect(summary).toContain("where event.bracket_type = 'main'");
    expect(summary).toContain("group by event.tournament_id");
    expect(summary).toContain("where ranked.championship_number = 2");
    expect(summary).toContain("where (select count(*) from division_firsts) = 3");
  });

  it("derives semifinal and final reach from completed single-elimination bracket rounds", () => {
    const summary = extractFunction(
      "get_player_badge_tournament_prestige_summary"
    );

    expect(summary).toContain("generated.format = 'single_elimination'");
    expect(summary).toContain("bracket.launched_at is not null");
    expect(summary).toContain("bracket.name in ('academy', 'challenge', 'main')");
    expect(summary).toContain("match.status = 'completed'");
    expect(summary).toContain("match.winner_registration_id is not null");
    expect(summary).toContain("registration.registration_status = 'approved'");
    expect(summary).toContain(
      "round.round_number = round_scope.final_round_number - 1"
    );
    expect(summary).toContain(
      "round.round_number = round_scope.final_round_number"
    );
    expect(summary).toContain(
      "public.is_registration_confirmed_no_show_for_leaderboard("
    );
  });
});
