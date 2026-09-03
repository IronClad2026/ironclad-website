import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260903230000_permanent_staging_academy_uat.sql"
);
const actionPath = join(process.cwd(), "app", "tournaments", "actions.ts");
const adapterPath = join(
  process.cwd(),
  "lib",
  "elo-verification",
  "staging-synthetic-academy.ts"
);
const setupPath = join(
  process.cwd(),
  "scripts",
  "staging-synthetic-academy-uat.mjs"
);

const migration = readFileSync(migrationPath, "utf8");
const action = readFileSync(actionPath, "utf8");
const adapter = readFileSync(adapterPath, "utf8");
const setup = readFileSync(setupPath, "utf8");
const compact = migration.replace(/\s+/g, " ").toLowerCase();

describe("permanent Staging Academy UAT migration", () => {
  it("allowlists exactly TESTACADEMY1-8 at one canonical Academy rating", () => {
    const aliases = [
      ...migration.matchAll(/'TestAcademy([0-9]+)'/g),
    ].map((match) => Number(match[1]));

    expect(aliases).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(migration).not.toContain("'TestAcademy9'");
    expect(migration).not.toContain("'TestAcademy10'");
    expect(migration.match(/'Academy'/g)).toHaveLength(8);
    expect(migration.match(/1000, 'US Forces'/g)).toHaveLength(8);
    expect(migration.match(/'staging-synthetic-academy-v1'/g)).toHaveLength(
      8
    );
  });

  it("uses eight unique deterministic synthetic Steam identities", () => {
    const steamIds = [
      ...migration.matchAll(/'(1844674407370955100[1-8])'/g),
    ].map((match) => match[1]);

    expect(steamIds).toHaveLength(8);
    expect(new Set(steamIds).size).toBe(8);
    expect(
      steamIds.every(
        (steamId) =>
          BigInt(steamId) <= BigInt("18446744073709551615")
      )
    ).toBe(true);
  });

  it("requires both the signed Staging project ref and exact player identity", () => {
    expect(compact).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(compact).toContain(
      "coalesce(auth.jwt() ->> 'ref', '') <> 'zzbnneprhjicmajpjkdg'"
    );
    expect(compact).toContain("fixture.player_id = p_profile_id");
    expect(compact).toContain("player.clerk_user_id = p_clerk_user_id");
    expect(compact).toContain("player.steam_id64 = p_steam_id64");
    expect(compact).toContain(
      "player.steam_id64 = definition.synthetic_steam_id64"
    );
    expect(compact).toContain("fixture.clerk_environment = 'development'");
    expect(compact).toContain("fixture.clerk_test_user_verified");
  });

  it("keeps the resolver service-role-only and provider flags false", () => {
    expect(compact).toContain(
      "revoke all on function public.resolve_staging_synthetic_academy_elo( uuid, text, text ) from public, anon, authenticated, service_role"
    );
    expect(compact).toContain(
      "grant execute on function public.resolve_staging_synthetic_academy_elo( uuid, text, text ) to service_role"
    );
    expect(compact).toContain("fixture.steam_openid_verified is false");
    expect(compact).toContain("fixture.steam_ownership_verified is false");
    expect(compact).toContain("fixture.relic_live_lookup_verified is false");
  });

  it("does not create registrations, badges, reveals, points, seasons, matches, results, or replays", () => {
    for (const forbiddenWrite of [
      "insert into public.registrations",
      "insert into public.player_badge_awards",
      "insert into public.player_badge_reveals",
      "insert into public.leaderboard_point_events",
      "insert into public.leaderboard_player_season_stats",
      "insert into public.tournament_matches",
      "insert into public.match_result_submissions",
      "insert into public.match_replay_upload_attempts",
    ]) {
      expect(compact).not.toContain(forbiddenWrite);
    }

    expect(setup).toContain('method: "PATCH"');
    expect(setup).toContain("/rest/v1/players");
    expect(setup.match(/method: "PATCH"/g)).toHaveLength(1);
    expect(setup).toContain("steam_id64: definition.steamId64");
    expect(setup).toContain("steam_username: definition.steamUsername");
    expect(setup).toContain("JSON.stringify(after.integrity)");
    expect(setup).toContain("JSON.stringify(after.registrations)");
  });

  it("leaves the canonical registration writer as the sole writer", () => {
    expect(migration).not.toMatch(
      /create(?:\s+or\s+replace)?\s+function\s+public\.submit_verified_player_registration/i
    );
    expect(action.match(/"submit_verified_player_registration"/g)).toHaveLength(
      1
    );
    expect(adapter).not.toContain("submit_verified_player_registration");
    expect(adapter).not.toContain("platform_settings");
    expect(adapter).not.toContain("elo_verification");
  });
});
