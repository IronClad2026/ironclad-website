import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260804090000_relic_profile_verification.sql"
  ),
  "utf8"
);
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
const leaderboardFoundation = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260624090000_leaderboard_foundation.sql"
  ),
  "utf8"
)
  .toLowerCase()
  .replace(/\s+/g, " ")
  .trim();

const relicColumns = [
  "relic_verified_elo",
  "relic_verified_faction",
  "relic_verified_division",
  "relic_elo_calculation_version",
  "relic_elo_verified_at",
  "relic_elo_last_attempt_at",
] as const;

function extractFunctionBody(functionName: string) {
  const start = compactMigration.indexOf(
    `create or replace function public.${functionName}`
  );
  const end = compactMigration.indexOf("$$;", start);

  if (start < 0 || end < 0) {
    throw new Error(`${functionName} body was not found.`);
  }

  return compactMigration.slice(start, end + 3);
}

describe("Relic profile verification migration contract", () => {
  it("adds exactly the six nullable player fields without a generic verification table", () => {
    expect(compactMigration).toContain(
      "add column if not exists relic_verified_elo bigint"
    );
    expect(compactMigration).toContain(
      "add column if not exists relic_verified_faction text"
    );
    expect(compactMigration).toContain(
      "add column if not exists relic_verified_division text"
    );
    expect(compactMigration).toContain(
      "add column if not exists relic_elo_calculation_version text"
    );
    expect(compactMigration).toContain(
      "add column if not exists relic_elo_verified_at timestamptz"
    );
    expect(compactMigration).toContain(
      "add column if not exists relic_elo_last_attempt_at timestamptz"
    );
    expect(compactMigration).not.toMatch(/create table/);
    expect(compactMigration).not.toContain("raw_payload");
    expect(compactMigration).not.toContain("error_history");
    expect(compactMigration).not.toContain("verification_status");
  });

  it("constrains the normalized successful snapshot and keeps attempt time independent", () => {
    expect(compactMigration).toContain(
      "relic_verified_elo between 0 and 9007199254740991"
    );

    for (const faction of [
      "us forces",
      "british forces",
      "deutsches afrikakorps",
      "wehrmacht",
    ]) {
      expect(compactMigration).toContain(`'${faction}'`);
    }

    for (const division of ["academy", "challenge", "main / pro"]) {
      expect(compactMigration).toContain(`'${division}'`);
    }

    expect(compactMigration).toContain(
      "char_length(btrim(relic_elo_calculation_version)) > 0"
    );
    expect(compactMigration).toContain(
      "num_nonnulls( relic_verified_elo, relic_verified_faction, relic_verified_division, relic_elo_calculation_version, relic_elo_verified_at ) in (0, 5)"
    );

    const snapshotConstraint = compactMigration.slice(
      compactMigration.indexOf("players_relic_verified_snapshot_check"),
      compactMigration.indexOf("end; $$;", compactMigration.indexOf("players_relic_verified_snapshot_check"))
    );
    expect(snapshotConstraint).not.toContain("relic_elo_last_attempt_at");
  });

  it("forces browser inserts to null and preserves every protected value on browser updates", () => {
    const triggerFunction = extractFunctionBody(
      "protect_player_relic_verification()"
    );

    expect(triggerFunction).toContain(
      "if coalesce(auth.role(), '') = 'service_role' then return new;"
    );

    for (const column of relicColumns) {
      expect(triggerFunction).toContain(`new.${column} = null;`);
      expect(triggerFunction).toContain(`new.${column} = old.${column};`);
    }

    expect(compactMigration).toContain(
      "create trigger players_protect_relic_verification before insert or update on public.players for each row execute function public.protect_player_relic_verification();"
    );
    expect(compactMigration).toContain(
      "revoke execute on function public.protect_player_relic_verification() from public, anon, authenticated;"
    );
  });

  it("uses one service-role-only atomic database-time cooldown claim", () => {
    const claimFunction = extractFunctionBody(
      "claim_relic_elo_verification_attempt("
    );

    expect(claimFunction).toContain(
      "if coalesce(auth.role(), '') <> 'service_role' then raise exception 'not authorized';"
    );
    expect(claimFunction).toContain("v_claimed_at timestamptz := clock_timestamp()");
    expect(claimFunction).toContain("set search_path = pg_catalog");
    expect(claimFunction).toContain(
      "set relic_elo_last_attempt_at = v_claimed_at"
    );
    expect(claimFunction).toContain("player.id = p_player_id");
    expect(claimFunction).toContain(
      "player.clerk_user_id = p_clerk_user_id"
    );
    expect(claimFunction).toContain("p_steam_id64 is not null");
    expect(claimFunction).toContain("player.steam_id64 = p_steam_id64");
    expect(claimFunction).toContain("interval '15 minutes'");
    expect(claimFunction).toContain(
      "returning player.relic_elo_last_attempt_at"
    );

    for (const successfulColumn of relicColumns.slice(0, 5)) {
      expect(claimFunction).not.toContain(`set ${successfulColumn}`);
    }

    expect(compactMigration).toContain(
      "revoke all on function public.claim_relic_elo_verification_attempt( uuid, text, text ) from public, anon, authenticated;"
    );
    expect(compactMigration).toContain(
      "grant execute on function public.claim_relic_elo_verification_attempt( uuid, text, text ) to service_role;"
    );
  });

  it("keeps protected fields out of browser reads and public projections", () => {
    const authenticatedSelectGrant = compactMigration.match(
      /grant select \((.*?)\) on table public\.players to authenticated;/
    )?.[1];

    expect(authenticatedSelectGrant).toBeDefined();
    expect(authenticatedSelectGrant).not.toContain("steam_id64");

    for (const column of relicColumns) {
      expect(authenticatedSelectGrant).not.toContain(column);
      expect(publicPlayerProjection).not.toContain(column);
      expect(leaderboardFoundation).not.toContain(column);
    }

    expect(compactMigration).not.toContain("public_player_profiles");
    expect(compactMigration).not.toContain("leaderboard_");
  });

  it("grants only the service role direct updates and leaves legacy contracts unchanged", () => {
    expect(compactMigration).toContain(
      "grant update ( relic_verified_elo, relic_verified_faction, relic_verified_division, relic_elo_calculation_version, relic_elo_verified_at, relic_elo_last_attempt_at ) on table public.players to service_role;"
    );

    for (const table of [
      "registrations",
      "tournaments",
      "tournament_brackets",
      "tournament_matches",
      "leaderboard_point_events",
    ]) {
      expect(compactMigration).not.toContain(`public.${table}`);
    }

    expect(compactMigration).not.toContain("set current_elo");
    expect(compactMigration).not.toContain("new.current_elo");
    expect(compactMigration).not.toContain("coh3stats");
  });
});
