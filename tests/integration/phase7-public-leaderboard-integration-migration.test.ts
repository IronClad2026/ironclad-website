import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName =
  "20260813102000_phase7_public_leaderboard_integration.sql";
const previousMigrationName =
  "20260813101000_competition_history_safe_account_closure.sql";
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations", migrationName),
  "utf8"
);
const compactMigration = migration.toLowerCase().replace(/\s+/g, " ").trim();

function extractView(viewName: string) {
  const marker = `create or replace view public.${viewName}`;
  const start = compactMigration.indexOf(marker);
  const end = compactMigration.indexOf(";", start);

  if (start < 0 || end < 0) {
    throw new Error(`${viewName} was not found in the PR 5 migration.`);
  }

  return compactMigration.slice(start, end + 1);
}

const featuredSeason = extractView("leaderboard_current_season");
const seasonStandings = extractView(
  "leaderboard_public_season_standings"
);
const allTimeStandings = extractView(
  "leaderboard_public_all_time_standings"
);
const champions = extractView("leaderboard_public_season_champions");

describe("Phase 7 public leaderboard integration migration", () => {
  it("is the single ordered PR 5 migration and changes projections only", () => {
    const migrationNames = readdirSync(
      resolve(process.cwd(), "supabase/migrations")
    ).filter((name) => name.endsWith(".sql"));

    expect(migrationNames.indexOf(previousMigrationName)).toBeGreaterThanOrEqual(
      0
    );
    expect(migrationNames.indexOf(migrationName)).toBe(
      migrationNames.indexOf(previousMigrationName) + 1
    );
    expect(compactMigration).toMatch(/^begin;/);
    expect(compactMigration).toMatch(/commit;$/);
    expect(
      compactMigration.match(/create or replace view public\./g) ?? []
    ).toHaveLength(4);
    expect(compactMigration).not.toMatch(
      /create (?:table|function|trigger|index|policy)|alter table|insert into|update public\.|delete from|backfill/
    );
  });

  it("features unfinished Main facts before the latest finalized season", () => {
    expect(featuredSeason).toContain(
      "from public.leaderboard_tournament_season_memberships as membership"
    );
    expect(featuredSeason).toContain(
      "membership.qualifying_event_number is not null"
    );
    expect(featuredSeason).toContain("membership.voided_at is null");
    expect(featuredSeason).toContain("as valid_main_event_count");
    expect(featuredSeason).toContain(
      "season.finalized_at is not null as is_finalized"
    );
    expect(featuredSeason).toContain(
      "season.under_review_at is not null as is_under_review"
    );
    expect(featuredSeason).toContain(
      "case when season.finalized_at is null then 0 else 1 end"
    );
    expect(featuredSeason).toContain("season.finalized_at desc nulls last");
    expect(featuredSeason).toContain("limit 1");
    expect(featuredSeason).not.toMatch(
      /under_review_reason|under_review_by_clerk_user_id|under_review_tournament_id/
    );
  });

  it("retains active opted-out competitors without profile identity", () => {
    for (const view of [seasonStandings, allTimeStandings]) {
      expect(view).toContain("and player.public_profile_enabled");
      expect(view).toContain("else null::uuid");
      expect(view).toContain("else player.in_game_name");
      expect(view).toContain("else null end as country");
      expect(view).toContain("else null end as region");
      expect(view).toContain("else null end as current_elo");
      expect(view).toContain("null::text as avatar_url");
      expect(view).toContain("as display_order");
      expect(view).not.toMatch(
        /where player\.public_profile_enabled|clerk_user_id|steam_id64|discord_username|avatar_url as avatar_url/
      );
    }

    expect(seasonStandings).toContain(
      "from public.leaderboard_player_season_stats"
    );
    expect(allTimeStandings).toContain(
      "from public.leaderboard_player_all_time_stats"
    );
  });

  it("keeps closed rows pseudonymous and champion identities public-safe", () => {
    for (const view of [seasonStandings, allTimeStandings, champions]) {
      expect(view).toContain("'former competitor'");
      expect(view).not.toMatch(
        /clerk_user_id|steam_id64|coh3_profile_id|discord_username|terminal_reason|under_review_reason/
      );
    }

    expect(champions).toContain("'private-champion:' || md5(champion.id::text)");
    expect(champions).toContain("else null::uuid end as player_id");
    expect(champions).not.toContain(
      "where player.public_profile_enabled"
    );
  });

  it("preserves owner-rights security barriers and read-only public grants", () => {
    for (const viewName of [
      "leaderboard_current_season",
      "leaderboard_public_season_standings",
      "leaderboard_public_all_time_standings",
      "leaderboard_public_season_champions",
    ]) {
      expect(compactMigration).toContain(
        `alter view public.${viewName} owner to postgres`
      );
      expect(compactMigration).toContain(
        `alter view public.${viewName}`
      );
    }

    expect(compactMigration).toContain(
      "set (security_barrier = true, security_invoker = false)"
    );
    expect(compactMigration).toContain(
      "from public, anon, authenticated, service_role"
    );
    expect(compactMigration).toContain(
      "to anon, authenticated, service_role"
    );
    expect(compactMigration).not.toMatch(/grant (?:insert|update|delete|all)/);
  });
});
