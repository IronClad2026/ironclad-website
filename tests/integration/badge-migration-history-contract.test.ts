import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationDirectory = resolve(process.cwd(), "supabase/migrations");

const appliedBadgeMigrations = [
  "20260821000000_badge_award_foundation.sql",
  "20260821001000_badge_batch_2_authority.sql",
  "20260821002000_badge_progression_championship_authority.sql",
  "20260821003000_badge_streak_clean_upset_authority.sql",
  "20260821004000_badge_season_authority.sql",
  "20260821005000_badge_bracket_progression_authority.sql",
  "20260821006000_match_authority_foundation.sql",
  "20260821007000_badge_reliable_competitor_authority.sql",
  "20260821008000_badge_comeback_commander_authority.sql",
  "20260821009000_tournament_championship_path_authority.sql",
  "20260821010000_badge_flawless_campaign_authority.sql",
  "20260830090000_player_badge_reveals.sql",
  "20260831090000_service_role_badge_e2e_season_read.sql",
] as const;

function readMigration(name: string) {
  return readFileSync(resolve(migrationDirectory, name), "utf8")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

describe("recovered Badge migration history", () => {
  it("retains every applied Badge version in exact ledger order", () => {
    const names = readdirSync(migrationDirectory).sort();
    const recovered = names.filter((name) =>
      appliedBadgeMigrations.includes(
        name as (typeof appliedBadgeMigrations)[number]
      )
    );

    expect(recovered).toEqual(appliedBadgeMigrations);
    expect(names).not.toContain("20260831100000_staging_badge_e2e_runs.sql");
    expect(names.indexOf("20260831130000_badge_authority_forward_repairs.sql"))
      .toBeGreaterThan(names.indexOf(appliedBadgeMigrations.at(-1)!));
    expect(names.indexOf("20260831131000_badge_reconciliation_targets.sql"))
      .toBeGreaterThan(
        names.indexOf("20260831130000_badge_authority_forward_repairs.sql")
      );
  });

  it("keeps ownership immutable, unique, and unavailable to browser writes", () => {
    const foundation = readMigration(appliedBadgeMigrations[0]);
    const repairs = readMigration(
      "20260831130000_badge_authority_forward_repairs.sql"
    );

    expect(foundation).toContain("create table public.player_badge_awards");
    expect(foundation).toContain(
      "create unique index player_badge_awards_player_badge_key on public.player_badge_awards(player_id, badge_slug)"
    );
    expect(foundation).toContain(
      "alter table public.player_badge_awards force row level security"
    );
    expect(foundation).toContain(
      "grant select on table public.player_badge_awards to authenticated"
    );
    expect(foundation).not.toMatch(
      /grant\s+(?:insert|update|delete)[^;]*player_badge_awards[^;]*authenticated/
    );
    expect(repairs).toContain(
      "revoke all on table public.player_badge_awards from service_role"
    );
    expect(repairs).toContain(
      "grant select, insert on table public.player_badge_awards to service_role"
    );
    expect(repairs).not.toMatch(
      /grant\s+(?:update|delete|all)[^;]*player_badge_awards[^;]*service_role/
    );
  });

  it("keeps award authority functions service-role-only", () => {
    const foundation = readMigration(appliedBadgeMigrations[0]);

    for (const signature of [
      "public.get_player_badge_match_participants(uuid)",
      "public.get_player_badge_match_summary(uuid)",
    ]) {
      expect(foundation).toContain(
        `revoke all on function ${signature} from public, anon, authenticated, service_role`
      );
      expect(foundation).toContain(
        `grant execute on function ${signature} to service_role`
      );
    }
  });
});

describe("Badge reveal persistence migration", () => {
  const reveal = readMigration(
    "20260830090000_player_badge_reveals.sql"
  );

  it("models acknowledgement separately from immutable ownership", () => {
    expect(reveal).toContain("create table public.player_badge_reveals");
    expect(reveal).toContain("unique (player_badge_award_id)");
    expect(reveal).toContain(
      "foreign key (player_badge_award_id, player_id) references public.player_badge_awards(id, player_id)"
    );
    expect(reveal).not.toMatch(/update\s+public\.player_badge_awards/);
    expect(reveal).not.toMatch(/insert\s+into\s+public\.player_badge_awards/);
  });

  it("allows only an authenticated owner to insert one acknowledgement", () => {
    expect(reveal).toContain(
      "alter table public.player_badge_reveals force row level security"
    );
    expect(reveal).toContain(
      "grant insert (player_badge_award_id, player_id) on table public.player_badge_reveals to authenticated"
    );
    expect(reveal).toContain(
      "player.clerk_user_id = (auth.jwt() ->> 'sub')"
    );
    expect(reveal).not.toMatch(
      /grant\s+(?:update|delete)[^;]*player_badge_reveals/
    );
  });
});
