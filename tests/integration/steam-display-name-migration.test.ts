import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260807100000_protect_steam_display_name.sql"
);
const migration = readFileSync(migrationPath, "utf8");
const compactMigration = migration.toLowerCase().replace(/\s+/g, " ").trim();
const baseSchema = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260611080000_base_schema.sql"
  ),
  "utf8"
)
  .toLowerCase()
  .replace(/\s+/g, " ")
  .trim();

describe("Steam display name protection migration contract", () => {
  it("reuses the existing steam_username column without adding identity schema", () => {
    expect(baseSchema).toContain("steam_username text");
    expect(compactMigration).not.toContain("add column");
    expect(compactMigration).not.toContain("steam_display_name text");
    expect(compactMigration).not.toContain("steam_display_name_synced_at");
  });

  it("clears browser-supplied Steam identity on insert and preserves it on update", () => {
    expect(compactMigration).toContain(
      "create or replace function public.protect_player_steam_id64() returns trigger language plpgsql security definer set search_path = pg_catalog"
    );
    expect(compactMigration).toContain(
      "if coalesce(auth.role(), '') <> 'service_role' then if tg_op = 'insert' then new.steam_id64 = null; new.steam_username = null; else new.steam_id64 = old.steam_id64; new.steam_username = old.steam_username; end if; end if;"
    );
  });

  it("permits trusted service-role synchronization only", () => {
    expect(compactMigration).toContain(
      "if coalesce(auth.role(), '') <> 'service_role' then"
    );
    expect(compactMigration).toContain(
      "revoke execute on function public.protect_player_steam_id64() from public, anon, authenticated;"
    );
    expect(compactMigration).toContain(
      "grant execute on function public.protect_player_steam_id64() to service_role;"
    );
    expect(compactMigration).toContain(
      "grant update (steam_username) on table public.players to service_role;"
    );
  });

  it("invalidates legacy manual names without changing historical registrations", () => {
    expect(compactMigration).toContain(
      "update public.players set steam_username = null, profile_completed = false where steam_username is not null;"
    );
    expect(compactMigration.match(/\bupdate public\.players\b/g)).toHaveLength(1);
    expect(compactMigration).not.toContain("update public.registrations");
  });

  it("recomputes completion atomically from the protected row", () => {
    expect(compactMigration).toContain(
      "new.profile_completed = ( nullif(btrim(new.avatar_url), '') is not null"
    );
    for (const field of [
      "discord_username",
      "steam_username",
      "country",
      "region",
      "timezone",
    ]) {
      expect(compactMigration).toContain(
        `nullif(btrim(new.${field}), '') is not null`
      );
    }
    expect(compactMigration).toContain(
      "nullif(btrim(new.display_name), '') is not null or nullif(btrim(new.in_game_name), '') is not null"
    );
  });

  it("does not touch unrelated tables or data", () => {
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

    expect(compactMigration).not.toMatch(/\binsert into\b/);
    expect(compactMigration).not.toMatch(/\bdelete from\b/);
    expect(compactMigration).not.toMatch(/\btruncate\b/);
  });
});
