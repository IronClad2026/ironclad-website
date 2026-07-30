import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260730090000_secure_steam_identity.sql"
);
const migration = readFileSync(migrationPath, "utf8");
const compactMigration = migration.toLowerCase().replace(/\s+/g, " ").trim();
const publicPlayerProjection = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260613129000_public_player_profile_avatar_presence.sql"
  ),
  "utf8"
)
  .toLowerCase()
  .replace(/\s+/g, " ")
  .trim();

describe("secure Steam identity migration contract", () => {
  it("stores a nullable canonical decimal uint64 as text", () => {
    expect(compactMigration).toContain(
      "alter table public.players add column if not exists steam_id64 text;"
    );
    expect(compactMigration).toContain(
      "add constraint players_steam_id64_format_check check ( steam_id64 is null or case when steam_id64 ~ '^(0|[1-9][0-9]{0,19})$' then steam_id64::numeric <= 18446744073709551615::numeric else false end )"
    );
    expect(compactMigration).not.toContain("steam_id64 bigint");
    expect(compactMigration).not.toContain("{17}");
  });

  it("enforces global uniqueness only for connected Steam accounts", () => {
    expect(compactMigration).toContain(
      "create unique index if not exists players_steam_id64_unique_idx on public.players(steam_id64) where steam_id64 is not null;"
    );
  });

  it("forces browser inserts to null and preserves the stored identity on browser updates", () => {
    expect(compactMigration).toContain(
      "create or replace function public.protect_player_steam_id64() returns trigger language plpgsql security definer set search_path = pg_catalog"
    );
    expect(compactMigration).toContain(
      "if coalesce(auth.role(), '') = 'service_role' then return new;"
    );
    expect(compactMigration).toContain(
      "if tg_op = 'insert' then new.steam_id64 = null; return new; end if;"
    );
    expect(compactMigration).toContain(
      "new.steam_id64 = old.steam_id64; return new;"
    );
    expect(compactMigration).toContain(
      "create trigger players_protect_steam_id64 before insert or update on public.players for each row execute function public.protect_player_steam_id64();"
    );
  });

  it("keeps the trigger helper callable only by the service role", () => {
    expect(compactMigration).toContain(
      "revoke execute on function public.protect_player_steam_id64() from public, anon, authenticated;"
    );
    expect(compactMigration).toContain(
      "grant execute on function public.protect_player_steam_id64() to service_role;"
    );
  });

  it("keeps SteamID64 out of direct browser reads and public projections", () => {
    const authenticatedSelectGrant = compactMigration.match(
      /grant select \((.*?)\) on table public\.players to authenticated;/
    )?.[1];

    expect(compactMigration).toContain(
      "revoke select on table public.players from public, anon, authenticated;"
    );
    expect(authenticatedSelectGrant).toBeDefined();
    expect(authenticatedSelectGrant).not.toContain("steam_id64");
    expect(authenticatedSelectGrant).toContain("coh3_profile_id");
    expect(compactMigration).not.toContain("public_player_profiles");
    expect(publicPlayerProjection).not.toContain("steam_id64");
  });

  it("blocks direct player deletion while preserving service-role deletion", () => {
    expect(compactMigration).toContain(
      'drop policy if exists "players can delete their player profile" on public.players;'
    );
    expect(compactMigration).toContain(
      "revoke delete on table public.players from public, anon, authenticated;"
    );
    expect(compactMigration).toContain(
      "grant delete on table public.players to service_role;"
    );
    expect(compactMigration).not.toContain(
      'create policy "players can delete their player profile"'
    );
  });

  it("allows only the service role to persist SteamID64", () => {
    expect(compactMigration).toContain(
      "grant update (steam_id64) on table public.players to service_role;"
    );
  });

  it("does not modify tournament, registration, match, ELO, or leaderboard contracts", () => {
    for (const table of [
      "registrations",
      "tournaments",
      "tournament_brackets",
      "tournament_matches",
      "match_result_submissions",
      "leaderboard_point_events",
    ]) {
      expect(compactMigration).not.toContain(`public.${table}`);
    }
  });
});
