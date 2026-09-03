import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  APPROVED_FIXTURES,
  PRODUCTION_SUPABASE_REF,
  STAGING_SUPABASE_REF,
} from "../../scripts/lib/staging-synthetic-uat.mjs";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260824100000_staging_synthetic_uat_fixtures.sql"
);
const migration = readFileSync(migrationPath, "utf8").replace(/\r\n/g, "\n");
const registrationAction = readFileSync(
  resolve(process.cwd(), "app/tournaments/actions.ts"),
  "utf8"
);
const registrationEloAdapter = readFileSync(
  resolve(
    process.cwd(),
    "lib/elo-verification/staging-synthetic-academy.ts"
  ),
  "utf8"
);
const databaseContract = readFileSync(
  resolve(
    process.cwd(),
    "tests/database/staging-synthetic-uat-fixtures.sql"
  ),
  "utf8"
).replace(/\r\n/g, "\n");

function canonicalizeSql(value: string) {
  return value
    .toLowerCase()
    .replace(/--[^\n]*/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*([(),;])\s*/g, "$1")
    .trim();
}

function expectCanonicalSqlToContain(source: string, expected: string) {
  expect(canonicalizeSql(source)).toContain(canonicalizeSql(expected));
}

function extractFunction(functionName: string) {
  const patterns = [
    `create function ${functionName.toLowerCase()}(`,
    `create or replace function ${functionName.toLowerCase()}(`,
  ];
  const lowerMigration = migration.toLowerCase();
  const start = patterns
    .map((pattern) => lowerMigration.indexOf(pattern))
    .find((index) => index >= 0);

  expect(start, `${functionName} must be defined by the fixture migration`).toBeGreaterThanOrEqual(0);

  const end = lowerMigration.indexOf("$$;", start);
  expect(end, `${functionName} must have a complete function body`).toBeGreaterThan(start ?? -1);

  return migration.slice(start, end + 3);
}

const canonicalMigration = canonicalizeSql(migration);

describe("Staging synthetic UAT migration security boundary", () => {
  it("requires the exact Staging JWT ref and a Staging-only Vault secret", () => {
    const guard = extractFunction(
      "ironclad_private.assert_staging_synthetic_uat_access"
    );

    expect(guard).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(guard).toContain(
      `coalesce(auth.jwt() ->> 'ref', '') <> '${STAGING_SUPABASE_REF}'`
    );
    expect(guard).toContain("from vault.decrypted_secrets");
    expect(guard).toContain(
      "secret.name = 'ironclad_staging_synthetic_uat_fixture_secret'"
    );
    expect(guard).toContain("char_length(v_fixture_secret) < 32");
    expect(migration).not.toContain(PRODUCTION_SUPABASE_REF);
  });

  it("keeps both provenance tables forced-RLS with no direct role grants", () => {
    for (const table of [
      "ironclad_private.staging_synthetic_uat_players",
      "ironclad_private.staging_synthetic_uat_enrolments",
    ]) {
      expect(canonicalMigration).toContain(`create table ${table}`);
      expect(canonicalMigration).toContain(
        `alter table ${table} enable row level security;`
      );
      expect(canonicalMigration).toContain(
        `alter table ${table} force row level security;`
      );
      expect(canonicalMigration).toContain(
        `revoke all on table ${table} from public,anon,authenticated,service_role;`
      );
      expect(canonicalMigration).not.toContain(`grant select on ${table}`);
      expect(canonicalMigration).not.toContain(`grant all on ${table}`);
    }
  });

  it("grants fixture RPC execution only to service_role", () => {
    const signatures = [
      "public.provision_staging_synthetic_uat_player(text,text,text)",
      "public.inspect_staging_synthetic_uat_player(text,text)",
      "public.enrol_staging_synthetic_uat_player(text,text,uuid,uuid,boolean)",
      "public.cleanup_staging_synthetic_uat_enrolment(text,text,uuid)",
    ];

    for (const signature of signatures) {
      expectCanonicalSqlToContain(
        migration,
        `revoke all on function ${signature} from public,anon,authenticated,service_role;`
      );
      expectCanonicalSqlToContain(
        migration,
        `grant execute on function ${signature} to service_role;`
      );
      expect(canonicalMigration).not.toMatch(
        new RegExp(
          `grant execute on function ${signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} to (?:public|anon|authenticated);`
        )
      );
    }
  });

  it("keeps the SQL fixture catalogue exactly aligned with the CLI catalogue", () => {
    const catalogueFunction = extractFunction(
      "ironclad_private.staging_synthetic_uat_alias_definition"
    );
    const sqlCatalogue = Array.from(
      catalogueFunction.matchAll(
        /\('(Test(?:Academy|Challenge|Main)(?:[1-9]|10))',\s*(\d+),\s*'(Academy|Challenge|Main \/ Pro)'\)/g
      ),
      ([, alias, elo, division]) => ({
        alias,
        syntheticElo: Number(elo),
        syntheticDivision: division,
      })
    );
    const cliCatalogue = Object.values(APPROVED_FIXTURES).map(
      ({ alias, syntheticElo, syntheticDivision }) => ({
        alias,
        syntheticElo,
        syntheticDivision,
      })
    );

    expect(sqlCatalogue).toEqual(cliCatalogue);
    expect(sqlCatalogue).toHaveLength(30);
  });
});

