import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260820110000_badge_batch_2_authority.sql";
const previousMigrationName = "20260820100000_badge_award_foundation.sql";
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

describe("badge batch 2 authority migration", () => {
  it("is ordered after the badge foundation migration and remains additive", () => {
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

  it("keeps every new helper service-role-only with safe search paths", () => {
    for (const functionName of [
      "get_player_badge_match_threshold_summary",
      "get_player_badge_tournament_for_match",
      "get_player_badge_tournament_participants",
      "get_player_badge_tournament_summary",
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

  it("extends match thresholds without changing official played-match qualification", () => {
    const summary = extractFunction("get_player_badge_match_threshold_summary");

    expect(summary).toContain(
      "public.is_tournament_match_played_for_leaderboard( tournament_match.id )"
    );
    expect(summary).toContain(
      "join public.generated_brackets as generated on generated.id = tournament_match.generated_bracket_id"
    );
    expect(summary).toContain(
      "join public.tournament_brackets as bracket on bracket.id = generated.tournament_bracket_id"
    );
    expect(summary).toContain(
      "join public.tournaments as tournament on tournament.id = bracket.tournament_id"
    );
    expect(summary).toContain(
      "tournament.status not in ('cancelled', 'voided')"
    );
    expect(summary).toContain("where ranked.win_number = 10");
    expect(summary).toContain("where ranked.win_number = 25");
    expect(summary).toContain("tenth_win_match_id");
    expect(summary).toContain("twenty_fifth_win_match_id");
  });

  it("uses completed leaderboard participation facts for tournament counts", () => {
    const participants = extractFunction(
      "get_player_badge_tournament_participants"
    );
    const summary = extractFunction("get_player_badge_tournament_summary");

    for (const helper of [participants, summary]) {
      expect(helper).toContain("from public.leaderboard_point_events as event");
      expect(helper).toContain(
        "join public.tournaments as tournament on tournament.id = event.tournament_id"
      );
      expect(helper).toContain("tournament.status = 'completed'");
      expect(helper).toContain("tournament.first_completed_at is not null");
      expect(helper).toContain("event.event_type = 'participation'");
      expect(helper).toContain(
        "event.source in ('system', 'recalculation')"
      );
      expect(helper).toContain("event.registration_id is not null");
      expect(helper).toContain("event.tournament_bracket_id is not null");
      expect(helper).toContain("withheld.event_type = 'participation_withheld'");
    }

    expect(summary).toContain("group by event.tournament_id");
    expect(summary).toContain("where ranked.tournament_number = 1");
    expect(summary).toContain("where ranked.tournament_number = 3");
    expect(summary).toContain("where ranked.tournament_number = 10");
  });

  it("only maps a match to a tournament after completion", () => {
    const helper = extractFunction("get_player_badge_tournament_for_match");

    expect(helper).toContain(
      "join public.generated_brackets as generated on generated.id = tournament_match.generated_bracket_id"
    );
    expect(helper).toContain(
      "join public.tournament_brackets as bracket on bracket.id = generated.tournament_bracket_id"
    );
    expect(helper).toContain(
      "join public.tournaments as tournament on tournament.id = bracket.tournament_id"
    );
    expect(helper).toContain("tournament.status = 'completed'");
    expect(helper).toContain("tournament.first_completed_at is not null");
  });
});
