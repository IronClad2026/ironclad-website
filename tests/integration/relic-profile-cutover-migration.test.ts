import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readCompact(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const migration = readCompact(
  "supabase/migrations/20260805140000_relic_profile_cutover.sql"
);
const registrationMigration = readCompact(
  "supabase/migrations/20260804100000_relic_registration_snapshot.sql"
);
const baseSchema = readCompact(
  "supabase/migrations/20260611080000_base_schema.sql"
);
const publicPlayersLoader = readCompact("lib/public-players.ts");
const publicLeaderboardLoader = readCompact("lib/leaderboard/public.ts");

function extractFunctionBody(source: string, functionName: string) {
  const start = source.indexOf(
    `create or replace function public.${functionName}`
  );
  const end = source.indexOf("$$;", start);

  if (start < 0 || end < 0) {
    throw new Error(`${functionName} body was not found.`);
  }

  return source.slice(start, end + 3);
}

describe("Relic profile cutover migration contract", () => {
  it("keeps Current ELO integer and leaves public and leaderboard views untouched", () => {
    expect(baseSchema).toContain(
      "current_elo integer check ( current_elo is null or current_elo between 0 and 5000 )"
    );
    expect(migration).not.toMatch(
      /alter\s+(?:column\s+)?current_elo\s+type/
    );
    expect(migration).not.toContain("public_player_profiles");
    expect(migration).not.toContain("leaderboard_");
    expect(migration).not.toContain("is_elo_eligible");
    expect(migration).not.toMatch(
      /(?:revoke|grant)\s+(?:insert|update).*table public\.players/
    );
  });

  it("atomically saves one validated profile Relic result with database time", () => {
    const profileRpc = extractFunctionBody(
      migration,
      "save_relic_profile_elo_snapshot("
    );

    expect(profileRpc).toContain("language plpgsql security definer");
    expect(profileRpc).toContain("set search_path = pg_catalog");
    expect(profileRpc).toContain(
      "if coalesce(auth.role(), '') <> 'service_role' then raise exception 'not authorized';"
    );
    expect(profileRpc).toContain("p_relic_elo > 5000");
    expect(profileRpc).toContain(
      "when p_relic_elo < 1100 then 'academy' when p_relic_elo < 1400 then 'challenge' else 'main / pro'"
    );
    expect(profileRpc).toContain(
      "p_relic_division is distinct from v_expected_division"
    );
    expect(profileRpc).toContain(
      "v_verified_at := clock_timestamp(); return query update public.players as player"
    );

    for (const assignment of [
      "current_elo = p_relic_elo",
      "relic_verified_elo = p_relic_elo",
      "relic_verified_faction = p_relic_faction",
      "relic_verified_division = p_relic_division",
      "relic_elo_calculation_version = v_calculation_version",
      "relic_elo_verified_at = v_verified_at",
    ]) {
      expect(profileRpc).toContain(assignment);
    }

    for (const identityGuard of [
      "player.id = p_player_id",
      "player.clerk_user_id = p_clerk_user_id",
      "player.steam_id64 = p_steam_id64",
      "player.relic_elo_last_attempt_at = p_claimed_at",
    ]) {
      expect(profileRpc).toContain(identityGuard);
    }

    expect(profileRpc).toContain(
      "returning player.current_elo, player.relic_verified_elo, player.relic_verified_faction, player.relic_verified_division, player.relic_elo_calculation_version, player.relic_elo_verified_at"
    );
    expect(migration).toContain(
      "alter function public.save_relic_profile_elo_snapshot( uuid, text, text, timestamptz, integer, text, text, text ) owner to postgres;"
    );
    expect(migration).toContain(
      "revoke all on function public.save_relic_profile_elo_snapshot( uuid, text, text, timestamptz, integer, text, text, text ) from public, anon, authenticated, service_role;"
    );
    expect(migration).toContain(
      "grant execute on function public.save_relic_profile_elo_snapshot( uuid, text, text, timestamptz, integer, text, text, text ) to service_role;"
    );
  });

  it("changes the registration RPC body only by adding the Current ELO assignment", () => {
    const previousRpc = extractFunctionBody(
      registrationMigration,
      "submit_verified_player_registration("
    );
    const replacementRpc = extractFunctionBody(
      migration,
      "submit_verified_player_registration("
    );

    expect(replacementRpc).toContain("current_elo = p_relic_elo");
    expect(replacementRpc.indexOf("insert into public.registrations")).toBeLessThan(
      replacementRpc.indexOf("current_elo = p_relic_elo")
    );
    expect(replacementRpc).toContain(
      "if not found then raise exception 'registration identity is unavailable'; end if; return next;"
    );
    expect(
      replacementRpc.replace("current_elo = p_relic_elo, ", "")
    ).toBe(previousRpc);
    expect(migration.startsWith("begin;")).toBe(true);
    expect(migration.endsWith("commit;")).toBe(true);
    expect(migration).not.toContain(
      "create or replace function public.protect_relic_registration_snapshot"
    );
    expect(migration).not.toMatch(
      /(?:update|delete from) public\.registrations/
    );
  });

  it("blocks direct authenticated and service-role protected-field changes", () => {
    const triggerFunction = extractFunctionBody(
      migration,
      "protect_player_relic_verification()"
    );

    expect(triggerFunction).toContain("security invoker");
    expect(triggerFunction).toContain(
      "if current_user = 'postgres' and coalesce(auth.role(), '') = 'service_role' then return new;"
    );
    expect(triggerFunction).not.toContain(
      "if coalesce(auth.role(), '') = 'service_role' then return new;"
    );

    for (const column of [
      "current_elo",
      "relic_verified_elo",
      "relic_verified_faction",
      "relic_verified_division",
      "relic_elo_calculation_version",
      "relic_elo_verified_at",
      "relic_elo_last_attempt_at",
    ]) {
      expect(triggerFunction).toContain(`new.${column}`);
      expect(triggerFunction).toContain(`old.${column}`);
    }

    expect(triggerFunction).toContain("errcode = '42501'");
    expect(triggerFunction).toContain(
      "message = 'relic verification fields are server-controlled'"
    );
    expect(migration).toContain(
      "revoke all on function public.protect_player_relic_verification() from public, anon, authenticated, service_role;"
    );
    expect(migration).toContain(
      "create trigger players_protect_relic_verification before insert or update on public.players"
    );
  });

  it("backfills only complete valid integer-compatible Relic snapshots", () => {
    const backfillStart = migration.indexOf(
      "update public.players as player set current_elo = player.relic_verified_elo::integer where"
    );
    const backfillEnd = migration.indexOf("with completion as (", backfillStart);
    const backfill = migration.slice(backfillStart, backfillEnd);

    expect(backfillStart).toBeGreaterThan(-1);
    expect(backfill).toContain(
      "player.relic_verified_elo between 0 and 5000"
    );
    expect(backfill).toContain("player.relic_verified_faction in (");
    expect(backfill).toContain(
      "player.relic_verified_division = case"
    );
    expect(backfill).toContain(
      "nullif(btrim(player.relic_elo_calculation_version), '') is not null"
    );
    expect(backfill).toContain(
      "player.relic_elo_verified_at is not null"
    );
    expect(backfill).toContain(
      "nullif(btrim(player.steam_id64), '') is not null"
    );
    expect(backfill).toContain(
      "player.current_elo::bigint is distinct from player.relic_verified_elo"
    );
    expect(backfill).not.toContain("set current_elo = null");
  });

  it("recomputes stored completion from only the revised existing criteria", () => {
    const completionStart = migration.indexOf("with completion as (");
    const completionEnd = migration.indexOf(
      "create or replace function public.protect_player_relic_verification()",
      completionStart
    );
    const completion = migration.slice(completionStart, completionEnd);

    for (const column of [
      "avatar_url",
      "display_name",
      "in_game_name",
      "discord_username",
      "steam_username",
      "country",
      "region",
      "timezone",
    ]) {
      expect(completion).toContain(`player.${column}`);
    }

    expect(completion).toContain(
      "nullif(btrim(player.display_name), '') is not null or nullif(btrim(player.in_game_name), '') is not null"
    );
    expect(completion).not.toContain("current_elo");
    expect(completion).not.toContain("coh3_player_card_url");
    expect(completion).not.toContain("steam_id64");
  });

  it("leaves public consumers reading live Current ELO", () => {
    expect(publicPlayersLoader).toContain('"current_elo"');
    expect(publicPlayersLoader).toContain("currentelo: row.current_elo");
    expect(publicLeaderboardLoader).toContain("currentelo: row.current_elo");
  });
});
