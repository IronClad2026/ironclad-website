import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationDirectory = resolve(process.cwd(), "supabase", "migrations");
const foundationPath = resolve(
  migrationDirectory,
  "20260624090000_leaderboard_foundation.sql"
);
const seasonCorrectionPath = resolve(
  migrationDirectory,
  "20260812120000_six_event_main_seasons_late_entry_bonus.sql"
);
const correctionPath = resolve(
  migrationDirectory,
  "20260814110000_phase7_authority_archive_privacy.sql"
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

describe("Phase 7 leaderboard authority correction migration", () => {
  it("records the inherited authenticated DML grants and the later omission", () => {
    const foundation = compactSql(foundationPath);
    const seasonCorrection = compactSql(seasonCorrectionPath);
    const foundationGrant = statementStartingAt(
      foundation,
      "grant select, insert, update, delete"
    );
    const laterRevoke = statementStartingAt(
      seasonCorrection,
      "revoke insert, update, delete"
    );

    expect(foundationGrant).toContain("public.leaderboard_player_all_time_stats");
    expect(foundationGrant).toContain("public.leaderboard_recalculation_runs");
    expect(foundation).toContain(
      'create policy "admins can manage leaderboard all time stats"'
    );
    expect(foundation).toContain(
      'create policy "admins can manage leaderboard recalculation runs"'
    );
    expect(laterRevoke).not.toContain(
      "public.leaderboard_player_all_time_stats"
    );
    expect(laterRevoke).not.toContain("public.leaderboard_recalculation_runs");
  });

  it("removes browser DML and obsolete broad policies without mutating data", () => {
    expect(existsSync(correctionPath)).toBe(true);
    if (!existsSync(correctionPath)) {
      return;
    }

    const correction = compactSql(correctionPath);

    expect(correction).toContain(
      "revoke insert, update, delete on table public.leaderboard_player_all_time_stats from authenticated;"
    );
    expect(correction).toContain(
      "revoke select, insert, update, delete on table public.leaderboard_recalculation_runs from authenticated;"
    );
    expect(correction).toContain(
      'drop policy if exists "admins can manage leaderboard all time stats" on public.leaderboard_player_all_time_stats;'
    );
    expect(correction).toContain(
      'drop policy if exists "admins can manage leaderboard recalculation runs" on public.leaderboard_recalculation_runs;'
    );
    expect(correction).not.toContain(
      'create policy "admins can manage leaderboard all time stats"'
    );
    expect(correction).not.toContain(
      'create policy "admins can manage leaderboard recalculation runs"'
    );
    expect(correction).not.toMatch(
      /\binsert\s+into\b|\bupdate\s+public\.|\bdelete\s+from\b|\btruncate\b/
    );
  });

  it("preserves the public-safe all-time projection and service-role admin path", () => {
    expect(existsSync(correctionPath)).toBe(true);
    if (!existsSync(correctionPath)) {
      return;
    }

    const correction = compactSql(correctionPath);
    const publicProjection = compactSql(
      resolve(
        migrationDirectory,
        "20260813102000_phase7_public_leaderboard_integration.sql"
      )
    );
    const adminSource = readFileSync(
      resolve(process.cwd(), "lib", "leaderboard", "admin.ts"),
      "utf8"
    );

    expect(correction).not.toContain(
      'drop policy if exists "public can read leaderboard all time stats"'
    );
    expect(publicProjection).toContain(
      "grant select on table public.leaderboard_current_season, public.leaderboard_public_season_standings, public.leaderboard_public_all_time_standings, public.leaderboard_public_season_champions to anon, authenticated, service_role;"
    );
    expect(correction).not.toContain("from service_role");
    expect(adminSource).toContain("createSupabaseAdminClient");
    expect(adminSource).toContain('.from("leaderboard_recalculation_runs")');
  });
});
