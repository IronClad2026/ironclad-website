import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationDirectory = resolve(process.cwd(), "supabase", "migrations");
const foundationPath = resolve(
  migrationDirectory,
  "20260624090000_leaderboard_foundation.sql"
);
const accountClosurePath = resolve(
  migrationDirectory,
  "20260813101000_competition_history_safe_account_closure.sql"
);
const publicProjectionPath = resolve(
  migrationDirectory,
  "20260813102000_phase7_public_leaderboard_integration.sql"
);
const firstPrbPath = resolve(
  migrationDirectory,
  "20260814110000_phase7_authority_archive_privacy.sql"
);
const correctionPath = resolve(
  migrationDirectory,
  "20260814111000_phase7_raw_leaderboard_read_privacy.sql"
);

function compactSql(path: string) {
  return readFileSync(path, "utf8").replace(/\s+/g, " ").trim().toLowerCase();
}

function statementStartingAt(sql: string, marker: string) {
  const start = sql.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf(";", start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end + 1);
}

function allMigrationsBeforeCorrection() {
  return readdirSync(migrationDirectory)
    .filter(
      (name) =>
        name.endsWith(".sql") &&
        name < "20260814111000_phase7_raw_leaderboard_read_privacy.sql"
    )
    .sort()
    .map((name) => compactSql(resolve(migrationDirectory, name)))
    .join(" ");
}

describe("Phase 7 raw leaderboard read privacy correction", () => {
  it("records the old browser grants, dormant public policies, and live point-event bypass", () => {
    const foundation = compactSql(foundationPath);
    const accountClosure = compactSql(accountClosurePath);
    const firstPrb = compactSql(firstPrbPath);
    const migrationsBeforeCorrection = allMigrationsBeforeCorrection();
    const originalAuthenticatedGrant = statementStartingAt(
      foundation,
      "grant select, insert, update, delete"
    );

    expect(foundation).toContain(
      "grant select on public.leaderboard_player_all_time_stats to anon, authenticated;"
    );
    expect(originalAuthenticatedGrant).toContain(
      "public.leaderboard_point_events"
    );
    expect(accountClosure).toContain(
      "revoke select on table public.leaderboard_seasons, public.leaderboard_player_season_stats, public.leaderboard_player_all_time_stats, public.leaderboard_season_champions from anon, authenticated;"
    );
    expect(firstPrb).toContain(
      "revoke select, insert, update, delete on table public.leaderboard_recalculation_runs from authenticated;"
    );
    expect(migrationsBeforeCorrection).not.toContain(
      "revoke select on table public.leaderboard_point_events from authenticated;"
    );
    expect(foundation).toContain(
      'create policy "admins can manage leaderboard point events" on public.leaderboard_point_events for all to authenticated'
    );

    for (const policyName of [
      "Public can read leaderboard seasons",
      "Public can read leaderboard season stats",
      "Public can read leaderboard all time stats",
      "Public can read leaderboard season champions",
    ]) {
      expect(foundation).toContain(
        `create policy "${policyName.toLowerCase()}"`
      );
    }
  });

  it("revokes every raw browser SELECT and removes obsolete read policies without mutating data", () => {
    expect(existsSync(correctionPath)).toBe(true);
    if (!existsSync(correctionPath)) {
      return;
    }

    const correction = compactSql(correctionPath);
    const revoke = statementStartingAt(correction, "revoke select on table");

    for (const table of [
      "leaderboard_seasons",
      "leaderboard_point_events",
      "leaderboard_player_season_stats",
      "leaderboard_player_all_time_stats",
      "leaderboard_season_champions",
      "leaderboard_recalculation_runs",
    ]) {
      expect(revoke).toContain(`public.${table}`);
    }

    expect(revoke).toContain("from public, anon, authenticated;");

    for (const [policyName, table] of [
      ["Public can read leaderboard seasons", "leaderboard_seasons"],
      [
        "Public can read leaderboard season stats",
        "leaderboard_player_season_stats",
      ],
      [
        "Public can read leaderboard all time stats",
        "leaderboard_player_all_time_stats",
      ],
      [
        "Public can read leaderboard season champions",
        "leaderboard_season_champions",
      ],
      [
        "Admins can manage leaderboard point events",
        "leaderboard_point_events",
      ],
    ]) {
      expect(correction).toContain(
        `drop policy if exists "${policyName.toLowerCase()}" on public.${table};`
      );
    }

    expect(correction).not.toContain("service_role");
    expect(correction).not.toMatch(
      /\binsert\s+into\b|\bupdate\s+public\.|\bdelete\s+from\b|\btruncate\b/
    );
  });

  it("preserves the four owner-rights public views as the only browser leaderboard source", () => {
    const publicProjection = compactSql(publicProjectionPath);
    const correction = existsSync(correctionPath)
      ? compactSql(correctionPath)
      : "";

    for (const view of [
      "leaderboard_current_season",
      "leaderboard_public_season_standings",
      "leaderboard_public_all_time_standings",
      "leaderboard_public_season_champions",
    ]) {
      expect(publicProjection).toContain(
        `alter view public.${view} owner to postgres;`
      );
      expect(publicProjection).toContain(
        `alter view public.${view} set (security_barrier = true, security_invoker = false);`
      );
      expect(correction).not.toContain(`public.${view}`);
    }

    expect(publicProjection).toContain(
      "grant select on table public.leaderboard_current_season, public.leaderboard_public_season_standings, public.leaderboard_public_all_time_standings, public.leaderboard_public_season_champions to anon, authenticated, service_role;"
    );
    expect(publicProjection).toContain(
      "when player.account_closed_at is null and player.public_profile_enabled then all_time.player_id else null::uuid end as player_id"
    );
    expect(publicProjection).toContain(
      "when player.account_closed_at is not null then 'former competitor'"
    );
    expect(publicProjection).toContain(
      "season.under_review_at is not null as is_under_review"
    );
    expect(publicProjection).not.toContain("under_review_reason");
    expect(publicProjection).not.toContain("under_review_by_clerk_user_id");
  });
});
