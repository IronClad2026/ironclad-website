import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getTournamentEventSection,
  resolveTournamentDivisionStates,
} from "@/lib/tournament-division-state";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260902130000_event_based_tournament_scheduling.sql"
);
const migration = readFileSync(migrationPath, "utf8");
const compactMigration = compact(migration);
const publicPage = compact(
  readFileSync(resolve(process.cwd(), "app/tournaments/page.tsx"), "utf8")
);
const publicExperience = compact(
  readFileSync(
    resolve(process.cwd(), "components/TournamentsExperience.tsx"),
    "utf8"
  )
);
const editor = compact(
  readFileSync(
    resolve(
      process.cwd(),
      "components/admin/tournaments/TournamentEditor.tsx"
    ),
    "utf8"
  )
);
const databaseBehavior = compact(
  readFileSync(
    resolve(
      process.cwd(),
      "tests/database/event-based-tournament-scheduling.sql"
    ),
    "utf8"
  )
);
const concurrencyHarness = compact(
  readFileSync(
    resolve(
      process.cwd(),
      "tests/database/event-based-tournament-scheduling-concurrency.ps1"
    ),
    "utf8"
  )
);
const launchCoreAuthority = compact(
  readFileSync(
    resolve(
      process.cwd(),
      "supabase/migrations/20260806130000_phase4_withdrawal_waitlist_division_launch.sql"
    ),
    "utf8"
  )
);