describe("Staging synthetic UAT truthfulness and evidence", () => {
  it("keeps public provider identity and live-provider result facts null", () => {
    const playerGuard = extractFunction(
      "public.guard_staging_synthetic_uat_player"
    );
    const provision = extractFunction(
      "public.provision_staging_synthetic_uat_player"
    );
    const registrationGuard = extractFunction(
      "public.guard_staging_synthetic_uat_registration"
    );

    for (const field of [
      "steam_id64",
      "steam_username",
      "coh3_profile_id",
      "coh3_player_card_url",
      "current_elo",
      "relic_verified_elo",
      "relic_verified_faction",
      "relic_verified_division",
      "relic_elo_calculation_version",
      "relic_elo_verified_at",
      "relic_elo_last_attempt_at",
    ]) {
      expect(playerGuard).toContain(`new.${field} is not null`);
      expect(provision).toMatch(
        new RegExp(`\\b${field}\\s*=\\s*null`, "i")
      );
    }

    for (const field of [
      "steam_name",
      "coh3_player_card_url",
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
      expect(registrationGuard).toContain(`new.${field} is not null`);
    }

    expect(migration).toContain("new.elo_status := 'manual_review'");
    expect(migration).toMatch(
      /new\.submitted_elo\s*:=\s*v_fixture(?:_synthetic_elo|\.synthetic_elo)/
    );
  });

  it("uses separate private synthetic evidence without fabricating legal acceptance", () => {
    const acceptanceGuard = extractFunction(
      "public.require_registration_acceptance_on_commit"
    );

    expect(acceptanceGuard).toContain("from public.registration_acceptances");
    expect(acceptanceGuard).toContain(
      "from ironclad_private.staging_synthetic_uat_enrolments"
    );
    expect(acceptanceGuard).toContain(
      "if v_has_canonical_acceptance = v_has_fixture_evidence then"
    );
    expect(acceptanceGuard).toContain(
      "fixture.steam_openid_verified is false"
    );
    expect(acceptanceGuard).toContain(
      "fixture.steam_ownership_verified is false"
    );
    expect(acceptanceGuard).toContain(
      "fixture.relic_live_lookup_verified is false"
    );
    expect(acceptanceGuard).toContain(
      "fixture.linked_steam_legal_confirmation is false"
    );
    expect(migration).not.toMatch(
      /insert\s+into\s+public\.registration_acceptances/i
    );
  });

  it("does not replace the real registration RPC or remove the real Relic fallback", () => {
    expect(migration).not.toMatch(
      /create(?:\s+or\s+replace)?\s+function\s+public\.submit_verified_player_registration\s*\(/i
    );
    expect(registrationAction).toContain(
      "relicResult = await getRegistrationRelic1v1Elo({"
    );
    expect(registrationEloAdapter).toContain(
      "return getRelic1v1Elo(identity.steamId64)"
    );
    expect(registrationAction).toContain(
      '"submit_verified_player_registration"'
    );
    expect(registrationAction).toContain("p_relic_elo: relicResult.elo");
    expect(registrationAction).not.toContain(
      "enrol_staging_synthetic_uat_player"
    );
  });

  it("leaves normal registration inserts and trusted account closure intact", () => {
    const registrationGuard = extractFunction(
      "public.guard_staging_synthetic_uat_registration"
    );
    const historyPredicate = extractFunction(
      "public.player_has_authoritative_competition_history"
    );

    expect(registrationGuard).toContain(
      "new.registration_provenance is distinct from"
    );
    expect(registrationGuard).toContain(
      "if coalesce(current_setting('ironclad.account_closure', true), '') = 'on'"
    );
    expect(historyPredicate).toContain(
      "from ironclad_private.staging_synthetic_uat_players"
    );
    expect(databaseContract).toContain(
      "public.close_ironclad_player_account"
    );
    expect(databaseContract).toContain("'pseudonymized'");
  });
});

describe("Staging synthetic UAT capacity, waitlist, and cleanup", () => {
  it("preserves bracket locking, capacity, confirmation, FIFO, and idempotency", () => {
    const enrol = extractFunction(
      "public.enrol_staging_synthetic_uat_player"
    );

    expectCanonicalSqlToContain(
      enrol,
      "where fixture.approved_alias = p_alias for update;"
    );
    expectCanonicalSqlToContain(
      enrol,
      "where player.id = v_fixture.player_id for update;"
    );
    expect(enrol).toContain("for update of bracket");
    expect(enrol).toContain("v_tournament_status is null");
    expect(enrol).toContain(
      "perform public.reconcile_tournament_waitlist(p_tournament_bracket_id)"
    );
    expect(enrol).toContain("v_required_count := least(v_max_players, 8)");
    expect(enrol).toContain(
      "v_active_count + v_offered_count >= v_required_count"
    );
    expect(enrol).toContain("or v_waiting_count > 0");
    expect(enrol).toContain(
      "and coalesce(p_waitlist_confirmed, false) is false"
    );
    expect(enrol).toContain(
      "case when v_requires_waitlist then 'waitlisted' else 'pending' end"
    );
    expect(enrol).toContain("(candidate.created_at, candidate.id)");
    expect(enrol).toContain("v_existing.registration_provenance");
    expect(enrol).toContain("v_existing.fixture_contract_version");
    expect(enrol).toContain("false;");
  });

  it("deletes only an unlaunched, history-free fixture enrolment and preserves the player", () => {
    const cleanup = extractFunction(
      "public.cleanup_staging_synthetic_uat_enrolment"
    );
    const historyGuard = extractFunction(
      "public.protect_registration_history_delete"
    );

    expect(cleanup).toContain("v_bracket_launched_at is not null");
    expect(cleanup).toContain("v_tournament_status is null");
    expect(cleanup).toContain("from public.tournament_matches");
    expect(cleanup).toContain("from public.tournament_standings");
    expect(cleanup).toContain("'ironclad.staging_synthetic_uat_cleanup'");
    expect(cleanup).toContain("delete from public.registrations");
    expect(cleanup).toContain(
      "perform public.reset_unlaunched_tournament_bracket_draft"
    );
    expect(cleanup).toContain("perform public.reconcile_tournament_waitlist");
    expect(cleanup).not.toMatch(/delete\s+from\s+public\.players/i);

    expect(historyGuard).toContain(
      "current_setting('ironclad.staging_synthetic_uat_cleanup', true)"
    );
    expect(historyGuard).toContain("coalesce(auth.role(), '') = 'service_role'");
    expect(historyGuard).toContain(
      "old.registration_provenance = 'staging_synthetic_uat'"
    );
  });

  it("ships a rollback-only executable Staging database contract", () => {
    expect(databaseContract).not.toMatch(/^\\/m);
    expect(databaseContract).toContain("begin;");
    expect(databaseContract).toContain("rollback;");
    expect(databaseContract).toContain(
      `\"ref\":\"${STAGING_SUPABASE_REF}\"`
    );
    expect(databaseContract).toContain("from vault.decrypted_secrets");
    expect(databaseContract).toContain(
      "public.provision_staging_synthetic_uat_player"
    );
    expect(databaseContract).toContain(
      "public.enrol_staging_synthetic_uat_player"
    );
    expect(databaseContract).toContain(
      "public.cleanup_staging_synthetic_uat_enrolment"
    );
    expect(databaseContract).toContain(
      "set constraints registrations_require_acceptance immediate"
    );
    expect(databaseContract).toContain("'zero_residue', true");
    expect(databaseContract).not.toContain(
      "STAGING_SYNTHETIC_UAT_FIXTURE_SECRET"
    );
  });
});
