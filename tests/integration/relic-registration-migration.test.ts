import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260804100000_relic_registration_snapshot.sql"
  ),
  "utf8"
);
const compactMigration = migration.toLowerCase().replace(/\s+/g, " ").trim();
const correctionMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260805124000_drop_obsolete_registration_rpc.sql"
  ),
  "utf8"
);
const compactCorrectionMigration = correctionMigration
  .toLowerCase()
  .replace(/\s+/g, " ")
  .trim();
const phase4Migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260806130000_phase4_withdrawal_waitlist_division_launch.sql"
  ),
  "utf8"
);
const compactPhase4Migration = phase4Migration
  .toLowerCase()
  .replace(/\s+/g, " ")
  .trim();
const registrationAction = readFileSync(
  resolve(process.cwd(), "app/tournaments/actions.ts"),
  "utf8"
);

function normalizedSha256(value: string) {
  return createHash("sha256")
    .update(value.replace(/\r\n/g, "\n"))
    .digest("hex");
}

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

describe("Relic tournament registration migration contract", () => {
  it("drops only the obsolete five-argument RPC and uses the latest approved contract", () => {
    expect(compactCorrectionMigration).toBe(
      "begin; drop function if exists public.submit_verified_player_registration( uuid, text, uuid, uuid, text ); commit;"
    );
    expect(compactCorrectionMigration).toContain("drop function if exists");
    expect(compactCorrectionMigration).not.toContain("cascade");

    for (const forbiddenStatement of [
      "insert ",
      "update ",
      "delete ",
      "alter table",
      "create table",
      "create policy",
      "alter policy",
      "drop policy",
    ]) {
      expect(compactCorrectionMigration).not.toContain(forbiddenStatement);
    }

    expect(compactCorrectionMigration).not.toContain(
      "submit_verified_player_registration( uuid, text, text, uuid, uuid, bigint, text, text, text )"
    );
    expect(normalizedSha256(migration)).toBe(
      "5532ec5acd6d63505274482ee5e5662f4d713565037682c064fc09db8e92a278"
    );
    expect(compactPhase4Migration).toContain(
      "drop function if exists public.submit_verified_player_registration( uuid, text, text, uuid, uuid, bigint, text, text, text );"
    );
    expect(compactPhase4Migration).toContain(
      "create function public.submit_verified_player_registration( p_profile_id uuid, p_clerk_user_id text, p_steam_id64 text, p_tournament_id uuid, p_tournament_bracket_id uuid, p_relic_elo bigint, p_relic_faction text, p_relic_division text, p_relic_calculation_version text, p_waitlist_confirmed boolean )"
    );
    expect(compactPhase4Migration).toContain(
      "waitlist_confirmation_required boolean"
    );

    const rpcCalls = [
      ...registrationAction.matchAll(
        /\.rpc\(\s*"submit_verified_player_registration"\s*,\s*\{([\s\S]*?)\}\s*\)/g
      ),
    ];

    expect(rpcCalls).toHaveLength(1);
    expect(
      [...rpcCalls[0][1].matchAll(/\b(p_[a-z0-9_]+)\s*:/g)].map(
        (match) => match[1]
      )
    ).toEqual([
      "p_profile_id",
      "p_clerk_user_id",
      "p_steam_id64",
      "p_tournament_id",
      "p_tournament_bracket_id",
      "p_relic_elo",
      "p_relic_faction",
      "p_relic_division",
      "p_relic_calculation_version",
      "p_waitlist_confirmed",
    ]);
    expect(rpcCalls[0][1]).toMatch(
      /\bp_waitlist_confirmed\s*:\s*input\.waitlistConfirmed\b/
    );
  });

  it("widens the existing ELO snapshot fields and adds only division and calculation version", () => {
    const policyDrop = compactMigration.indexOf(
      'drop policy if exists "players can submit registrations" on public.registrations;'
    );
    const submittedEloWidening = compactMigration.indexOf(
      "alter column submitted_elo type bigint"
    );

    expect(policyDrop).toBeGreaterThanOrEqual(0);
    expect(policyDrop).toBeLessThan(submittedEloWidening);
    expect(compactMigration).toContain(
      "alter column submitted_elo type bigint using submitted_elo::bigint"
    );
    expect(compactMigration).toContain(
      "alter column elo_verified_elo type bigint using elo_verified_elo::bigint"
    );
    expect(compactMigration).toContain(
      "add column if not exists elo_verified_division text"
    );
    expect(compactMigration).toContain(
      "add column if not exists elo_calculation_version text"
    );
    expect(compactMigration).toContain(
      "submitted_elo between 0 and 9007199254740991"
    );
    expect(compactMigration).toContain(
      "elo_verified_elo between 0 and 9007199254740991"
    );
    expect(compactMigration).not.toContain("create table");
    expect(compactMigration).not.toContain("raw_relic");
  });

  it("preserves historical CoH3Stats values while admitting normalized Relic values", () => {
    expect(compactMigration).toContain(
      "elo_verification_source in ('coh3stats', 'relic')"
    );

    for (const faction of [
      "'us'",
      "'british'",
      "'wehrmacht'",
      "'dak'",
      "'us forces'",
      "'british forces'",
      "'deutsches afrikakorps'",
    ]) {
      expect(compactMigration).toContain(faction);
    }

    expect(compactMigration).toContain(
      "elo_verification_source is distinct from 'relic' or ("
    );
  });

  it("requires one complete strict Relic snapshot without legacy payload or identity metadata", () => {
    expect(compactMigration).toContain("elo_status = 'verified'");
    expect(compactMigration).toContain(
      "submitted_elo = elo_verified_elo"
    );
    expect(compactMigration).toContain("elo_checked_mode = '1v1'");
    expect(compactMigration).toContain("elo_checked_at is not null");
    expect(compactMigration).toContain(
      "when elo_verified_elo < 1100 then 'academy' when elo_verified_elo < 1400 then 'challenge' else 'main / pro'"
    );
    expect(compactMigration).toContain(
      "char_length(btrim(elo_calculation_version)) > 0"
    );
    expect(compactMigration).toContain(
      "elo_calculation_version is not null"
    );

    for (const nullableLegacyField of [
      "elo_difference",
      "elo_verification_error",
      "elo_verification_payload",
      "elo_verified_player_name",
      "elo_identity_status",
      "elo_identity_error",
    ]) {
      expect(compactMigration).toContain(`${nullableLegacyField} is null`);
    }
  });

  it("replaces both obsolete RPC overloads with one Relic-only safe return contract", () => {
    expect(compactMigration).toContain(
      "drop function if exists public.submit_verified_player_registration( uuid, text, text, integer, text, uuid, uuid, text )"
    );
    expect(compactMigration).toContain(
      "drop function if exists public.submit_verified_player_registration( uuid, text, text, integer, text, text, uuid, uuid, text )"
    );
    expect(compactMigration).toContain(
      "create or replace function public.submit_verified_player_registration( p_profile_id uuid, p_clerk_user_id text, p_steam_id64 text, p_tournament_id uuid, p_tournament_bracket_id uuid, p_relic_elo bigint, p_relic_faction text, p_relic_division text, p_relic_calculation_version text )"
    );
    expect(compactMigration).toContain(
      "returns table ( id uuid, tournament_id uuid, tournament_bracket_id uuid, registration_status text, submitted_elo bigint )"
    );

    const rpc = extractFunctionBody("submit_verified_player_registration(");
    expect(rpc).not.toContain("p_submitted_elo");
    expect(rpc).not.toContain("p_coh3_player_card_url");
    expect(rpc).not.toContain("p_coh3_profile_id");
    expect(rpc).not.toContain("p_registration_status");
  });

  it("authenticates the protected identity and validates availability at one database timestamp", () => {
    const rpc = extractFunctionBody("submit_verified_player_registration(");

    expect(rpc).toContain(
      "if coalesce(auth.role(), '') <> 'service_role' then raise exception 'not authorized';"
    );
    expect(rpc).toContain("set search_path = pg_catalog");
    expect(rpc).toContain("player.id = p_profile_id");
    expect(rpc).toContain("player.clerk_user_id = p_clerk_user_id");
    expect(rpc).toContain("p_steam_id64 is not null");
    expect(rpc).toContain("player.steam_id64 = p_steam_id64");
    expect(rpc).toContain("for update;");
    expect(rpc).toContain("v_verified_at := clock_timestamp()");
    expect(rpc).toContain("v_registration_enabled is distinct from true");
    expect(rpc).toContain(
      "v_tournament_status is distinct from 'registration_open'"
    );
    expect(rpc).toContain("v_verified_at < v_registration_open_at");
    expect(rpc).toContain("v_verified_at > v_registration_close_at");
  });

  it("schema-qualifies every non-pg_catalog RPC object under the locked search path", () => {
    const rpc = extractFunctionBody("submit_verified_player_registration(");

    for (const reference of [
      "v_player public.players%rowtype",
      "auth.role()",
      "from public.players as player",
      "from public.registrations as registration",
      "from public.tournament_brackets as bracket",
      "join public.tournaments as tournament",
      "insert into public.registrations as inserted",
      "update public.players as player",
    ]) {
      expect(rpc).toContain(reference);
    }

    expect(rpc).not.toMatch(
      /\b(?:from|join|update|insert into)\s+(?:players|registrations|tournaments|tournament_brackets)\b/
    );
  });

  it("assigns and compares the strict Relic division without an inline CASE predicate", () => {
    const rpc = extractFunctionBody("submit_verified_player_registration(");
    const strictDivisionAssignment =
      "v_expected_division := case when p_relic_elo < 1100 then 'academy' when p_relic_elo < 1400 then 'challenge' else 'main / pro' end;";
    const strictDivisionComparison =
      "if p_relic_division is distinct from v_expected_division then raise exception 'registration verification data is invalid'; end if;";

    expect(rpc).toContain("p_relic_elo < 0");
    expect(rpc).toContain("p_relic_elo > 9007199254740991");
    expect(rpc).toContain(strictDivisionAssignment);
    expect(rpc).toContain(strictDivisionComparison);
    expect(rpc).not.toContain("p_relic_division is distinct from case");
    expect(rpc.indexOf(strictDivisionAssignment)).toBeLessThan(
      rpc.indexOf(strictDivisionComparison)
    );
  });

  it("enforces duplicate safety and the canonical strict bracket mapping", () => {
    const rpc = extractFunctionBody("submit_verified_player_registration(");

    expect(rpc).toContain("errcode = '23505'");
    expect(rpc).toContain("message = 'already registered for this tournament'");
    expect(rpc).toContain(
      "case v_bracket_name when 'academy' then 'academy' when 'challenge' then 'challenge' when 'main' then 'main / pro' else null end"
    );
    expect(rpc).toContain(
      "verified elo does not match the selected tournament division"
    );
  });

  it("atomically inserts the complete snapshot and refreshes only the Phase 3B profile result", () => {
    const rpc = extractFunctionBody("submit_verified_player_registration(");

    expect(compactMigration.startsWith("begin;")).toBe(true);
    expect(compactMigration.endsWith("commit;")).toBe(true);
    expect(rpc).toContain("insert into public.registrations as inserted");
    expect(rpc).toContain(
      "p_relic_elo, null, p_relic_faction, '1v1', v_verified_at, 'relic', null, null, null, null, null, p_relic_division, v_calculation_version"
    );
    expect(rpc).not.toContain("v_player.coh3_player_card_url");
    expect(rpc).toContain("update public.players as player set");

    for (const assignment of [
      "relic_verified_elo = p_relic_elo",
      "relic_verified_faction = p_relic_faction",
      "relic_verified_division = p_relic_division",
      "relic_elo_calculation_version = v_calculation_version",
      "relic_elo_verified_at = v_verified_at",
    ]) {
      expect(rpc).toContain(assignment);
    }

    expect(rpc).not.toContain("set current_elo");
    expect(rpc).not.toContain("relic_elo_last_attempt_at");
    expect(rpc).toContain(
      "inserted.registration_status, inserted.submitted_elo into id, tournament_id, tournament_bracket_id, registration_status, submitted_elo"
    );
    expect(rpc.indexOf("insert into public.registrations as inserted")).toBeLessThan(
      rpc.indexOf("update public.players as player set")
    );
    expect(rpc).toContain(
      "if not found then raise exception 'registration identity is unavailable';"
    );
  });

  it("makes the complete Relic verification snapshot immutable", () => {
    const protection = extractFunctionBody(
      "protect_relic_registration_snapshot()"
    );

    for (const column of [
      "submitted_elo",
      "elo_status",
      "elo_verified_elo",
      "elo_difference",
      "elo_highest_faction",
      "elo_checked_mode",
      "elo_checked_at",
      "elo_verification_source",
      "elo_verification_error",
      "elo_verification_payload",
      "elo_verified_player_name",
      "elo_identity_status",
      "elo_identity_error",
      "elo_verified_division",
      "elo_calculation_version",
    ]) {
      expect(protection).toContain(`old.${column}`);
      expect(protection).toContain(`new.${column}`);
    }

    expect(compactMigration).toContain(
      "create trigger registrations_protect_relic_snapshot before update on public.registrations for each row execute function public.protect_relic_registration_snapshot();"
    );
  });

  it("permanently binds a Relic registration to its accepted tournament and bracket", () => {
    const protection = extractFunctionBody(
      "protect_relic_registration_snapshot()"
    );

    expect(protection).toContain("old.tournament_id");
    expect(protection).toContain("new.tournament_id");
    expect(protection).toContain("old.tournament_bracket_id");
    expect(protection).toContain("new.tournament_bracket_id");
  });

  it("allows lifecycle updates while service_role cannot bypass immutability", () => {
    const protection = extractFunctionBody(
      "protect_relic_registration_snapshot()"
    );

    expect(protection).not.toContain("auth.role");
    expect(protection).not.toContain("old.registration_status");
    expect(protection).not.toContain("old.admin_notes");
    expect(compactMigration).toContain(
      "create trigger registrations_protect_relic_snapshot before update on public.registrations for each row execute function public.protect_relic_registration_snapshot();"
    );
  });

  it("lets any RPC failure roll back both the registration and profile snapshot writes", () => {
    const rpc = extractFunctionBody("submit_verified_player_registration(");
    const insertIndex = rpc.indexOf(
      "insert into public.registrations as inserted"
    );
    const profileUpdateIndex = rpc.indexOf("update public.players as player set");
    const updateFailureIndex = rpc.indexOf(
      "if not found then raise exception 'registration identity is unavailable';",
      profileUpdateIndex
    );
    const successIndex = rpc.indexOf("return next;");

    expect(insertIndex).toBeGreaterThanOrEqual(0);
    expect(profileUpdateIndex).toBeGreaterThan(insertIndex);
    expect(updateFailureIndex).toBeGreaterThan(profileUpdateIndex);
    expect(successIndex).toBeGreaterThan(updateFailureIndex);
    expect(rpc).not.toContain("exception when");
    expect(rpc.match(/return next;/g)).toHaveLength(1);
  });

  it("uses frozen Relic eligibility while retaining the legacy current-ELO branch", () => {
    const eligibility = extractFunctionBody(
      "enforce_registration_elo_eligibility()"
    );
    const rosterGuard = extractFunctionBody(
      "preserve_tournament_bracket_roster_invariants()"
    );

    expect(eligibility).toContain(
      "if new.elo_verification_source = 'relic' then"
    );
    expect(eligibility).toContain(
      "new.submitted_elo is distinct from new.elo_verified_elo"
    );
    expect(eligibility).not.toContain(
      "new.submitted_elo := new.elo_verified_elo"
    );
    expect(eligibility).toContain("select player.current_elo");

    expect(rosterGuard).toContain(
      "when registration.elo_verification_source = 'relic' then registration.elo_verified_elo"
    );
    expect(rosterGuard).toContain(
      "when registration.elo_verification_source = 'relic' then registration.elo_verified_division"
    );
    expect(rosterGuard).toContain("player.current_elo");
  });

  it("removes direct registration inserts and exposes only the atomic service RPC", () => {
    expect(compactMigration).toContain(
      'drop policy if exists "players can submit registrations" on public.registrations;'
    );
    expect(compactMigration).toContain(
      "revoke insert on table public.registrations from public, anon, authenticated, service_role;"
    );
    expect(compactMigration).toContain(
      "revoke all on function public.submit_verified_player_registration( uuid, text, text, uuid, uuid, bigint, text, text, text ) from public, anon, authenticated;"
    );
    expect(compactMigration).toContain(
      "grant execute on function public.submit_verified_player_registration( uuid, text, text, uuid, uuid, bigint, text, text, text ) to service_role;"
    );
    expect(compactMigration).toContain(
      "revoke execute on function public.preserve_tournament_bracket_roster_invariants() from public, anon, authenticated;"
    );
    expect(compactMigration).toContain(
      "grant execute on function public.preserve_tournament_bracket_roster_invariants() to service_role;"
    );
  });

  it("leaves waitlist, capacity, approval, bracket generation, and lifecycle activation unchanged", () => {
    for (const untouchedFunction of [
      "enforce_tournament_registration_availability",
      "get_tournament_bracket_capacity",
      "refresh_generated_bracket_on_approval",
      "generate_tournament_bracket",
      "save_bracket_assignments",
      "recompute_tournament_lifecycle_status",
    ]) {
      expect(compactMigration).not.toContain(
        `create or replace function public.${untouchedFunction}`
      );
    }

    expect(compactMigration).not.toContain("public.generated_brackets");
  });
});