describe("event-based tournament scheduling migration", () => {
  it("minimally replaces the existing save authority and preserves its boundary", () => {
    expect(compactMigration.startsWith("begin;")).toBe(true);
    expect(compactMigration.endsWith("commit;")).toBe(true);
    expect(
      compactMigration.match(
        /create or replace function public\.save_tournament\s*\(/g
      )
    ).toHaveLength(1);
    expect(compactMigration).not.toMatch(/create table|alter table|create type/);
    expect(compactMigration).not.toMatch(/create (?:or replace )?function public\.(?!save_tournament)/);
    expect(compactMigration).toContain("security definer set search_path = pg_catalog");
    expect(compactMigration).toContain(
      "revoke all on function public.save_tournament"
    );
    expect(compactMigration).toContain("from public, anon, authenticated");
    expect(compactMigration).toContain(
      "grant execute on function public.save_tournament"
    );
    expect(compactMigration).toContain("to service_role");
  });

  it("serializes and rejects only a competing unresolved canonical Division", () => {
    expect(compactMigration).toContain(
      "pg_catalog.pg_advisory_xact_lock( pg_catalog.hashtextextended( 'ironclad:ranked-division-cycle:' || v_bracket_name, 0 ) )"
    );
    expect(compactMigration).toContain(
      "bracket.name = v_bracket_name"
    );
    expect(compactMigration).toContain(
      "tournament.id <> p_tournament_id"
    );
    expect(compactMigration).toContain(
      "coalesce(tournament.status, '') not in ( 'completed', 'cancelled', 'voided' )"
    );
    expect(compactMigration).toContain(
      "public.is_generated_bracket_complete(generated.id) is distinct from true"
    );
    expect(compactMigration).toContain("using errcode = '55000'");
    expect(compactMigration).not.toContain("grand_final_at = p_grand_final_at");
  });

  it("stores no predicted Grand Final for new events and preserves historical values", () => {
    const insertIndex = compactMigration.indexOf("insert into public.tournaments");
    const updateIndex = compactMigration.indexOf("update public.tournaments");
    const bracketInsertIndex = compactMigration.indexOf(
      "insert into public.tournament_brackets"
    );
    const insert = compactMigration.slice(insertIndex, updateIndex);
    const update = compactMigration.slice(updateIndex, bracketInsertIndex);

    expect(insert).toContain("registration_enabled, grand_final_at, rule_format");
    expect(insert).toContain("p_registration_enabled, null, v_rule_format");
    expect(update).not.toContain("grand_final_at");
    expect(update).toContain("registration_open_at = p_registration_open_at");
    expect(update).toContain("registration_close_at = p_registration_close_at");
  });

  it("retains sibling registration and the established rolling Match deadline authority", () => {
    expect(launchCoreAuthority).toContain(
      "registration_enabled = case when exists ( select 1 from public.tournament_brackets as other_bracket where other_bracket.tournament_id = v_tournament_id and other_bracket.launched_at is null ) then registration_enabled else false end"
    );
    expect(compactMigration).not.toContain(
      "create or replace function public.launch_tournament_division"
    );
    expect(compactMigration).not.toContain(
      "create or replace function public.activate_tournament_match"
    );
    expect(compactMigration).not.toContain("deadline_at");
  });

  it("does not introduce Badge, settlement, point, season, or notification writes", () => {
    expect(compactMigration).not.toMatch(
      /player_badge_awards|badge_reconciliation|badge\.unlocked|in_app_notifications|leaderboard_point_events|season_memberships|tournament_statistics/
    );
  });

  it("ships rollback-only behavior coverage and a disposable local concurrency proof", () => {
    expect(databaseBehavior.startsWith("-- rollback-only")).toBe(true);
    expect(databaseBehavior).toContain("begin;");
    expect(databaseBehavior.endsWith("rollback;")).toBe(true);
    expect(databaseBehavior).toContain(
      "a second unresolved academy cycle was not rejected"
    );
    expect(databaseBehavior).toContain(
      "historical grand final metadata changed during edit"
    );
    expect(databaseBehavior).toContain(
      "unrelated divisions or blank optional dates were rejected"
    );
    expect(databaseBehavior).toContain(
      "save operations changed badge, reveal, notification, point, or season totals"
    );
    expect(concurrencyHarness).toContain(
      "^ironclad_event_schedule_[a-za-z0-9_]+$"
    );
    expect(concurrencyHarness).toContain("127.0.0.1");
    expect(concurrencyHarness).toContain(
      "ironclad:ranked-division-cycle:academy"
    );
    expect(concurrencyHarness).toContain("secondrejectedwith55000");
    expect(concurrencyHarness).toContain("unresolvedacademycycles");
    expect(concurrencyHarness).toContain("productiontouched = $false");
  });

  it("removes calendar prediction from active Admin and public surfaces", () => {
    expect(editor).not.toContain('name="grandfinalat"');
    expect(editor).toContain("data-event-scheduling-policy");
    expect(editor).toContain("data-registration-window-controls");
    expect(editor).toContain(
      "each division launches independently when eight approved players are ready"
    );
    expect(editor).toContain(
      "each matchup, including the grand final, normally receives seven days after activation"
    );
    expect(publicPage).not.toContain('.order("grand_final_at"');
    expect(publicPage).not.toContain("grand_final_at");
    expect(publicExperience).not.toContain("eventsbymonth");
    expect(publicExperience).not.toContain("tournament.month");
    expect(publicExperience).not.toContain("tournament.time");
    expect(publicExperience).not.toContain("tournament.grandfinalat");
    expect(publicExperience).toContain("grouptournamentsbylifecycle");
  });
});

describe("event lifecycle grouping", () => {
  it("keeps mixed-state events in competition until every held Division resolves", () => {
    const states = resolveTournamentDivisionStates({
      tournamentId: "event-a",
      eventStatus: "in_progress",
      divisions: [
        division("Academy", "academy", true, true),
        division("Challenge", "challenge", true, false),
        division("Main", "main", false, false),
      ],
    });

    expect(getTournamentEventSection(states)).toBe("in_competition");
  });

  it("classifies unlaunched ready/filling events as open and terminal events as resolved", () => {
    const openStates = resolveTournamentDivisionStates({
      tournamentId: "event-b",
      eventStatus: "registration_open",
      divisions: [division("Academy", "academy", false, false)],
    });
    const resolvedStates = resolveTournamentDivisionStates({
      tournamentId: "event-c",
      eventStatus: "voided",
      divisions: [division("Academy", "academy", false, false)],
    });

    expect(getTournamentEventSection(openStates)).toBe("open");
    expect(getTournamentEventSection(resolvedStates)).toBe("resolved");
  });
});

function division(
  canonicalName: "Academy" | "Challenge" | "Main",
  bracketId: string,
  launched: boolean,
  complete: boolean
) {
  return {
    canonicalName,
    bracketId,
    approvedCount: 8,
    requiredCount: 8,
    isReady: !launched,
    launchedAt: launched ? "2026-09-02T00:00:00.000Z" : null,
    generatedBracketId: launched ? `generated-${bracketId}` : null,
    isCompetitionComplete: complete,
  } as const;
}

function compact(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
